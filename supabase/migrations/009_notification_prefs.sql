-- Migration 009: Per-user notification preferences

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{
    "expense_added": true,
    "expense_edited": true,
    "settlement_received": true,
    "comment_added": true
  }'::jsonb;
