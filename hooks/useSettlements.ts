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
 * Records a payment from the current user to toUserId.
 * Balance is recomputed from splits vs settlements — no split rows are mutated.
 */
export function useSettleUp() {
  const qc = useQueryClient();
  const currentUserId = useUserStore.getState().currentUserId ?? DEV_USER_ID;

  return useMutation({
    mutationFn: async (input: SettleUpInput) => {
      const { error } = await supabase.from('settlements').insert({
        group_id:  input.groupId,
        from_user: currentUserId,
        to_user:   input.toUserId,
        amount:    input.amount,
        upi_ref:   input.upiRef ?? null,
        status:    'completed',
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['balances', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['settlements', vars.groupId] });
    },
  });
}
