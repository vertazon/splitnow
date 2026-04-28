import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import type { Settlement } from '@/types/database';

export function useSettlements(groupId: string) {
  return useQuery<Settlement[]>({
    queryKey: ['settlements', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('group_id', groupId)
        .order('settled_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!groupId,
  });
}

export interface SettleUpInput {
  groupId: string;
  toUserId: string;
  amount: number;
  upiRef?: string;
}

/**
 * Marks all unsettled splits between the current user and `toUserId` as settled,
 * then records a settlement row for the audit trail.
 */
export function useSettleUp() {
  const qc = useQueryClient();
  // Read once at call time — this value won't change during the mutation
  const currentUserId = useUserStore.getState().currentUserId ?? DEV_USER_ID;

  return useMutation({
    mutationFn: async (input: SettleUpInput) => {
      const { data: splits, error: fetchErr } = await supabase
        .from('expense_splits')
        .select('id, expense:expenses!inner(paid_by, group_id)')
        .eq('user_id', currentUserId)
        .eq('settled', false)
        .eq('expense.group_id', input.groupId)
        .eq('expense.paid_by', input.toUserId);

      if (fetchErr) throw fetchErr;

      const ids = (splits ?? []).map((s: any) => s.id as string);
      if (ids.length > 0) {
        const { error: updErr } = await supabase
          .from('expense_splits')
          .update({ settled: true })
          .in('id', ids);
        if (updErr) throw updErr;
      }

      const { error: insErr } = await supabase.from('settlements').insert({
        group_id: input.groupId,
        from_user: currentUserId,
        to_user: input.toUserId,
        amount: input.amount,
        upi_ref: input.upiRef ?? null,
      });
      if (insErr) throw insErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['balances', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['expenses', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['settlements', vars.groupId] });
    },
  });
}
