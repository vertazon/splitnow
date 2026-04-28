/**
 * Auth constants and helpers.
 *
 * DEV_USER_ID / DEV_GROUP_ID: hardcoded seed UUIDs used as a fallback
 * when running with RLS disabled (no real auth session).
 *
 * getCurrentUserId(): reads the real session user from Zustand — use this
 * inside React Query queryFns and mutation fns (async, outside React).
 */
import { useUserStore } from '@/store/useUserStore';

// ─── Development seed IDs ─────────────────────────────────────────────────────
// These match the rows in supabase/seed.sql.
// They are only used when RLS is disabled and there is no real auth session.

export const DEV_USER_ID  = '11111111-1111-1111-1111-111111111111';
export const DEV_GROUP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** @deprecated  Use `useUserStore(s => s.currentUserId)` in components. */
export const CURRENT_USER_ID  = DEV_USER_ID;
export const CURRENT_GROUP_ID = DEV_GROUP_ID;

// Seed user map — still useful for display names in dev / testing
export const SEED_USER_IDS = {
  aryan:  '11111111-1111-1111-1111-111111111111',
  raj:    '22222222-2222-2222-2222-222222222222',
  priya:  '33333333-3333-3333-3333-333333333333',
  arjun:  '44444444-4444-4444-4444-444444444444',
  deepak: '55555555-5555-5555-5555-555555555555',
} as const;

// ─── Dynamic accessor (for query fns) ────────────────────────────────────────

/**
 * Returns the current user's UUID.
 * Falls back to DEV_USER_ID when running without auth (RLS disabled).
 * Safe to call outside React (Zustand getState is synchronous).
 */
export function getCurrentUserId(): string {
  return useUserStore.getState().currentUserId ?? DEV_USER_ID;
}
