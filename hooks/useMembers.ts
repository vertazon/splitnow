import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { User } from '@/types/database';

export async function fetchMembersForGroup(groupId: string): Promise<User[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user:users(*)')
    .eq('group_id', groupId);
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => row.user as User | null)
    .filter((u): u is User => u !== null);
}

export function useMembers(groupId: string | null | undefined) {
  return useQuery<User[]>({
    queryKey: qk.members.list(groupId),
    queryFn: () => fetchMembersForGroup(groupId as string),
    enabled: !!groupId,
  });
}
