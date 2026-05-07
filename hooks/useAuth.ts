/**
 * useAuth — session management and phone OTP helpers.
 *
 * Call `useAuthInit()` once in the root layout; it listens to
 * `onAuthStateChange`, fetches the user profile, and keeps
 * `useUserStore` in sync for the rest of the app.
 */
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/useUserStore';
import { useGroupStore } from '@/store/useGroupStore';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import type { User } from '@/types/database';

// ─── Session bootstrap ────────────────────────────────────────────────────────

/** Wipes all user-scoped state so the next user starts completely clean. */
function clearSession() {
  useUserStore.getState().clearUser();
  useGroupStore.getState().clearGroup();
  queryClient.clear();
}

/** Fetch the public.users profile for a given auth UID. */
async function fetchProfile(userId: string): Promise<User | null> {
  // .maybeSingle() returns null (not an error) when 0 rows match.
  // .single() throws PGRST116 (406) when 0 rows — breaks on first-time sign-up
  // before the public.users row has been created.
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[fetchProfile] error:', error);
    return null;
  }
  return data as User | null;
}

/**
 * Find the user's primary group; create one if none exists yet.
 *
 * When the user is in multiple groups (e.g. their own solo group + a shared
 * group they were added to via a split), prefer the group with the most
 * members — that's the active shared group where expenses actually live.
 */
async function fetchOrCreateUserGroup(userId: string, userName: string | null): Promise<void> {
  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (memberships && memberships.length > 0) {
    if (memberships.length === 1) {
      useGroupStore.getState().setCurrentGroupId(memberships[0].group_id);
      return;
    }

    // Multiple groups — pick the one with the most members (most active / shared)
    const counts = await Promise.all(
      memberships.map(async (m) => {
        const { count } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', m.group_id);
        return { group_id: m.group_id, count: count ?? 0 };
      })
    );
    const best = counts.sort((a, b) => b.count - a.count)[0];
    useGroupStore.getState().setCurrentGroupId(best.group_id);
    return;
  }

  // No group yet — create a default one for this user
  const { data: group, error } = await supabase
    .from('groups')
    .insert({ name: 'Personal', group_type: 'personal', created_by: userId })
    .select('id')
    .single();

  if (error || !group) {
    console.error('[fetchOrCreateUserGroup] failed to create group:', error);
    return;
  }

  await supabase.from('group_members').insert({ group_id: group.id, user_id: userId });
  useGroupStore.getState().setCurrentGroupId(group.id);
  // Invalidate groups cache so the home/insights screens show the personal group immediately
  queryClient.invalidateQueries({ queryKey: qk.groups.all });
}

/**
 * Mount this once in `app/_layout.tsx`.
 * Resolves the session on startup and keeps the store updated on sign-in / sign-out.
 */
export function useAuthInit() {
  // Subscribe per-action via individual selectors. Destructuring the whole
  // store would re-subscribe to every state change and rerun this effect's
  // cleanup unnecessarily; action references are stable so selecting them
  // individually is safe.
  const setCurrentUser   = useUserStore(s => s.setCurrentUser);
  const setCurrentUserId = useUserStore(s => s.setCurrentUserId);
  const setLoading       = useUserStore(s => s.setLoading);

  useEffect(() => {
    // 1. Read whatever is already in AsyncStorage (instant, no network round-trip)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setCurrentUserId(session.user.id);
        const profile = await fetchProfile(session.user.id);
        // Only overwrite the store when a profile row exists. Calling
        // setCurrentUser(null) would clear currentUserId via the store setter,
        // breaking the profile-setup screen for brand-new users.
        if (profile) {
          setCurrentUser(profile);
          if (profile.name) {
            await fetchOrCreateUserGroup(session.user.id, profile.name);
          }
        }
      } else {
        clearSession();
      }
      setLoading(false);
    });

    // 2. Keep in sync with subsequent sign-in / sign-out / token-refresh events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setCurrentUserId(session.user.id);
          // Re-fetch profile on sign-in; token refresh doesn't change the profile.
          if (event === 'SIGNED_IN') {
            const profile = await fetchProfile(session.user.id);
            // Same guard: don't call setCurrentUser(null) for new users who
            // haven't completed profile setup yet — it would wipe currentUserId.
            if (profile) {
              setCurrentUser(profile);
              if (profile.name) {
                await fetchOrCreateUserGroup(session.user.id, profile.name);
              }
            }
          }
        } else {
          clearSession();
          setLoading(false);
        }
      },
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ─── Auth actions ─────────────────────────────────────────────────────────────

/** Format a 10-digit Indian mobile number to E.164 (+91XXXXXXXXXX). */
export function toE164(digits: string): string {
  const clean = digits.replace(/\D/g, '').slice(-10);
  return `+91${clean}`;
}

/** Send an OTP to the given E.164 phone number. */
export async function sendOtp(phone: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return { error: error?.message ?? null };
}

/** Verify the OTP. Returns the new session or an error. */
export async function verifyOtp(
  phone: string,
  token: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
  return { error: error?.message ?? null };
}

/**
 * Save (or update) the user's profile after OTP verification.
 * Upserts the public.users row — the DB trigger already created it;
 * this fills in name, avatar_color, and optional upi_id.
 */
export async function saveProfile(
  userId: string,
  profile: { name: string; avatarColor: string; upiId?: string },
): Promise<{ error: string | null }> {
  // Use upsert so this works whether or not the DB trigger already created
  // the public.users row (avoids silent "0 rows updated" with plain .update()).
  const { error } = await supabase
    .from('users')
    .upsert(
      {
        id: userId,
        name: profile.name.trim(),
        avatar_color: profile.avatarColor,
        upi_id: profile.upiId?.trim() || null,
      },
      { onConflict: 'id' },
    );

  if (error) {
    console.error('[saveProfile] upsert error:', error);
    return { error: error.message };
  }

  // Refresh the store so AuthGuard detects the name and redirects to tabs
  const fresh = await fetchProfile(userId);
  if (!fresh) {
    // Row was written but RLS blocked the SELECT — redirect anyway by
    // constructing a minimal user object so the guard fires.
    useUserStore.getState().setCurrentUser({
      id: userId,
      name: profile.name.trim(),
      phone: null,
      avatar_color: profile.avatarColor,
      upi_id: profile.upiId?.trim() || null,
      subscription_plan: 'free',
      subscription_status: 'active',
      subscription_period_end: null,
      trial_end: null,
      razorpay_customer_id: null,
      razorpay_subscription_id: null,
    } as any);
    return { error: null };
  }

  useUserStore.getState().setCurrentUser(fresh);
  await fetchOrCreateUserGroup(userId, fresh.name);
  return { error: null };
}

/** Sign out and clear all local state. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  clearSession();
}
