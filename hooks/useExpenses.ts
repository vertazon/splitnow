import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Expense, ExpenseSplit, ExpenseComment } from '@/types/database';

// Joined shape returned by useExpenses — splits + comments live alongside the row
export interface ExpenseWithSplits extends Expense {
  splits: ExpenseSplit[];
  comments: ExpenseComment[];
}

// ─── Read ────────────────────────────────────────────────────────────────────

/** Shared query key — use this whenever you need to read from the expenses cache. */
export const expensesQueryKey = (groupId: string) => ['expenses', groupId] as const;

/** Shared query fn — fetches expenses with splits + comments for a group. */
export async function fetchExpenses(groupId: string): Promise<ExpenseWithSplits[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, splits:expense_splits(*), comments:expense_comments(*)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExpenseWithSplits[];
}

export function useExpenses(groupId: string) {
  const qc = useQueryClient();

  const query = useQuery<ExpenseWithSplits[]>({
    queryKey: expensesQueryKey(groupId),
    queryFn: () => fetchExpenses(groupId),
    enabled: !!groupId,
  });

  // Realtime: invalidate on any change to expenses, splits, or comments
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`expenses:${groupId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${groupId}` },
        () => qc.invalidateQueries({ queryKey: ['expenses', groupId] })
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'expense_splits' },
        () => {
          qc.invalidateQueries({ queryKey: ['expenses', groupId] });
          qc.invalidateQueries({ queryKey: ['balances', groupId] });
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'expense_comments' },
        () => qc.invalidateQueries({ queryKey: ['expenses', groupId] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, qc]);

  return query;
}

// Single expense with splits + comments (for the detail screen)
export function useExpense(expenseId: string | undefined) {
  return useQuery<ExpenseWithSplits | null>({
    queryKey: ['expense', expenseId],
    queryFn: async () => {
      if (!expenseId) return null;
      const { data, error } = await supabase
        .from('expenses')
        .select('*, splits:expense_splits(*), comments:expense_comments(*)')
        .eq('id', expenseId)
        .single();
      if (error) throw error;
      return data as ExpenseWithSplits;
    },
    enabled: !!expenseId,
  });
}

// ─── Write ───────────────────────────────────────────────────────────────────

export interface AddExpenseInput {
  groupId: string;
  title: string;
  amount: number;
  category: string;
  paidBy: string;
  addedBy: string;
  note?: string;
  splitWith: string[]; // user ids — payer must be included
}

async function insertExpenseWithSplits(input: AddExpenseInput) {
  const splitCount = Math.max(1, input.splitWith.length);
  const perHead = parseFloat((input.amount / splitCount).toFixed(2));

  const { data: expense, error: expErr } = await supabase
    .from('expenses')
    .insert({
      group_id: input.groupId,
      title: input.title,
      amount: input.amount,
      category: input.category,
      paid_by: input.paidBy,
      added_by: input.addedBy,
      note: input.note ?? null,
    })
    .select()
    .single();

  if (expErr || !expense) throw expErr ?? new Error('Failed to insert expense');

  const splitRows = input.splitWith.map((uid) => ({
    expense_id: expense.id,
    user_id: uid,
    amount_owed: perHead,
    settled: uid === input.paidBy, // payer's own row is auto-settled
  }));

  const { error: splitErr } = await supabase.from('expense_splits').insert(splitRows);
  if (splitErr) throw splitErr;

  return expense;
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: insertExpenseWithSplits,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['expenses', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['balances', vars.groupId] });
    },
  });
}

// ─── Update ──────────────────────────────────────────────────────────────────

export interface UpdateExpenseInput {
  expenseId: string;
  groupId: string;
  title: string;
  amount: number;
  category: string;
  splitWith: string[]; // re-derives the splits
  paidBy: string;
  note?: string | null;
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateExpenseInput) => {
      const { error: updErr } = await supabase
        .from('expenses')
        .update({
          title: input.title,
          amount: input.amount,
          category: input.category,
          paid_by: input.paidBy,
          note: input.note ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.expenseId);
      if (updErr) throw updErr;

      // Replace splits — simplest correct approach for an equal-share model
      const { error: delErr } = await supabase
        .from('expense_splits')
        .delete()
        .eq('expense_id', input.expenseId);
      if (delErr) throw delErr;

      const splitCount = Math.max(1, input.splitWith.length);
      const perHead = parseFloat((input.amount / splitCount).toFixed(2));
      const splitRows = input.splitWith.map((uid) => ({
        expense_id: input.expenseId,
        user_id: uid,
        amount_owed: perHead,
        settled: uid === input.paidBy,
      }));
      const { error: insErr } = await supabase.from('expense_splits').insert(splitRows);
      if (insErr) throw insErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['expenses', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['expense', vars.expenseId] });
      qc.invalidateQueries({ queryKey: ['balances', vars.groupId] });
    },
  });
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { expenseId: string; groupId: string }) => {
      // Cascades to expense_splits + expense_comments via FK
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', input.expenseId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['expenses', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['balances', vars.groupId] });
    },
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

export interface AddCommentInput {
  expenseId: string;
  groupId: string;
  userId: string;
  text: string;
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddCommentInput) => {
      const { error } = await supabase.from('expense_comments').insert({
        expense_id: input.expenseId,
        user_id: input.userId,
        text: input.text,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['expense', vars.expenseId] });
      qc.invalidateQueries({ queryKey: ['expenses', vars.groupId] });
    },
  });
}
