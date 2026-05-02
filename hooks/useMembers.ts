import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { User } from '@/types/database';

export function useMembers(groupId: string | null | undefined) {
  return useQuery<User[]>({
    queryKey: qk.members.list(groupId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('user:users(*)')
        .eq('group_id', groupId as string);

      if (error) throw error;
      // Each row: { user: User }. Flatten and drop nulls.
      return (data ?? [])
        .map((row: any) => row.user as User | null)
        .filter((u): u is User => u !== null);
    },
    enabled: !!groupId,
  });
}
