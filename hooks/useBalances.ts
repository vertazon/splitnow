import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import type { Balance, User, AvatarColor } from '@/types/database';

interface RawSplitRow {
  amount_owed: number;
  user_id: string;
  expense: {
    paid_by: string | null;
    group_id: string;
  } | null;
}

/**
 * Returns one Balance per counterparty in the group.
 *   amount > 0  → that user owes the current user
 *   amount < 0  → current user owes that user
 */
export function useBalances(groupId: string) {
  // Reactive: re-queries when auth state changes
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  return useQuery<Balance[]>({
    queryKey: ['balances', groupId, currentUserId],
    queryFn: async () => {
      const { data: splits, error: splitErr } = await supabase
        .from('expense_splits')
        .select('amount_owed, user_id, expense:expenses!inner(paid_by, group_id)')
        .eq('settled', false)
        .eq('expense.group_id', groupId);

      if (splitErr) throw splitErr;

      const { data: members, error: memErr } = await supabase
        .from('group_members')
        .select('user:users(*)')
        .eq('group_id', groupId);
      if (memErr) throw memErr;

      const userMap = new Map<string, User>();
      (members ?? []).forEach((row: any) => {
        if (row.user) userMap.set(row.user.id, row.user as User);
      });

      const net = new Map<string, number>();
      (splits as unknown as RawSplitRow[] ?? []).forEach((s) => {
        const payer = s.expense?.paid_by;
        if (!payer) return;
        if (s.user_id === payer) return;

        if (payer === currentUserId && s.user_id !== currentUserId) {
          net.set(s.user_id, (net.get(s.user_id) ?? 0) + s.amount_owed);
        } else if (s.user_id === currentUserId && payer !== currentUserId) {
          net.set(payer, (net.get(payer) ?? 0) - s.amount_owed);
        }
      });

      const balances: Balance[] = [];
      net.forEach((amount, userId) => {
        if (Math.abs(amount) < 0.01) return;
        const u = userMap.get(userId);
        if (!u) return;
        balances.push({
          userId,
          name: u.name ?? userId,
          amount: parseFloat(amount.toFixed(2)),
          upiId: u.upi_id,
          avatarColor: (u.avatar_color ?? 'green') as AvatarColor,
        });
      });

      return balances;
    },
    enabled: !!groupId,
  });
}

/** Single number: net position of the current user across the group. */
export function useNetBalance(groupId: string) {
  const { data: balances, isLoading } = useBalances(groupId);
  const net = (balances ?? []).reduce((sum, b) => sum + b.amount, 0);
  return { net: parseFloat(net.toFixed(2)), isLoading };
}
