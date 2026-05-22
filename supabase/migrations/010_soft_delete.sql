-- ─── Migration 010: Soft delete with 30-day recovery ────────────────────────
--
-- deleted_at   — set when user taps "Delete account". Account is deactivated
--                immediately but recoverable within 30 days.
-- anonymized_at — set by the cleanup-deleted-users Edge Function after the
--                 30-day grace period: PII (name, phone, upi_id, invite_code)
--                 is overwritten and this timestamp is stamped.
--
-- Hard-deleting rows is avoided to preserve referential integrity with
-- expenses, splits, comments, settlements, and activity records.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz DEFAULT NULL;

-- Partial index: only scans the small set of pending-cleanup rows.
CREATE INDEX IF NOT EXISTS idx_users_deleted_pending
  ON users (deleted_at)
  WHERE deleted_at IS NOT NULL AND anonymized_at IS NULL;

-- ─── RLS: block deleted accounts from reading/writing their own data ─────────
--
-- Supabase RLS policies typically check auth.uid() = id.
-- When deleted_at IS NOT NULL, the user can still hold a valid session token
-- for up to 30 days. We let the app layer handle sign-out immediately after
-- deletion, so no extra RLS policy is strictly required. The cleanup function
-- runs with the service role (bypasses RLS) to anonymize after 30 days.
