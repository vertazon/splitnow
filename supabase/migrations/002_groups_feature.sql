-- Groups feature migration
-- Adds cover_emoji, group_type, archived_at to groups
-- Adds role, left_at to group_members
-- Adds settled_at, settlement_id to expense_splits

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS cover_emoji  TEXT        NOT NULL DEFAULT '🏠',
  ADD COLUMN IF NOT EXISTS group_type   TEXT        NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS role    TEXT        NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- settled_at + settlement_id on expense_splits (used in group-scoped balance queries)
ALTER TABLE expense_splits
  ADD COLUMN IF NOT EXISTS settled_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES settlements(id);

-- Index for fast group member lookups (active members)
CREATE INDEX IF NOT EXISTS idx_group_members_active
  ON group_members (group_id, user_id)
  WHERE left_at IS NULL;

-- Index for archived group lookup
CREATE INDEX IF NOT EXISTS idx_groups_archived
  ON groups (archived_at)
  WHERE archived_at IS NOT NULL;
