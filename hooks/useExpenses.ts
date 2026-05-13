import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import type { Expense, ExpenseSplit, ExpenseComment, ExpenseHistoryDiff } from '@/types/database';

// Joined shape returned by useExpenses — splits + comments live alongside the row
export interface ExpenseWithSplits extends Expense {
  splits: ExpenseSplit[];
  comments: ExpenseComment[];
}

// ─── Read ────────────────────────────────────────────────────────────────────

const EXPENSES_PAGE_LIMIT = 100;

/** Deduplicate splits by user_id, keeping the first occurrence. */
function dedupSplits(expense: ExpenseWithSplits): ExpenseWithSplits {
  const seen = new Set<string>();
  return {
    ...expense,
    splits: (expense.splits ?? []).filter(s => {
      if (seen.has(s.user_id)) return false;
      seen.add(s.user_id);
      return true;
    }),
  };
}

/** Shared query fn — fetches the most recent 100 expenses with splits + comments for a group. */
export async function fetchExpenses(groupId: string): Promise<ExpenseWithSplits[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, splits:expense_splits(*), comments:expense_comments(*)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(EXPENSES_PAGE_LIMIT);
  if (error) throw error;
  return ((data ?? []) as ExpenseWithSplits[]).map(dedupSplits);
}

export function useExpenses(groupId: string | null | undefined) {
  const qc = useQueryClient();
  const subscribedGroupRef = useRef<string | null>(null);

  const query = useQuery<ExpenseWithSplits[]>({
    queryKey: qk.expenses.list(groupId),
    queryFn: () => fetchExpenses(groupId as string),
    enabled: !!groupId,
  });

  // Realtime: invalidate on any change to expenses, splits, or comments.
  // Guard against StrictMode double-invokes and rapid groupId changes by
  // tracking the group we last subscribed to in a ref.
  useEffect(() => {
    if (!groupId) return;
    const gid = groupId; // narrowed to string inside this block
    if (subscribedGroupRef.current === gid) return;
    subscribedGroupRef.current = gid;

    const channelName = `expenses:${gid}`;
    // Purge any stale channel with the same name — channel() returns the same
    // object if already registered, and .on() on a subscribed channel throws.
    supabase.getChannels()
      .filter(ch => ch.topic === `realtime:${channelName}`)
      .forEach(ch => supabase.removeChannel(ch));

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${gid}` },
        () => qc.invalidateQueries({ queryKey: qk.expenses.list(gid) })
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'expense_splits' },
        () => {
          qc.invalidateQueries({ queryKey: qk.expenses.list(gid) });
          qc.invalidateQueries({ queryKey: qk.balances.all });
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'expense_comments' },
        () => qc.invalidateQueries({ queryKey: qk.expenses.list(gid) })
      )
      .subscribe();

    return () => {
      subscribedGroupRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [groupId, qc]);

  return query;
}

// Single expense with splits + comments (for the detail screen)
export function useExpense(expenseId: string | undefined) {
  return useQuery<ExpenseWithSplits | null>({
    queryKey: qk.expenses.detail(expenseId),
    queryFn: async () => {
      if (!expenseId) return null;
      // .maybeSingle() returns null (not an error) when 0 rows match —
      // handles deleted expenses gracefully. .single() throws PGRST116.
      const { data, error } = await supabase
        .from('expenses')
        .select('*, splits:expense_splits(*), comments:expense_comments(*)')
        .eq('id', expenseId)
        .maybeSingle();
      if (error) throw error;
      return data ? dedupSplits(data as ExpenseWithSplits) : null;
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
  splitWith: string[];               // user ids — payer must be included
  customSplits?: Record<string, number>; // userId → amount_owed; omit for equal split
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

  // Ensure every participant is a member of the group so they can see this expense.
  // ignoreDuplicates silently skips rows that already exist.
  const memberRows = input.splitWith.map((uid) => ({ group_id: input.groupId, user_id: uid }));
  await supabase.from('group_members').upsert(memberRows, { onConflict: 'group_id,user_id', ignoreDuplicates: true });

  const splitRows = input.splitWith.map((uid) => ({
    expense_id:  expense.id,
    user_id:     uid,
    amount_owed: input.customSplits?.[uid] ?? perHead,
  }));

  const { error: splitErr } = await supabase.from('expense_splits').insert(splitRows);
  if (splitErr) throw splitErr;

  return expense;
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: insertExpenseWithSplits,
    // Optimistic insert: snapshot, prepend a fake row, roll back on error.
    onMutate: async (vars) => {
      const key = qk.expenses.list(vars.groupId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ExpenseWithSplits[]>(key);

      const splitCount = Math.max(1, vars.splitWith.length);
      const perHead = parseFloat((vars.amount / splitCount).toFixed(2));
      const tempId = `optimistic-${Date.now()}`;
      const optimistic: ExpenseWithSplits = {
        id: tempId,
        group_id: vars.groupId,
        title: vars.title,
        amount: vars.amount,
        category: vars.category,
        paid_by: vars.paidBy,
        added_by: vars.addedBy,
        note: vars.note ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        splits: vars.splitWith.map((uid) => ({
          id: `${tempId}-${uid}`,
          expense_id: tempId,
          user_id: uid,
          amount_owed: vars.customSplits?.[uid] ?? perHead,
        })) as any,
        comments: [],
      } as any;

      qc.setQueryData<ExpenseWithSplits[]>(key, (old) => [optimistic, ...(old ?? [])]);
      return { previous, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: qk.expenses.list(vars.groupId) });
      qc.invalidateQueries({ queryKey: qk.balances.all });
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
  splitWith: string[];
  paidBy: string;
  note?: string | null;
  customSplits?: Record<string, number>;
  /** Snapshot of the expense before editing — used to compute the changelog diff. */
  before?: {
    title: string;
    amount: number;
    category: string;
    paid_by: string | null;
    note: string | null;
    splits: Array<{ user_id: string; amount_owed: number }>;
  };
}

function computeExpenseDiff(
  before: NonNullable<UpdateExpenseInput['before']>,
  after: UpdateExpenseInput,
): ExpenseHistoryDiff[] {
  const changes: ExpenseHistoryDiff[] = [];

  if (before.title !== after.title)
    changes.push({ field: 'title', from: before.title, to: after.title });

  if (parseFloat(String(before.amount)) !== after.amount)
    changes.push({ field: 'amount', from: before.amount, to: after.amount });

  if (before.category !== after.category)
    changes.push({ field: 'category', from: before.category, to: after.category });

  if (before.paid_by !== after.paidBy)
    changes.push({ field: 'paid_by', from: before.paid_by, to: after.paidBy });

  if ((before.note ?? '') !== (after.note ?? ''))
    changes.push({ field: 'note', from: before.note ?? null, to: after.note ?? null });

  // Per-user split diffs
  const splitCount = Math.max(1, after.splitWith.length);
  const perHead = parseFloat((after.amount / splitCount).toFixed(2));
  const beforeMap = new Map(before.splits.map(s => [s.user_id, s.amount_owed]));
  const afterMap  = new Map(after.splitWith.map(uid => [uid, after.customSplits?.[uid] ?? perHead]));

  beforeMap.forEach((oldAmt, uid) => {
    if (!afterMap.has(uid))
      changes.push({ field: `split.${uid}`, from: oldAmt, to: null });
  });

  afterMap.forEach((newAmt, uid) => {
    const oldAmt = beforeMap.get(uid);
    if (oldAmt === undefined)
      changes.push({ field: `split.${uid}`, from: null, to: newAmt });
    else if (Math.abs(oldAmt - newAmt) >= 0.01)
      changes.push({ field: `split.${uid}`, from: oldAmt, to: newAmt });
  });

  return changes;
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  return useMutation({
    mutationFn: async (input: UpdateExpenseInput) => {
      // `input.before` is the expense snapshot captured by the edit screen
      // before the user made changes — no extra DB round-trip needed.
      const prevExpense = input.before ?? null;

      const { error: updErr } = await supabase
        .from('expenses')
        .update({
          title:      input.title,
          amount:     input.amount,
          category:   input.category,
          paid_by:    input.paidBy,
          note:       input.note ?? null,
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
        expense_id:  input.expenseId,
        user_id:     uid,
        amount_owed: input.customSplits?.[uid] ?? perHead,
      }));
      const { error: insErr } = await supabase.from('expense_splits').insert(splitRows);
      if (insErr) throw insErr;

      // Write changelog entry — non-fatal: history failure must never roll back a save.
      if (prevExpense) {
        const diff = computeExpenseDiff(prevExpense, input);
        if (diff.length > 0) {
          const { error: histErr } = await (supabase as any)
            .from('expense_history')
            .insert({ expense_id: input.expenseId, changed_by: currentUserId, changes: diff });
          if (histErr) console.warn('[history] insert failed:', histErr.message);
        }
      }
    },
    onSettled: (_d, _err, vars) => {
      qc.invalidateQueries({ queryKey: qk.expenses.list(vars.groupId) });
      qc.invalidateQueries({ queryKey: qk.expenses.detail(vars.expenseId) });
      qc.invalidateQueries({ queryKey: qk.balances.all });
      qc.invalidateQueries({ queryKey: qk.expenseHistory.list(vars.expenseId) });
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
    // Optimistic remove from the list — keeps the UI snappy on slow networks.
    onMutate: async (vars) => {
      const key = qk.expenses.list(vars.groupId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ExpenseWithSplits[]>(key);
      qc.setQueryData<ExpenseWithSplits[]>(key, (old) =>
        (old ?? []).filter(e => e.id !== vars.expenseId)
      );
      return { previous, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: (_d, _err, vars) => {
      qc.invalidateQueries({ queryKey: qk.expenses.list(vars.groupId) });
      qc.invalidateQueries({ queryKey: qk.balances.all });
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
      qc.invalidateQueries({ queryKey: qk.expenses.detail(vars.expenseId) });
      qc.invalidateQueries({ queryKey: qk.expenses.list(vars.groupId) });
    },
  });
}
