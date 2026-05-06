import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import { qk } from '@/lib/queryKeys';
import type { Settlement } from '@/types/database';

export function useSettlement(id: string | null | undefined) {
  return useQuery<Settlement>({
    queryKey: qk.settlements.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useSettlements(groupId: string) {
  return useQuery<Settlement[]>({
    queryKey: qk.settlements.list(groupId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('group_id', groupId)
        .order('settled_at', { ascending: false })
        .limit(100);
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

  return useMutation({
    mutationFn: async (input: SettleUpInput) => {
      // Read fresh at execution time so a user-switch mid-session can't leak
      // a settlement from the wrong account.
      const currentUserId = useUserStore.getState().currentUserId ?? DEV_USER_ID;
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
      qc.invalidateQueries({ queryKey: qk.balances.all });
      qc.invalidateQueries({ queryKey: qk.settlements.list(vars.groupId) });
    },
  });
}

export function useDeleteSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; groupId: string }) => {
      const { error } = await supabase.from('settlements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.balances.all });
      qc.invalidateQueries({ queryKey: qk.settlements.list(vars.groupId) });
      qc.removeQueries({ queryKey: qk.settlements.detail(vars.id) });
    },
  });
}

export interface UpdateSettlementInput {
  id: string;
  groupId: string;
  amount: number;
  upiRef?: string;
}

export function useUpdateSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount, upiRef }: UpdateSettlementInput) => {
      const { error } = await supabase
        .from('settlements')
        .update({ amount, upi_ref: upiRef ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.balances.all });
      qc.invalidateQueries({ queryKey: qk.settlements.list(vars.groupId) });
      qc.invalidateQueries({ queryKey: qk.settlements.detail(vars.id) });
    },
  });
}
