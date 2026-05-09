-- ─────────────────────────────────────────────────────────────────────────────
-- SplitNow — Phase 6: Auth + Subscription schema + RLS
-- Run in Supabase SQL editor AFTER enabling Phone auth in the dashboard.
--
-- Prerequisites:
--   1. Supabase → Authentication → Providers → Phone: enabled
--   2. An SMS provider configured (Twilio / MessageBird / Vonage), OR
--      enable "Disable phone confirmations" for local dev to bypass SMS.
--   3. Run 01_seed.sql first (or comment out the trigger if seeding manually).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Subscription columns on users ────────────────────────────────────────

-- Allow null name so new sign-ups can set it in the profile-setup screen.
ALTER TABLE public.users ALTER COLUMN name DROP NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_plan    TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_plan IN ('free', 'pro', 'teams')),
  ADD COLUMN IF NOT EXISTS subscription_status  TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  ADD COLUMN IF NOT EXISTS subscription_period_end  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS razorpay_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

-- Index for fast subscription status lookups (e.g. feature-gate checks)
CREATE INDEX IF NOT EXISTS users_subscription_plan_idx
  ON public.users (subscription_plan, subscription_status);

-- ─── 2. Trigger: auto-create public.users row on auth sign-up ────────────────
--
-- When Supabase Auth creates a new entry in auth.users (on phone OTP verify),
-- this trigger inserts a matching row in public.users with the same UUID.
-- The profile (name, avatar_color) is completed in the on-boarding screen.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, phone, name, avatar_color, subscription_plan, subscription_status)
  VALUES (
    NEW.id,
    NEW.phone,
    NULL,     -- filled during profile setup
    'green',  -- default; overridden during profile setup
    'free',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ─── 3. Enable RLS on ALL tables (including friendships) ────────────────────

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements       ENABLE ROW LEVEL SECURITY;

-- ─── 4. Helper: is_group_member ──────────────────────────────────────────────
-- SECURITY DEFINER avoids recursion. Checks left_at IS NULL to exclude
-- members who have left the group.

CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid
      AND user_id  = auth.uid()
      AND left_at  IS NULL
  );
$$;

-- ─── 5. SECURITY DEFINER RPCs ────────────────────────────────────────────────
-- Direct inserts on groups/group_members fail because the Supabase JS v2 JWT
-- is not always attached to the first DB request after sign-in.

CREATE OR REPLACE FUNCTION public.create_personal_group(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT gm.group_id INTO v_group_id
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.user_id   = p_user_id
    AND g.group_type = 'personal'
    AND gm.left_at   IS NULL
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN RETURN v_group_id; END IF;

  INSERT INTO groups (name, group_type, created_by)
  VALUES ('Personal', 'personal', p_user_id)
  RETURNING id INTO v_group_id;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, p_user_id, 'admin');

  RETURN v_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_group(
  p_name        text,
  p_cover_emoji text,
  p_group_type  text,
  p_member_ids  uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_group_id uuid;
  v_uid      uuid;
BEGIN
  INSERT INTO groups (name, cover_emoji, group_type, created_by)
  VALUES (p_name, p_cover_emoji, p_group_type, v_user_id)
  RETURNING id INTO v_group_id;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'admin');

  FOREACH v_uid IN ARRAY p_member_ids LOOP
    IF v_uid <> v_user_id THEN
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (v_group_id, v_uid, 'member');
    END IF;
  END LOOP;

  RETURN v_group_id;
END;
$$;

-- ─── 6. RLS policies ─────────────────────────────────────────────────────────

-- ── users ────────────────────────────────────────────────────────────────────

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_select_co_member" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM   group_members gm1
      JOIN   group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE  gm1.user_id = auth.uid()
        AND  gm2.user_id = users.id
        AND  gm1.left_at IS NULL
        AND  gm2.left_at IS NULL
    )
  );

-- Allow any authenticated user to look up another user by invite code
-- (needed before a friendship exists)
CREATE POLICY "users_select_by_invite_code" ON public.users
  FOR SELECT USING (
    invite_code IS NOT NULL AND auth.uid() IS NOT NULL
  );

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── friendships ───────────────────────────────────────────────────────────────

CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT WITH CHECK (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE USING (user_id = auth.uid() OR friend_id = auth.uid());

-- ── groups ───────────────────────────────────────────────────────────────────

CREATE POLICY "groups_select_member" ON public.groups
  FOR SELECT USING (is_group_member(id));

-- INSERT is handled by SECURITY DEFINER RPCs; this is just a safety net
CREATE POLICY "groups_insert" ON public.groups
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "groups_update_member" ON public.groups
  FOR UPDATE USING (is_group_member(id));

CREATE POLICY "groups_delete_creator" ON public.groups
  FOR DELETE USING (created_by = auth.uid());

-- ── group_members ─────────────────────────────────────────────────────────────

CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT USING (is_group_member(group_id));

CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR is_group_member(group_id)
  );

CREATE POLICY "group_members_update" ON public.group_members
  FOR UPDATE USING (
    user_id = auth.uid() OR is_group_member(group_id)
  );

CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE USING (user_id = auth.uid());

-- ── expenses ─────────────────────────────────────────────────────────────────

CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT USING (is_group_member(group_id));

CREATE POLICY "expenses_insert" ON public.expenses
  FOR INSERT WITH CHECK (
    is_group_member(group_id) AND added_by = auth.uid()
  );

-- Any group member can edit/delete (flatmate context)
CREATE POLICY "expenses_update" ON public.expenses
  FOR UPDATE USING (is_group_member(group_id));

CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE USING (is_group_member(group_id));

-- ── expense_splits ────────────────────────────────────────────────────────────

CREATE POLICY "splits_select" ON public.expense_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits_insert" ON public.expense_splits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits_update" ON public.expense_splits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits_delete" ON public.expense_splits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

-- ── expense_comments ──────────────────────────────────────────────────────────

CREATE POLICY "comments_select" ON public.expense_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "comments_insert" ON public.expense_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "comments_delete" ON public.expense_comments
  FOR DELETE USING (user_id = auth.uid());

-- ── settlements ───────────────────────────────────────────────────────────────

CREATE POLICY "settlements_select" ON public.settlements
  FOR SELECT USING (
    from_user = auth.uid()
    OR to_user = auth.uid()
    OR is_group_member(group_id)
  );

CREATE POLICY "settlements_insert" ON public.settlements
  FOR INSERT WITH CHECK (
    from_user = auth.uid() AND is_group_member(group_id)
  );
