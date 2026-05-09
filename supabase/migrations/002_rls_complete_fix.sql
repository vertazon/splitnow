-- ─────────────────────────────────────────────────────────────────────────────
-- 002_rls_complete_fix — Full RLS reset and rebuild
--
-- Drops every known policy across all previous migrations and recreates them
-- correctly in one place. Safe to run on an existing project.
--
-- Fixes addressed:
--   • users: add invite_code lookup policy (needed for friend-add flow)
--   • friendships: enable RLS + add policies (missing from auth_rls.sql)
--   • groups: remove conflicting INSERT policies, replace with clean one
--   • group_members: add missing UPDATE policy (needed for left_at / role)
--   • is_group_member(): now checks left_at IS NULL (removed members excluded)
--   • create_group RPC: SECURITY DEFINER bypass for JWT timing quirk
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. Enable RLS on ALL tables (friendships was missing) ───────────────────

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements       ENABLE ROW LEVEL SECURITY;


-- ─── 2. Drop ALL existing policies (clean slate) ─────────────────────────────

-- users
DROP POLICY IF EXISTS "users_select_own"                    ON public.users;
DROP POLICY IF EXISTS "users_select_co_member"              ON public.users;
DROP POLICY IF EXISTS "users_select_by_invite_code"         ON public.users;
DROP POLICY IF EXISTS "users_insert_own"                    ON public.users;
DROP POLICY IF EXISTS "users_update_own"                    ON public.users;
DROP POLICY IF EXISTS "users: read all"                     ON public.users;
DROP POLICY IF EXISTS "users: insert own"                   ON public.users;
DROP POLICY IF EXISTS "users: update own"                   ON public.users;

-- friendships
DROP POLICY IF EXISTS "friendships_select"                  ON public.friendships;
DROP POLICY IF EXISTS "friendships_insert"                  ON public.friendships;
DROP POLICY IF EXISTS "friendships_delete"                  ON public.friendships;
DROP POLICY IF EXISTS "friendships: read own"               ON public.friendships;
DROP POLICY IF EXISTS "friendships: insert own"             ON public.friendships;
DROP POLICY IF EXISTS "friendships: delete own"             ON public.friendships;

-- groups
DROP POLICY IF EXISTS "groups_select_member"                ON public.groups;
DROP POLICY IF EXISTS "groups_insert"                       ON public.groups;
DROP POLICY IF EXISTS "groups_update_creator"               ON public.groups;
DROP POLICY IF EXISTS "groups_update_member"                ON public.groups;
DROP POLICY IF EXISTS "groups_delete_creator"               ON public.groups;
DROP POLICY IF EXISTS "groups: read if member"              ON public.groups;
DROP POLICY IF EXISTS "groups: insert authenticated"        ON public.groups;
DROP POLICY IF EXISTS "groups: update if admin"             ON public.groups;

-- group_members
DROP POLICY IF EXISTS "group_members_select"                ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert"                ON public.group_members;
DROP POLICY IF EXISTS "group_members_update"                ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete"                ON public.group_members;
DROP POLICY IF EXISTS "group_members: read if member"       ON public.group_members;
DROP POLICY IF EXISTS "group_members: insert if admin or self" ON public.group_members;
DROP POLICY IF EXISTS "group_members: update own or admin"  ON public.group_members;

-- expenses
DROP POLICY IF EXISTS "expenses_select"                     ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert"                     ON public.expenses;
DROP POLICY IF EXISTS "expenses_update"                     ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete"                     ON public.expenses;
DROP POLICY IF EXISTS "expenses: read if member"            ON public.expenses;
DROP POLICY IF EXISTS "expenses: insert if member"          ON public.expenses;
DROP POLICY IF EXISTS "expenses: update own"                ON public.expenses;
DROP POLICY IF EXISTS "expenses: delete own"                ON public.expenses;
DROP POLICY IF EXISTS "expenses: update if member"          ON public.expenses;
DROP POLICY IF EXISTS "expenses: delete if member"          ON public.expenses;

-- expense_splits
DROP POLICY IF EXISTS "splits_select"                       ON public.expense_splits;
DROP POLICY IF EXISTS "splits_insert"                       ON public.expense_splits;
DROP POLICY IF EXISTS "splits_update"                       ON public.expense_splits;
DROP POLICY IF EXISTS "splits_delete"                       ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits: read if group member"    ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits: insert if group member"  ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits: delete if expense owner" ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits: delete if group member"  ON public.expense_splits;

-- expense_comments
DROP POLICY IF EXISTS "comments_select"                     ON public.expense_comments;
DROP POLICY IF EXISTS "comments_insert"                     ON public.expense_comments;
DROP POLICY IF EXISTS "comments_delete"                     ON public.expense_comments;
DROP POLICY IF EXISTS "expense_comments: read if group member"   ON public.expense_comments;
DROP POLICY IF EXISTS "expense_comments: insert if group member" ON public.expense_comments;
DROP POLICY IF EXISTS "expense_comments: delete own"             ON public.expense_comments;

-- settlements
DROP POLICY IF EXISTS "settlements_select"                  ON public.settlements;
DROP POLICY IF EXISTS "settlements_insert"                  ON public.settlements;
DROP POLICY IF EXISTS "settlements: read if group member"   ON public.settlements;
DROP POLICY IF EXISTS "settlements: insert if group member" ON public.settlements;


-- ─── 3. Helper: is_group_member ──────────────────────────────────────────────
-- SECURITY DEFINER avoids recursion when group_members has RLS enabled.
-- Now correctly excludes removed members (left_at IS NULL).

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


-- ─── 4. SECURITY DEFINER RPC: create_group ───────────────────────────────────
-- Direct inserts on groups/group_members fail because the Supabase JS v2 JWT
-- is not always attached to the first DB request after sign-in. Running as
-- SECURITY DEFINER bypasses RLS entirely inside the function.

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

  -- Creator is always admin
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'admin');

  -- Add other members
  FOREACH v_uid IN ARRAY p_member_ids LOOP
    IF v_uid <> v_user_id THEN
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (v_group_id, v_uid, 'member');
    END IF;
  END LOOP;

  RETURN v_group_id;
END;
$$;


-- ─── 5. users ────────────────────────────────────────────────────────────────

-- See your own row
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- See users in the same group (for expense display, member lists)
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

-- Look up any user by invite code (needed before a friendship exists)
CREATE POLICY "users_select_by_invite_code" ON public.users
  FOR SELECT USING (
    invite_code IS NOT NULL AND auth.uid() IS NOT NULL
  );

-- Auth trigger inserts the row; profile screen can upsert
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- ─── 6. friendships ──────────────────────────────────────────────────────────
-- Canonical ordering (user_id < friend_id) enforced by DB constraint.

CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT USING (
    user_id = auth.uid() OR friend_id = auth.uid()
  );

CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR friend_id = auth.uid()
  );

CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE USING (
    user_id = auth.uid() OR friend_id = auth.uid()
  );


-- ─── 7. groups ───────────────────────────────────────────────────────────────
-- INSERT is handled by SECURITY DEFINER RPCs (create_group / create_personal_group).
-- Policy is a lightweight safety net: just require a valid session.

CREATE POLICY "groups_select_member" ON public.groups
  FOR SELECT USING (is_group_member(id));

CREATE POLICY "groups_insert" ON public.groups
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Any active member can update group name/emoji (flatmate context)
CREATE POLICY "groups_update_member" ON public.groups
  FOR UPDATE USING (is_group_member(id));

CREATE POLICY "groups_delete_creator" ON public.groups
  FOR DELETE USING (created_by = auth.uid());


-- ─── 8. group_members ────────────────────────────────────────────────────────

CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT USING (is_group_member(group_id));

-- Adding yourself, or an existing member adding others
CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR is_group_member(group_id)
  );

-- Updating your own row (left_at when leaving) or updating others as a member
CREATE POLICY "group_members_update" ON public.group_members
  FOR UPDATE USING (
    user_id = auth.uid()
    OR is_group_member(group_id)
  );

-- Only remove yourself
CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE USING (user_id = auth.uid());


-- ─── 9. expenses ─────────────────────────────────────────────────────────────
-- Any group member can edit/delete — flatmate context (not just the creator)

CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT USING (is_group_member(group_id));

CREATE POLICY "expenses_insert" ON public.expenses
  FOR INSERT WITH CHECK (
    is_group_member(group_id) AND added_by = auth.uid()
  );

CREATE POLICY "expenses_update" ON public.expenses
  FOR UPDATE USING (is_group_member(group_id));

CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE USING (is_group_member(group_id));


-- ─── 10. expense_splits ──────────────────────────────────────────────────────

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


-- ─── 11. expense_comments ────────────────────────────────────────────────────

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


-- ─── 12. settlements ─────────────────────────────────────────────────────────

CREATE POLICY "settlements_select" ON public.settlements
  FOR SELECT USING (
    from_user = auth.uid()
    OR to_user = auth.uid()
    OR is_group_member(group_id)
  );

CREATE POLICY "settlements_insert" ON public.settlements
  FOR INSERT WITH CHECK (
    from_user = auth.uid()
    AND is_group_member(group_id)
  );
