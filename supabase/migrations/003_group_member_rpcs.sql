-- ─────────────────────────────────────────────────────────────────────────────
-- 003_group_member_rpcs — Member management RPCs for Edit Group screen
--
-- Adds:
--   • removed_at / removed_by columns on group_members (if not already present)
--   • leave_group(p_group_id)
--   • remove_member(p_group_id, p_target_id)
--   • update_member_role(p_group_id, p_target_id, p_new_role)
--   • transfer_admin_and_leave(p_group_id, p_new_admin_id)
--
-- All RPCs are SECURITY DEFINER so they bypass RLS and can enforce their own
-- business-logic checks atomically.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. Schema additions ──────────────────────────────────────────────────────

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS removed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by  UUID REFERENCES public.users(id);


-- ─── 2. leave_group ──────────────────────────────────────────────────────────
-- Sets left_at for the caller. Raises:
--   SOLE_ADMIN  — caller is the only admin and there are other members
--                 (frontend must call transfer_admin_and_leave instead)
-- Archives the group if the caller was the last active member.

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_is_admin   bool;
  v_admin_cnt  int;
  v_member_cnt int;
BEGIN
  SELECT (role = 'admin') INTO v_is_admin
  FROM   group_members
  WHERE  group_id = p_group_id AND user_id = v_user_id AND left_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  IF v_is_admin THEN
    SELECT COUNT(*) INTO v_admin_cnt
    FROM   group_members
    WHERE  group_id = p_group_id AND role = 'admin' AND left_at IS NULL;

    SELECT COUNT(*) INTO v_member_cnt
    FROM   group_members
    WHERE  group_id = p_group_id AND left_at IS NULL;

    IF v_admin_cnt = 1 AND v_member_cnt > 1 THEN
      RAISE EXCEPTION 'SOLE_ADMIN';
    END IF;
  END IF;

  UPDATE group_members
  SET    left_at = now()
  WHERE  group_id = p_group_id AND user_id = v_user_id AND left_at IS NULL;

  -- Archive if no active members remain
  SELECT COUNT(*) INTO v_member_cnt
  FROM   group_members
  WHERE  group_id = p_group_id AND left_at IS NULL;

  IF v_member_cnt = 0 THEN
    UPDATE groups SET archived_at = now() WHERE id = p_group_id;
  END IF;
END;
$$;


-- ─── 3. remove_member ────────────────────────────────────────────────────────
-- Caller must be admin. Cannot remove self. Cannot remove the last admin.
-- Raises: NOT_ADMIN, LAST_ADMIN

CREATE OR REPLACE FUNCTION public.remove_member(p_group_id uuid, p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_actor_is_admin bool;
  v_target_is_admin bool;
  v_admin_cnt      int;
BEGIN
  SELECT (role = 'admin') INTO v_actor_is_admin
  FROM   group_members
  WHERE  group_id = p_group_id AND user_id = v_user_id AND left_at IS NULL;

  IF NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  SELECT (role = 'admin') INTO v_target_is_admin
  FROM   group_members
  WHERE  group_id = p_group_id AND user_id = p_target_id AND left_at IS NULL;

  IF v_target_is_admin THEN
    SELECT COUNT(*) INTO v_admin_cnt
    FROM   group_members
    WHERE  group_id = p_group_id AND role = 'admin' AND left_at IS NULL;

    IF v_admin_cnt <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN';
    END IF;
  END IF;

  UPDATE group_members
  SET    left_at    = now(),
         removed_at = now(),
         removed_by = v_user_id
  WHERE  group_id = p_group_id AND user_id = p_target_id AND left_at IS NULL;
END;
$$;


-- ─── 4. update_member_role ───────────────────────────────────────────────────
-- Promote or demote a member. Caller must be admin.
-- Raises: NOT_ADMIN, LAST_ADMIN (when demoting the sole active admin)

CREATE OR REPLACE FUNCTION public.update_member_role(
  p_group_id  uuid,
  p_target_id uuid,
  p_new_role  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_actor_is_admin bool;
  v_admin_cnt      int;
BEGIN
  SELECT (role = 'admin') INTO v_actor_is_admin
  FROM   group_members
  WHERE  group_id = p_group_id AND user_id = v_user_id AND left_at IS NULL;

  IF NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  IF p_new_role = 'member' THEN
    SELECT COUNT(*) INTO v_admin_cnt
    FROM   group_members
    WHERE  group_id = p_group_id AND role = 'admin' AND left_at IS NULL;

    IF v_admin_cnt <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN';
    END IF;
  END IF;

  UPDATE group_members
  SET    role = p_new_role
  WHERE  group_id = p_group_id AND user_id = p_target_id AND left_at IS NULL;
END;
$$;


-- ─── 5. transfer_admin_and_leave ─────────────────────────────────────────────
-- Atomically promotes p_new_admin_id then sets left_at for the caller.
-- Used when the sole admin wants to leave.

CREATE OR REPLACE FUNCTION public.transfer_admin_and_leave(
  p_group_id     uuid,
  p_new_admin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  UPDATE group_members
  SET    role = 'admin'
  WHERE  group_id = p_group_id AND user_id = p_new_admin_id AND left_at IS NULL;

  UPDATE group_members
  SET    left_at = now()
  WHERE  group_id = p_group_id AND user_id = v_user_id AND left_at IS NULL;
END;
$$;
