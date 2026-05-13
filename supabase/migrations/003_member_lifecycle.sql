-- ─────────────────────────────────────────────────────────────────────────────
-- 003_member_lifecycle — Leave / Remove / Role management
--
-- What this adds:
--   • removed_at / removed_by columns on group_members
--   • Updated is_group_member() to exclude removed members
--   • is_group_admin() helper
--   • 4 SECURITY DEFINER RPCs: leave_group, remove_member,
--     transfer_admin_and_leave, update_member_role
--   • Trigger: ensure_group_has_admin (auto-promote safety net)
--   • Tightened group_members UPDATE RLS policy
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. Schema additions ─────────────────────────────────────────────────────

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS removed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by  UUID REFERENCES public.users(id);

-- Partial index for hot path: active members only
CREATE INDEX IF NOT EXISTS idx_group_members_active_v2
  ON public.group_members (group_id)
  WHERE left_at IS NULL AND removed_at IS NULL;


-- ─── 2. Update is_group_member to exclude removed members ────────────────────

CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = gid
      AND user_id    = auth.uid()
      AND left_at    IS NULL
      AND removed_at IS NULL
  );
$$;


-- ─── 3. Helper: is_group_admin ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_group_admin(gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = gid
      AND user_id    = auth.uid()
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  );
$$;


-- ─── 4. RPC: leave_group ─────────────────────────────────────────────────────
-- Any active member can leave.
-- Blocked if: sole active admin AND other active members remain.
-- Auto-archives the group if the last member leaves.

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID    := auth.uid();
  v_is_admin       BOOLEAN;
  v_admin_count    INTEGER;
  v_other_count    INTEGER;
BEGIN
  -- Must be an active member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = v_user_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  -- Check role
  SELECT (role = 'admin') INTO v_is_admin
  FROM group_members
  WHERE group_id = p_group_id AND user_id = v_user_id;

  IF v_is_admin THEN
    SELECT COUNT(*)::INTEGER INTO v_admin_count
    FROM group_members
    WHERE group_id   = p_group_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL;

    SELECT COUNT(*)::INTEGER INTO v_other_count
    FROM group_members
    WHERE group_id   = p_group_id
      AND user_id   <> v_user_id
      AND left_at    IS NULL
      AND removed_at IS NULL;

    -- Block: sole admin with remaining members
    IF v_admin_count = 1 AND v_other_count > 0 THEN
      RAISE EXCEPTION 'SOLE_ADMIN';
    END IF;
  END IF;

  -- Mark as left
  UPDATE group_members
  SET left_at = now()
  WHERE group_id = p_group_id AND user_id = v_user_id;

  -- Auto-archive if group is now empty
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    UPDATE groups SET archived_at = now() WHERE id = p_group_id;
  END IF;
END;
$$;


-- ─── 5. RPC: remove_member ───────────────────────────────────────────────────
-- Admins only. Cannot remove self (use leave_group).
-- Blocked if target is the last active admin.

CREATE OR REPLACE FUNCTION public.remove_member(
  p_group_id  UUID,
  p_target_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id    UUID    := auth.uid();
  v_target_role TEXT;
  v_admin_count INTEGER;
BEGIN
  -- Actor must be active admin
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = v_actor_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  -- Cannot remove yourself via this RPC
  IF v_actor_id = p_target_id THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_SELF';
  END IF;

  -- Target must be an active member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = p_target_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TARGET_NOT_MEMBER';
  END IF;

  SELECT role INTO v_target_role
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_target_id;

  -- If target is admin, at least one admin must remain after removal
  IF v_target_role = 'admin' THEN
    SELECT COUNT(*)::INTEGER INTO v_admin_count
    FROM group_members
    WHERE group_id   = p_group_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN';
    END IF;
  END IF;

  UPDATE group_members
  SET removed_at = now(),
      removed_by = v_actor_id
  WHERE group_id = p_group_id AND user_id = p_target_id;
END;
$$;


-- ─── 6. RPC: transfer_admin_and_leave ────────────────────────────────────────
-- Promote a chosen member to admin then leave — atomic, no orphaned group.

CREATE OR REPLACE FUNCTION public.transfer_admin_and_leave(
  p_group_id     UUID,
  p_new_admin_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
BEGIN
  -- Actor must be active admin
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = v_actor_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  IF v_actor_id = p_new_admin_id THEN
    RAISE EXCEPTION 'CANNOT_TRANSFER_TO_SELF';
  END IF;

  -- New admin must be an active member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = p_new_admin_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TARGET_NOT_MEMBER';
  END IF;

  -- Promote
  UPDATE group_members
  SET role = 'admin'
  WHERE group_id = p_group_id AND user_id = p_new_admin_id;

  -- Leave
  UPDATE group_members
  SET left_at = now()
  WHERE group_id = p_group_id AND user_id = v_actor_id;
END;
$$;


-- ─── 7. RPC: update_member_role ──────────────────────────────────────────────
-- Admins can promote/demote any active member.
-- Blocked if demoting the last active admin.

CREATE OR REPLACE FUNCTION public.update_member_role(
  p_group_id  UUID,
  p_target_id UUID,
  p_new_role  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id    UUID    := auth.uid();
  v_admin_count INTEGER;
BEGIN
  -- Validate role value
  IF p_new_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;

  -- Actor must be active admin
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = v_actor_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  -- Target must be active member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = p_target_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TARGET_NOT_MEMBER';
  END IF;

  -- If demoting, ensure at least one admin remains
  IF p_new_role = 'member' THEN
    SELECT COUNT(*)::INTEGER INTO v_admin_count
    FROM group_members
    WHERE group_id   = p_group_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN';
    END IF;
  END IF;

  UPDATE group_members
  SET role = p_new_role
  WHERE group_id = p_group_id AND user_id = p_target_id;
END;
$$;


-- ─── 8. Trigger: ensure_group_has_admin ──────────────────────────────────────
-- Safety net: if an update leaves a non-archived group with zero active admins,
-- auto-promote the longest-standing active member.
-- Should almost never fire; protects against manual DB edits / race conditions.

CREATE OR REPLACE FUNCTION public.ensure_group_has_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oldest_member UUID;
BEGIN
  -- Only care about non-archived groups
  IF NOT EXISTS (
    SELECT 1 FROM groups WHERE id = NEW.group_id AND archived_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- If at least one active admin still exists, nothing to do
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = NEW.group_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Promote oldest active member
  SELECT user_id INTO v_oldest_member
  FROM group_members
  WHERE group_id   = NEW.group_id
    AND left_at    IS NULL
    AND removed_at IS NULL
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_oldest_member IS NOT NULL THEN
    UPDATE group_members
    SET role = 'admin'
    WHERE group_id = NEW.group_id AND user_id = v_oldest_member;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_group_has_admin ON public.group_members;
CREATE TRIGGER trg_ensure_group_has_admin
  AFTER UPDATE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_group_has_admin();


-- ─── 9. Tighten group_members UPDATE policy ──────────────────────────────────
-- All admin operations (remove, role change) go through SECURITY DEFINER RPCs
-- which bypass RLS entirely. Direct client UPDATE is only needed for self
-- (e.g. future profile preferences on the membership row).
-- The old policy allowed any group member to update any other member's row
-- directly, which is too permissive.

DROP POLICY IF EXISTS "group_members_update"      ON public.group_members;
DROP POLICY IF EXISTS "group_members_update_self" ON public.group_members;
DROP POLICY IF EXISTS "group_members_update_admin" ON public.group_members;

CREATE POLICY "group_members_update_self" ON public.group_members
  FOR UPDATE USING (user_id = auth.uid());
