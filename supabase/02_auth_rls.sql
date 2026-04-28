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

-- ─── 3. Enable RLS on all tables ─────────────────────────────────────────────

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements       ENABLE ROW LEVEL SECURITY;

-- ─── 4. Helper function ───────────────────────────────────────────────────────
--
-- Stable function: avoids re-evaluating group membership on every row.

CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid AND user_id = auth.uid()
  );
$$;

-- ─── 5. RLS policies ─────────────────────────────────────────────────────────

-- ── users ────────────────────────────────────────────────────────────────────
-- Own row: full read + write.
-- Co-member: read-only, so you can render their name/avatar in the group.

DROP POLICY IF EXISTS "users_select_own"          ON public.users;
DROP POLICY IF EXISTS "users_select_co_member"    ON public.users;
DROP POLICY IF EXISTS "users_insert_own"          ON public.users;
DROP POLICY IF EXISTS "users_update_own"          ON public.users;

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
    )
  );

-- The trigger inserts the row; this policy lets the profile screen do an upsert.
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── groups ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "groups_select_member"  ON public.groups;
DROP POLICY IF EXISTS "groups_insert"         ON public.groups;
DROP POLICY IF EXISTS "groups_update_creator" ON public.groups;
DROP POLICY IF EXISTS "groups_delete_creator" ON public.groups;

CREATE POLICY "groups_select_member" ON public.groups
  FOR SELECT USING (is_group_member(id));

CREATE POLICY "groups_insert" ON public.groups
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "groups_update_creator" ON public.groups
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "groups_delete_creator" ON public.groups
  FOR DELETE USING (created_by = auth.uid());

-- ── group_members ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete" ON public.group_members;

CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT USING (is_group_member(group_id));

-- Any existing member can invite someone new (Phase 7: restrict to admins).
CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT WITH CHECK (is_group_member(group_id));

-- Users can only remove themselves.
CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE USING (user_id = auth.uid());

-- ── expenses ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete" ON public.expenses;

CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT USING (is_group_member(group_id));

CREATE POLICY "expenses_insert" ON public.expenses
  FOR INSERT WITH CHECK (
    is_group_member(group_id) AND added_by = auth.uid()
  );

-- Payer or recorder can edit.
CREATE POLICY "expenses_update" ON public.expenses
  FOR UPDATE USING (
    is_group_member(group_id)
    AND (added_by = auth.uid() OR paid_by = auth.uid())
  );

-- Only the recorder can delete.
CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE USING (added_by = auth.uid());

-- ── expense_splits ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "splits_select" ON public.expense_splits;
DROP POLICY IF EXISTS "splits_insert" ON public.expense_splits;
DROP POLICY IF EXISTS "splits_update" ON public.expense_splits;
DROP POLICY IF EXISTS "splits_delete" ON public.expense_splits;

CREATE POLICY "splits_select" ON public.expense_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

-- The expense recorder inserts all split rows in one transaction.
CREATE POLICY "splits_insert" ON public.expense_splits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id
        AND is_group_member(e.group_id)
        AND e.added_by = auth.uid()
    )
  );

-- Allow the settle-up flow to mark your own split as settled.
-- Also allow the expense recorder to update splits when editing.
CREATE POLICY "splits_update" ON public.expense_splits
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND e.added_by = auth.uid()
    )
  );

-- Splits cascade-delete with the expense; no direct delete needed.
CREATE POLICY "splits_delete" ON public.expense_splits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND e.added_by = auth.uid()
    )
  );

-- ── expense_comments ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "comments_select" ON public.expense_comments;
DROP POLICY IF EXISTS "comments_insert" ON public.expense_comments;
DROP POLICY IF EXISTS "comments_delete" ON public.expense_comments;

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

DROP POLICY IF EXISTS "settlements_select" ON public.settlements;
DROP POLICY IF EXISTS "settlements_insert" ON public.settlements;

CREATE POLICY "settlements_select" ON public.settlements
  FOR SELECT USING (from_user = auth.uid() OR to_user = auth.uid());

CREATE POLICY "settlements_insert" ON public.settlements
  FOR INSERT WITH CHECK (from_user = auth.uid());

-- ─── 6. Seed-data bypass (development only) ──────────────────────────────────
--
-- The seed users have hardcoded UUIDs but no auth.users rows.
-- While developing without real phone auth, you can temporarily disable RLS:
--
--   ALTER TABLE public.users             DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.groups            DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.group_members     DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.expenses          DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.expense_splits    DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.expense_comments  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.settlements       DISABLE ROW LEVEL SECURITY;
--
-- Re-enable before any real-user testing.
