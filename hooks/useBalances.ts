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

interface RawSettlementRow {
  from_user: string | null;
  to_user: string | null;
  amount: number;
}

/**
 * Returns one Balance per counterparty in the group.
 *   amount > 0  → that user owes the current user
 *   amount < 0  → current user owes that user
 *
 * Balance = SUM(expense_splits) − SUM(settlements)
 * No settled flag on splits — settlements are the source of truth for payments.
 */
export function useBalances(groupId: string) {
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  return useQuery<Balance[]>({
    queryKey: ['balances', groupId, currentUserId],
    queryFn: async () => {
      const [splitsRes, settlementsRes, membersRes] = await Promise.all([
        supabase
          .from('expense_splits')
          .select('amount_owed, user_id, expense:expenses!inner(paid_by, group_id)')
          .eq('expense.group_id', groupId),
        supabase
          .from('settlements')
          .select('from_user, to_user, amount')
          .eq('group_id', groupId)
          .eq('status', 'completed'),
        supabase
          .from('group_members')
          .select('user:users(*)')
          .eq('group_id', groupId),
      ]);

      if (splitsRes.error) throw splitsRes.error;
      if (settlementsRes.error) throw settlementsRes.error;
      if (membersRes.error) throw membersRes.error;

      const userMap = new Map<string, User>();
      (membersRes.data ?? []).forEach((row: any) => {
        if (row.user) userMap.set(row.user.id, row.user as User);
      });

      const net = new Map<string, number>();

      // Gross debts from expense splits
      (splitsRes.data as unknown as RawSplitRow[] ?? []).forEach((s) => {
        const payer = s.expense?.paid_by;
        if (!payer || s.user_id === payer) return;

        if (payer === currentUserId) {
          // counterparty owes me
          net.set(s.user_id, (net.get(s.user_id) ?? 0) + s.amount_owed);
        } else if (s.user_id === currentUserId) {
          // I owe counterparty
          net.set(payer, (net.get(payer) ?? 0) - s.amount_owed);
        }
      });

      // Offset by settlements
      (settlementsRes.data as unknown as RawSettlementRow[] ?? []).forEach((s) => {
        if (!s.from_user || !s.to_user) return;

        if (s.from_user === currentUserId) {
          // I paid to_user → reduces my debt to them
          net.set(s.to_user, (net.get(s.to_user) ?? 0) + s.amount);
        } else if (s.to_user === currentUserId) {
          // counterparty paid me → reduces their debt to me
          net.set(s.from_user, (net.get(s.from_user) ?? 0) - s.amount);
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
