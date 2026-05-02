import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { User } from '@/types/database';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the two UUIDs in canonical order (lexicographically smaller first).
 * The DB enforces this invariant via the `canonical_order` CHECK constraint,
 * so all reads and writes must use the same ordering.
 */
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Strip whitespace and lowercase — codes are case-insensitive in the UI. */
function normalizeCode(code: string): string {
  return code.replace(/\s/g, '').toLowerCase();
}

// ─── Error codes — thrown as Error.message for typed handling in UI ──────────

export const FriendError = {
  INVALID_CODE: 'INVALID_CODE',   // code not found in DB
  SELF_ADD:     'SELF_ADD',       // user tried to add themselves
  ALREADY:      'ALREADY',        // friendship already exists
} as const;

// ─── resolveInviteCode ───────────────────────────────────────────────────────

/** Look up a user by their invite code. Returns null if not found. */
export async function resolveInviteCode(code: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('invite_code', normalizeCode(code))
    .maybeSingle();
  if (error) throw error;
  return data as User | null;
}

// ─── useFriends ──────────────────────────────────────────────────────────────

/**
 * Returns all friends of `userId` as full User objects.
 *
 * Since friendships are stored with canonical UUID ordering, a user appears
 * in either the `user_id` or `friend_id` column — we fetch both and resolve
 * the "other" side in a second query. Two queries is cleaner than a PostgREST
 * self-join and gives us reliable caching.
 */
export function useFriends(userId: string | null) {
  return useQuery<User[]>({
    queryKey: qk.friends.list(userId),
    queryFn: async () => {
      if (!userId) return [];

      const { data: rows, error } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

      if (error) throw error;
      if (!rows || rows.length === 0) return [];

      // Resolve the "other" user in each row
      const friendIds = rows.map(r =>
        r.user_id === userId ? r.friend_id : r.user_id
      );

      const { data: users, error: userErr } = await supabase
        .from('users')
        .select('*')
        .in('id', friendIds);

      if (userErr) throw userErr;
      return (users ?? []) as User[];
    },
    enabled: !!userId,
  });
}

// ─── useAreFriends ───────────────────────────────────────────────────────────

/** Quick boolean check — used in the join screen to detect duplicates. */
export function useAreFriends(userId: string | null, otherId: string | null) {
  return useQuery<boolean>({
    queryKey: qk.friends.pair(userId, otherId),
    queryFn: async () => {
      if (!userId || !otherId) return false;
      const [uid1, uid2] = canonicalPair(userId, otherId);
      const { data } = await supabase
        .from('friendships')
        .select('id')
        .eq('user_id', uid1)
        .eq('friend_id', uid2)
        .maybeSingle();
      return !!data;
    },
    enabled: !!userId && !!otherId,
  });
}

// ─── useAddFriend ────────────────────────────────────────────────────────────

export interface AddFriendInput {
  currentUserId: string;
  inviteCode: string;
}

export interface AddFriendResult {
  friend: User;
  /** True when the friendship already existed (idempotent call). */
  alreadyFriends: boolean;
}

export function useAddFriend() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddFriendInput): Promise<AddFriendResult> => {
      // 1. Resolve invite code → user profile
      const friend = await resolveInviteCode(input.inviteCode);
      if (!friend) throw new Error(FriendError.INVALID_CODE);

      // 2. Self-add guard
      if (friend.id === input.currentUserId) throw new Error(FriendError.SELF_ADD);

      // 3. Canonical pair for dedup check + insert
      const [uid1, uid2] = canonicalPair(input.currentUserId, friend.id);

      // 4. Check existing friendship (avoids unnecessary write)
      const { data: existing } = await supabase
        .from('friendships')
        .select('id')
        .eq('user_id', uid1)
        .eq('friend_id', uid2)
        .maybeSingle();

      if (existing) return { friend, alreadyFriends: true };

      // 5. Insert — ON CONFLICT DO NOTHING handles the race condition where two
      //    users tap each other's links simultaneously.
      const { error } = await supabase
        .from('friendships')
        .insert({ user_id: uid1, friend_id: uid2 });

      if (error) {
        // Unique constraint violation (code 23505) = concurrent insert won the race.
        if (error.code === '23505') return { friend, alreadyFriends: true };
        throw error;
      }

      return { friend, alreadyFriends: false };
    },

    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.friends.list(vars.currentUserId) });
    },
  });
}

// ─── useRemoveFriend ─────────────────────────────────────────────────────────

export function useRemoveFriend() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { currentUserId: string; friendId: string }) => {
      const [uid1, uid2] = canonicalPair(input.currentUserId, input.friendId);
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('user_id', uid1)
        .eq('friend_id', uid2);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.friends.list(vars.currentUserId) });
    },
  });
}
