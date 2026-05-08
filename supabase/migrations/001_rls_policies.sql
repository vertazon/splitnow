-- ─────────────────────────────────────────────────────────────────────────────
-- SplitNow — Row Level Security Policies
-- Run this in Supabase Dashboard → SQL Editor before going to production.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Enable RLS on all tables ─────────────────────────────────────────────────

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements       ENABLE ROW LEVEL SECURITY;


-- ─── users ────────────────────────────────────────────────────────────────────
-- Anyone can read any user (needed for name/avatar lookups across groups).
-- You can only insert/update your own row.

CREATE POLICY "users: read all"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "users: insert own"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "users: update own"
  ON users FOR UPDATE
  USING (id = auth.uid());


-- ─── friendships ──────────────────────────────────────────────────────────────
-- You can only see, create, or delete friendships you are part of.

CREATE POLICY "friendships: read own"
  ON friendships FOR SELECT
  USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "friendships: insert own"
  ON friendships FOR INSERT
  WITH CHECK (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "friendships: delete own"
  ON friendships FOR DELETE
  USING (user_id = auth.uid() OR friend_id = auth.uid());


-- ─── groups ───────────────────────────────────────────────────────────────────
-- You can see groups you are an active member of.
-- Only the creator can insert. Only an admin member can update.

CREATE POLICY "groups: read if member"
  ON groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
        AND group_members.user_id = auth.uid()
        AND group_members.left_at IS NULL
    )
  );

CREATE POLICY "groups: insert authenticated"
  ON groups FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "groups: update if admin"
  ON groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
        AND group_members.user_id = auth.uid()
        AND group_members.role = 'admin'
        AND group_members.left_at IS NULL
    )
  );


-- ─── group_members ────────────────────────────────────────────────────────────
-- You can see all members of any group you belong to.
-- You can add yourself, or an admin can add others.
-- You can update your own row (e.g. left_at), or an admin can update any row.

CREATE POLICY "group_members: read if member"
  ON group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2.left_at IS NULL
    )
  );

CREATE POLICY "group_members: insert if admin or self"
  ON group_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2.role = 'admin'
        AND gm2.left_at IS NULL
    )
  );

CREATE POLICY "group_members: update own or admin"
  ON group_members FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2.role = 'admin'
        AND gm2.left_at IS NULL
    )
  );


-- ─── expenses ─────────────────────────────────────────────────────────────────
-- You can see expenses in groups you belong to.
-- You can add expenses to groups you belong to.
-- You can only edit or delete expenses you added.

CREATE POLICY "expenses: read if member"
  ON expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = expenses.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.left_at IS NULL
    )
  );

CREATE POLICY "expenses: insert if member"
  ON expenses FOR INSERT
  WITH CHECK (
    added_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = expenses.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.left_at IS NULL
    )
  );

CREATE POLICY "expenses: update own"
  ON expenses FOR UPDATE
  USING (added_by = auth.uid());

CREATE POLICY "expenses: delete own"
  ON expenses FOR DELETE
  USING (added_by = auth.uid());


-- ─── expense_splits ───────────────────────────────────────────────────────────
-- You can see splits for expenses in groups you belong to.
-- Splits are inserted/deleted by whoever owns the parent expense.

CREATE POLICY "expense_splits: read if group member"
  ON expense_splits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses
      JOIN group_members ON group_members.group_id = expenses.group_id
      WHERE expenses.id = expense_splits.expense_id
        AND group_members.user_id = auth.uid()
        AND group_members.left_at IS NULL
    )
  );

CREATE POLICY "expense_splits: insert if group member"
  ON expense_splits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses
      JOIN group_members ON group_members.group_id = expenses.group_id
      WHERE expenses.id = expense_splits.expense_id
        AND group_members.user_id = auth.uid()
        AND group_members.left_at IS NULL
    )
  );

CREATE POLICY "expense_splits: delete if expense owner"
  ON expense_splits FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM expenses
      WHERE expenses.id = expense_splits.expense_id
        AND expenses.added_by = auth.uid()
    )
  );


-- ─── expense_comments ─────────────────────────────────────────────────────────
-- You can see comments on expenses in groups you belong to.
-- You can comment on any expense in your groups.
-- You can only delete your own comments.

CREATE POLICY "expense_comments: read if group member"
  ON expense_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses
      JOIN group_members ON group_members.group_id = expenses.group_id
      WHERE expenses.id = expense_comments.expense_id
        AND group_members.user_id = auth.uid()
        AND group_members.left_at IS NULL
    )
  );

CREATE POLICY "expense_comments: insert if group member"
  ON expense_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM expenses
      JOIN group_members ON group_members.group_id = expenses.group_id
      WHERE expenses.id = expense_comments.expense_id
        AND group_members.user_id = auth.uid()
        AND group_members.left_at IS NULL
    )
  );

CREATE POLICY "expense_comments: delete own"
  ON expense_comments FOR DELETE
  USING (user_id = auth.uid());


-- ─── settlements ──────────────────────────────────────────────────────────────
-- You can see settlements in groups you belong to.
-- You can only create a settlement if you are the payer or payee.

CREATE POLICY "settlements: read if group member"
  ON settlements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = settlements.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.left_at IS NULL
    )
  );

CREATE POLICY "settlements: insert if group member"
  ON settlements FOR INSERT
  WITH CHECK (
    (from_user = auth.uid() OR to_user = auth.uid())
    AND EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = settlements.group_id
        AND group_members.user_id = auth.uid()
        AND group_members.left_at IS NULL
    )
  );
