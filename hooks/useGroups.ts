import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { useUserStore } from '@/store/useUserStore';
import { DEV_USER_ID } from '@/lib/auth';
import type { GroupWithStats, User, AvatarColor } from '@/types/database';

// ─── useGroups ────────────────────────────────────────────────────────────────

export function useGroups(userId?: string | null) {
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;
  const uid = userId ?? currentUserId;

  return useQuery<GroupWithStats[]>({
    queryKey: qk.groups.list(uid),
    queryFn: async () => {
      // Fetch groups the user is a member of (not archived, not left)
      const { data: memberRows, error: memberErr } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', uid)
        .is('left_at', null);

      if (memberErr) throw memberErr;
      if (!memberRows || memberRows.length === 0) return [];

      const groupIds = memberRows.map((r: any) => r.group_id as string);

      // Fetch groups with their members
      const { data: groups, error: groupErr } = await supabase
        .from('groups')
        .select('*, members:group_members(user_id, role, left_at, user:users(*))')
        .in('id', groupIds)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (groupErr) throw groupErr;

      // Fetch all balances across these groups in one shot
      const [splitsRes, settlementsRes] = await Promise.all([
        supabase
          .from('expense_splits')
          .select('amount_owed, user_id, expense:expenses!inner(paid_by, group_id)')
          .in('expense.group_id', groupIds),
        supabase
          .from('settlements')
          .select('from_user, to_user, amount, group_id')
          .in('group_id', groupIds)
          .eq('status', 'completed'),
      ]);

      if (splitsRes.error) throw splitsRes.error;
      if (settlementsRes.error) throw settlementsRes.error;

      return (groups ?? []).map((g: any) => {
        const activeMembers = (g.members ?? [])
          .filter((m: any) => !m.left_at && m.user)
          .map((m: any) => m.user as User);

        // Compute net balance for current user within this group
        let net = 0;
        for (const s of (splitsRes.data as any[] ?? [])) {
          const payer = s.expense?.paid_by;
          if (!payer || s.expense?.group_id !== g.id || s.user_id === payer) continue;
          if (payer === uid) net += s.amount_owed;
          else if (s.user_id === uid) net -= s.amount_owed;
        }
        for (const s of (settlementsRes.data as any[] ?? [])) {
          if (s.group_id !== g.id) continue;
          if (s.from_user === uid) net += s.amount;
          else if (s.to_user === uid) net -= s.amount;
        }

        return {
          id: g.id,
          name: g.name,
          created_by: g.created_by,
          cover_emoji: g.cover_emoji ?? '🏠',
          group_type: g.group_type ?? 'custom',
          archived_at: g.archived_at ?? null,
          created_at: g.created_at,
          member_count: activeMembers.length,
          net_balance: parseFloat(net.toFixed(2)),
          members: activeMembers,
        } as GroupWithStats;
      });
    },
    enabled: !!uid,
  });
}

// ─── useGroupDetail ───────────────────────────────────────────────────────────

export function useGroupDetail(groupId: string | null | undefined) {
  return useQuery<GroupWithStats | null>({
    queryKey: qk.groups.detail(groupId),
    queryFn: async () => {
      const { data: gRaw, error } = await supabase
        .from('groups')
        .select('*, members:group_members(user_id, role, left_at, user:users(*))')
        .eq('id', groupId as string)
        .single();

      if (error) throw error;
      if (!gRaw) return null;
      const g = gRaw as any;

      const activeMembers = (g.members ?? [])
        .filter((m: any) => !m.left_at && m.user)
        .map((m: any) => m.user as User);

      return {
        id: g.id,
        name: g.name,
        created_by: g.created_by,
        cover_emoji: g.cover_emoji ?? '🏠',
        group_type: g.group_type ?? 'custom',
        archived_at: g.archived_at ?? null,
        created_at: g.created_at,
        member_count: activeMembers.length,
        net_balance: 0,
        members: activeMembers,
      } as GroupWithStats;
    },
    enabled: !!groupId,
  });
}

// ─── useGroupMembers ──────────────────────────────────────────────────────────

export interface GroupMemberWithUser {
  userId:   string;
  role:     'admin' | 'member';
  joinedAt: string;
  name:     string;
  avatarColor: AvatarColor;
  initials: string;
}

export function useGroupMembers(groupId: string | null | undefined) {
  return useQuery<GroupMemberWithUser[]>({
    queryKey: qk.groups.members(groupId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, role, joined_at, left_at, user:users(*)')
        .eq('group_id', groupId as string)
        .is('left_at', null)
        .order('joined_at', { ascending: true });

      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => r.user)
        .map((r: any) => {
          const u = r.user;
          const nameParts = (u.name ?? '').split(' ');
          const initials = nameParts.length >= 2
            ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
            : (u.name ?? '??').slice(0, 2).toUpperCase();
          return {
            userId: u.id,
            role: (r.role ?? 'member') as 'admin' | 'member',
            joinedAt: r.joined_at,
            name: u.name ?? u.id,
            avatarColor: (u.avatar_color ?? 'green') as AvatarColor,
            initials,
          };
        });
    },
    enabled: !!groupId,
  });
}

// ─── useCreateGroup ───────────────────────────────────────────────────────────

export interface CreateGroupInput {
  name:        string;
  cover_emoji: string;
  group_type:  'flat' | 'trip' | 'custom';
  memberIds:   string[];
}

export function useCreateGroup() {
  const qc = useQueryClient();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  return useMutation({
    mutationFn: async (input: CreateGroupInput): Promise<string> => {
      const { data: group, error: gErr } = await supabase
        .from('groups')
        .insert({
          name:        input.name,
          cover_emoji: input.cover_emoji,
          group_type:  input.group_type,
          created_by:  currentUserId,
        })
        .select()
        .single();

      if (gErr) throw gErr;

      // Add creator as admin + all selected members
      const allMemberIds = Array.from(new Set([currentUserId, ...input.memberIds]));
      const memberRows = allMemberIds.map(uid => ({
        group_id: group.id,
        user_id:  uid,
        role:     uid === currentUserId ? 'admin' : 'member',
      }));

      const { error: mErr } = await supabase.from('group_members').insert(memberRows);
      if (mErr) throw mErr;

      return group.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groups.all });
    },
  });
}

// ─── useUpdateGroup ───────────────────────────────────────────────────────────

export function useUpdateGroup() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { groupId: string; name?: string; cover_emoji?: string }) => {
      const updates: Record<string, string> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.cover_emoji !== undefined) updates.cover_emoji = input.cover_emoji;

      const { error } = await supabase
        .from('groups')
        .update(updates)
        .eq('id', input.groupId);

      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.groups.detail(vars.groupId) });
      qc.invalidateQueries({ queryKey: qk.groups.all });
    },
  });
}

// ─── useArchiveGroup ──────────────────────────────────────────────────────────

export function useArchiveGroup() {
  const qc = useQueryClient();
  const currentUserId = useUserStore(s => s.currentUserId) ?? DEV_USER_ID;

  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from('groups')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groups.all });
      qc.invalidateQueries({ queryKey: qk.groups.list(currentUserId) });
    },
  });
}

// ─── useAddGroupMember ────────────────────────────────────────────────────────

export function useAddGroupMember() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { groupId: string; userId: string }) => {
      const { error } = await supabase.from('group_members').upsert({
        group_id: input.groupId,
        user_id:  input.userId,
        role:     'member',
        left_at:  null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.groups.members(vars.groupId) });
      qc.invalidateQueries({ queryKey: qk.groups.detail(vars.groupId) });
      qc.invalidateQueries({ queryKey: qk.groups.all });
    },
  });
}

// ─── useRemoveGroupMember ─────────────────────────────────────────────────────

export function useRemoveGroupMember() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { groupId: string; userId: string }) => {
      const { error } = await supabase
        .from('group_members')
        .update({ left_at: new Date().toISOString() })
        .eq('group_id', input.groupId)
        .eq('user_id', input.userId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.groups.members(vars.groupId) });
      qc.invalidateQueries({ queryKey: qk.groups.detail(vars.groupId) });
      qc.invalidateQueries({ queryKey: qk.groups.all });
    },
  });
}
