-- Migration 005: RLS policies for expense_history
-- Supabase enables RLS on new tables by default; add matching policies.

ALTER TABLE public.expense_history ENABLE ROW LEVEL SECURITY;

-- Group members can read the history of any expense in their group
CREATE POLICY "expense_history_select" ON public.expense_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

-- Group members can insert history entries for expenses in their group
CREATE POLICY "expense_history_insert" ON public.expense_history
  FOR INSERT WITH CHECK (
    changed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );
