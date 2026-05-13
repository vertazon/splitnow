import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { User } from '@/types/database';

export async function fetchMembersForGroup(groupId: string): Promise<User[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user:users!group_members_user_id_fkey(*)')
    .eq('group_id', groupId)
    .is('left_at', null)
    .is('removed_at', null);
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? [])
    .map((row: any) => row.user as User | null)
    .filter((u): u is User => {
      if (!u || seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
}

export function useMembers(groupId: string | null | undefined) {
  return useQuery<User[]>({
    queryKey: qk.members.list(groupId),
    queryFn: () => fetchMembersForGroup(groupId as string),
    enabled: !!groupId,
  });
}
