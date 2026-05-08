-- ─────────────────────────────────────────────────────────────────────────────
-- Allow any group member to edit or delete any expense in their group.
--
-- Previous policies restricted update/delete to the expense's added_by user,
-- which is too restrictive for a flat-sharing context where flatmates need to
-- correct each other's entries.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "expenses: update own" ON expenses;
DROP POLICY IF EXISTS "expenses: delete own" ON expenses;
DROP POLICY IF EXISTS "expense_splits: delete if expense owner" ON expense_splits;

CREATE POLICY "expenses: update if member"
  ON expenses FOR UPDATE
  USING (is_group_member(group_id));

CREATE POLICY "expenses: delete if member"
  ON expenses FOR DELETE
  USING (is_group_member(group_id));

CREATE POLICY "expense_splits: delete if group member"
  ON expense_splits FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM expenses
      WHERE expenses.id = expense_splits.expense_id
        AND is_group_member(expenses.group_id)
    )
  );
