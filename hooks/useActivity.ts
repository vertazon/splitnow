import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Activity } from '@/types/database';

const ACTIVITY_PAGE_LIMIT = 60;

export async function fetchActivity(userId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activity')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_PAGE_LIMIT);
  if (error) throw error;
  return (data ?? []) as Activity[];
}

export function useActivity(userId: string | null | undefined) {
  const qc = useQueryClient();
  const subscribedRef = useRef<string | null>(null);

  const query = useQuery<Activity[]>({
    queryKey: qk.activity.list(userId),
    queryFn: () => fetchActivity(userId as string),
    enabled: !!userId,
  });

  // Realtime: invalidate feed + unread count on any change to this user's activity
  useEffect(() => {
    if (!userId) return;
    if (subscribedRef.current === userId) return;
    subscribedRef.current = userId;

    const channelName = `activity:${userId}`;
    supabase.getChannels()
      .filter(ch => ch.topic === `realtime:${channelName}`)
      .forEach(ch => supabase.removeChannel(ch));

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'activity', filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: qk.activity.list(userId) });
          qc.invalidateQueries({ queryKey: qk.activity.unread(userId) });
        }
      )
      .subscribe();

    return () => {
      subscribedRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return query;
}

export function useUnreadCount(userId: string | null | undefined) {
  return useQuery<number>({
    queryKey: qk.activity.unread(userId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('activity')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId as string)
        .eq('read', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
    // Poll unread count every 60s as a fallback for realtime gaps
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const { error } = await supabase
        .from('activity')
        .update({ read: true })
        .eq('id', id);
      if (error) throw error;
      return { userId };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.activity.list(vars.userId) });
      qc.invalidateQueries({ queryKey: qk.activity.unread(vars.userId) });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('activity')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      qc.invalidateQueries({ queryKey: qk.activity.list(userId) });
      qc.invalidateQueries({ queryKey: qk.activity.unread(userId) });
    },
  });
}
