import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { ExpenseHistory } from '@/types/database';

export function useExpenseHistory(expenseId: string | undefined) {
  return useQuery<ExpenseHistory[]>({
    queryKey: qk.expenseHistory.list(expenseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_history')
        .select('*')
        .eq('expense_id', expenseId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseHistory[];
    },
    enabled: !!expenseId,
  });
}
