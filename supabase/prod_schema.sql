-- ============================================================================
-- SplitNow — consolidated production schema (v2, dependency-corrected)
-- Order: schema.sql, 001 (adds left_at/role/cover_emoji/group_type),
--   auth_rls (uses those cols), 002, 003_member_lifecycle, 004-011.
-- Excluded: 003_group_member_rpcs (superseded), seed.sql (dev data).
-- Run ONCE on a fresh project. Edge funcs / secrets / webhooks / auth
-- providers are configured separately.
-- ============================================================================


-- ============================================================
-- SOURCE: supabase/schema.sql
-- ============================================================

-- SplitNow database schema
-- Run this in the Supabase SQL editor (or `supabase db push`) once per project.
--
-- NOTE on RLS: row-level security is intentionally DISABLED for the prototype
-- phase because we use a hardcoded current user via the anon key. Enable RLS
-- and write proper policies before exposing this to real users.

create extension if not exists "pgcrypto";

-- ─── Invite code generator ────────────────────────────────────────────────────
-- Must be defined before the users table which uses it as a column default.
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars  text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code   text;
begin
  loop
    select string_agg(
      substr(chars, floor(random() * length(chars))::int + 1, 1),
      ''
    )
    into code
    from generate_series(1, 8);

    exit when not exists (
      select 1 from public.users where invite_code = code
    );
  end loop;
  return code;
end;
$$;

-- ─── Users ────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id          uuid        primary key default gen_random_uuid(),
  name        text,                  -- nullable: set during profile-setup; auth trigger inserts NULL
  phone       text        unique,
  upi_id      text,
  avatar_color text       default 'green',
  invite_code text        unique default public.generate_invite_code(),
  created_at  timestamptz default now()
);

-- ─── Friendships ─────────────────────────────────────────────────────────────
-- Single canonical row per pair. Invariant: user_id::text < friend_id::text.
create table if not exists public.friendships (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users(id) on delete cascade,
  friend_id  uuid        not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint no_self_friendship check (user_id <> friend_id),
  constraint canonical_order    check (user_id::text < friend_id::text),
  unique (user_id, friend_id)
);

create index if not exists friendships_user_idx   on public.friendships (user_id);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

-- ─── Groups ───────────────────────────────────────────────────────────────────
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users(id),
  created_at timestamptz default now()
);

create table if not exists public.group_members (
  group_id  uuid        references public.groups(id) on delete cascade,
  user_id   uuid        references public.users(id)  on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ─── Expenses ─────────────────────────────────────────────────────────────────
-- Mirrors the add/edit/detail UI:
--   title       — required user-visible label (e.g., "Dinner BBQ Nation")
--   amount      — positive, up to 2 decimal places
--   category    — id from constants/sampleData.ts (e.g., 'food', 'rent')
--   paid_by     — member who fronted the money
--   added_by    — member who logged the entry (often == paid_by)
--   note        — optional free text, rendered in detail screen if present
--   updated_at  — set when the expense is edited; null otherwise
create table if not exists public.expenses (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        references public.groups(id) on delete cascade,
  title      text        not null,
  amount     numeric(10,2) not null check (amount > 0),
  category   text        not null,
  type       text        not null default 'group' check (type in ('group', 'personal', 'advance')),
  paid_by    uuid        references public.users(id),
  added_by   uuid        references public.users(id),
  note       text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

-- Equal-share splits (one row per participant per expense).
-- No settled flag — balance is computed as SUM(splits) − SUM(settlements).
create table if not exists public.expense_splits (
  id          uuid        primary key default gen_random_uuid(),
  expense_id  uuid        references public.expenses(id) on delete cascade,
  user_id     uuid        references public.users(id),
  amount_owed numeric(10,2) not null check (amount_owed >= 0)
);

-- ─── Comments thread on an expense ────────────────────────────────────────────
create table if not exists public.expense_comments (
  id         uuid        primary key default gen_random_uuid(),
  expense_id uuid        references public.expenses(id) on delete cascade,
  user_id    uuid        references public.users(id),
  parent_id  uuid        references public.expense_comments(id) on delete set null,
  text       text        not null check (length(text) > 0),
  created_at timestamptz default now()
);

-- ─── Settlements ──────────────────────────────────────────────────────────────
create table if not exists public.settlements (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        references public.groups(id),
  from_user  uuid        references public.users(id),
  to_user    uuid        references public.users(id),
  amount     numeric(10,2) not null check (amount > 0),
  status     text        not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  upi_ref    text,
  settled_at timestamptz default now()
);

-- ─── Indexes for hot paths ────────────────────────────────────────────────────
create index if not exists expenses_group_created_idx
  on public.expenses (group_id, created_at desc);
create index if not exists expense_splits_expense_idx
  on public.expense_splits (expense_id);
create index if not exists expense_splits_user_idx
  on public.expense_splits (user_id);
create index if not exists expense_comments_expense_idx
  on public.expense_comments (expense_id, created_at);
create index if not exists settlements_group_idx
  on public.settlements (group_id, settled_at desc);

-- RLS is disabled here so the tables can be created cleanly.
-- auth_rls.sql (run next) enables RLS and creates all policies.


-- ============================================================
-- SOURCE: supabase/migrations/001_groups_feature.sql
-- ============================================================

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


-- ============================================================
-- SOURCE: supabase/auth_rls.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SplitNow — Phase 6: Auth + Subscription schema + RLS
-- Run in Supabase SQL editor AFTER enabling Phone auth in the dashboard.
--
-- Prerequisites:
--   1. Supabase → Authentication → Providers → Phone: enabled
--   2. An SMS provider configured (Twilio / MessageBird / Vonage), OR
--      enable "Disable phone confirmations" for local dev to bypass SMS.
--   3. Run 01_seed.sql first (or comment out the trigger if seeding manually).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Subscription columns on users ────────────────────────────────────────

-- Allow null name so new sign-ups can set it in the profile-setup screen.
ALTER TABLE public.users ALTER COLUMN name DROP NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_plan    TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_plan IN ('free', 'pro', 'teams')),
  ADD COLUMN IF NOT EXISTS subscription_status  TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  ADD COLUMN IF NOT EXISTS subscription_period_end  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS razorpay_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

-- Index for fast subscription status lookups (e.g. feature-gate checks)
CREATE INDEX IF NOT EXISTS users_subscription_plan_idx
  ON public.users (subscription_plan, subscription_status);

-- ─── 2. Trigger: auto-create public.users row on auth sign-up ────────────────
--
-- When Supabase Auth creates a new entry in auth.users (on phone OTP verify),
-- this trigger inserts a matching row in public.users with the same UUID.
-- The profile (name, avatar_color) is completed in the on-boarding screen.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, phone, name, avatar_color, subscription_plan, subscription_status)
  VALUES (
    NEW.id,
    NEW.phone,
    NULL,     -- filled during profile setup
    'green',  -- default; overridden during profile setup
    'free',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ─── 3. Enable RLS on ALL tables (including friendships) ────────────────────

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements       ENABLE ROW LEVEL SECURITY;

-- ─── 4. Helper: is_group_member ──────────────────────────────────────────────
-- SECURITY DEFINER avoids recursion. Checks left_at IS NULL to exclude
-- members who have left the group.

CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid
      AND user_id  = auth.uid()
      AND left_at  IS NULL
  );
$$;

-- ─── 5. SECURITY DEFINER RPCs ────────────────────────────────────────────────
-- Direct inserts on groups/group_members fail because the Supabase JS v2 JWT
-- is not always attached to the first DB request after sign-in.

CREATE OR REPLACE FUNCTION public.create_personal_group(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT gm.group_id INTO v_group_id
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.user_id   = p_user_id
    AND g.group_type = 'personal'
    AND gm.left_at   IS NULL
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN RETURN v_group_id; END IF;

  INSERT INTO groups (name, group_type, created_by)
  VALUES ('Personal', 'personal', p_user_id)
  RETURNING id INTO v_group_id;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, p_user_id, 'admin');

  RETURN v_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_group(
  p_name        text,
  p_cover_emoji text,
  p_group_type  text,
  p_member_ids  uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_group_id uuid;
  v_uid      uuid;
BEGIN
  INSERT INTO groups (name, cover_emoji, group_type, created_by)
  VALUES (p_name, p_cover_emoji, p_group_type, v_user_id)
  RETURNING id INTO v_group_id;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'admin');

  FOREACH v_uid IN ARRAY p_member_ids LOOP
    IF v_uid <> v_user_id THEN
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (v_group_id, v_uid, 'member');
    END IF;
  END LOOP;

  RETURN v_group_id;
END;
$$;

-- ─── 6. RLS policies ─────────────────────────────────────────────────────────

-- ── users ────────────────────────────────────────────────────────────────────

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_select_co_member" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM   group_members gm1
      JOIN   group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE  gm1.user_id = auth.uid()
        AND  gm2.user_id = users.id
        AND  gm1.left_at IS NULL
        AND  gm2.left_at IS NULL
    )
  );

-- Allow any authenticated user to look up another user by invite code
-- (needed before a friendship exists)
CREATE POLICY "users_select_by_invite_code" ON public.users
  FOR SELECT USING (
    invite_code IS NOT NULL AND auth.uid() IS NOT NULL
  );

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── friendships ───────────────────────────────────────────────────────────────

CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT WITH CHECK (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE USING (user_id = auth.uid() OR friend_id = auth.uid());

-- ── groups ───────────────────────────────────────────────────────────────────

CREATE POLICY "groups_select_member" ON public.groups
  FOR SELECT USING (is_group_member(id));

-- INSERT is handled by SECURITY DEFINER RPCs; this is just a safety net
CREATE POLICY "groups_insert" ON public.groups
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "groups_update_member" ON public.groups
  FOR UPDATE USING (is_group_member(id));

CREATE POLICY "groups_delete_creator" ON public.groups
  FOR DELETE USING (created_by = auth.uid());

-- ── group_members ─────────────────────────────────────────────────────────────

CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT USING (is_group_member(group_id));

CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR is_group_member(group_id)
  );

CREATE POLICY "group_members_update" ON public.group_members
  FOR UPDATE USING (
    user_id = auth.uid() OR is_group_member(group_id)
  );

CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE USING (user_id = auth.uid());

-- ── expenses ─────────────────────────────────────────────────────────────────

CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT USING (is_group_member(group_id));

CREATE POLICY "expenses_insert" ON public.expenses
  FOR INSERT WITH CHECK (
    is_group_member(group_id) AND added_by = auth.uid()
  );

-- Any group member can edit/delete (flatmate context)
CREATE POLICY "expenses_update" ON public.expenses
  FOR UPDATE USING (is_group_member(group_id));

CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE USING (is_group_member(group_id));

-- ── expense_splits ────────────────────────────────────────────────────────────

CREATE POLICY "splits_select" ON public.expense_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits_insert" ON public.expense_splits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits_update" ON public.expense_splits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits_delete" ON public.expense_splits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

-- ── expense_comments ──────────────────────────────────────────────────────────

CREATE POLICY "comments_select" ON public.expense_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "comments_insert" ON public.expense_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "comments_delete" ON public.expense_comments
  FOR DELETE USING (user_id = auth.uid());

-- ── settlements ───────────────────────────────────────────────────────────────

CREATE POLICY "settlements_select" ON public.settlements
  FOR SELECT USING (
    from_user = auth.uid()
    OR to_user = auth.uid()
    OR is_group_member(group_id)
  );

CREATE POLICY "settlements_insert" ON public.settlements
  FOR INSERT WITH CHECK (
    from_user = auth.uid() AND is_group_member(group_id)
  );


-- ============================================================
-- SOURCE: supabase/migrations/002_rls_complete_fix.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 002_rls_complete_fix — Full RLS reset and rebuild
--
-- Drops every known policy across all previous migrations and recreates them
-- correctly in one place. Safe to run on an existing project.
--
-- Fixes addressed:
--   • users: add invite_code lookup policy (needed for friend-add flow)
--   • friendships: enable RLS + add policies (missing from auth_rls.sql)
--   • groups: remove conflicting INSERT policies, replace with clean one
--   • group_members: add missing UPDATE policy (needed for left_at / role)
--   • is_group_member(): now checks left_at IS NULL (removed members excluded)
--   • create_group RPC: SECURITY DEFINER bypass for JWT timing quirk
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. Enable RLS on ALL tables (friendships was missing) ───────────────────

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements       ENABLE ROW LEVEL SECURITY;


-- ─── 2. Drop ALL existing policies (clean slate) ─────────────────────────────

-- users
DROP POLICY IF EXISTS "users_select_own"                    ON public.users;
DROP POLICY IF EXISTS "users_select_co_member"              ON public.users;
DROP POLICY IF EXISTS "users_select_by_invite_code"         ON public.users;
DROP POLICY IF EXISTS "users_insert_own"                    ON public.users;
DROP POLICY IF EXISTS "users_update_own"                    ON public.users;
DROP POLICY IF EXISTS "users: read all"                     ON public.users;
DROP POLICY IF EXISTS "users: insert own"                   ON public.users;
DROP POLICY IF EXISTS "users: update own"                   ON public.users;

-- friendships
DROP POLICY IF EXISTS "friendships_select"                  ON public.friendships;
DROP POLICY IF EXISTS "friendships_insert"                  ON public.friendships;
DROP POLICY IF EXISTS "friendships_delete"                  ON public.friendships;
DROP POLICY IF EXISTS "friendships: read own"               ON public.friendships;
DROP POLICY IF EXISTS "friendships: insert own"             ON public.friendships;
DROP POLICY IF EXISTS "friendships: delete own"             ON public.friendships;

-- groups
DROP POLICY IF EXISTS "groups_select_member"                ON public.groups;
DROP POLICY IF EXISTS "groups_insert"                       ON public.groups;
DROP POLICY IF EXISTS "groups_update_creator"               ON public.groups;
DROP POLICY IF EXISTS "groups_update_member"                ON public.groups;
DROP POLICY IF EXISTS "groups_delete_creator"               ON public.groups;
DROP POLICY IF EXISTS "groups: read if member"              ON public.groups;
DROP POLICY IF EXISTS "groups: insert authenticated"        ON public.groups;
DROP POLICY IF EXISTS "groups: update if admin"             ON public.groups;

-- group_members
DROP POLICY IF EXISTS "group_members_select"                ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert"                ON public.group_members;
DROP POLICY IF EXISTS "group_members_update"                ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete"                ON public.group_members;
DROP POLICY IF EXISTS "group_members: read if member"       ON public.group_members;
DROP POLICY IF EXISTS "group_members: insert if admin or self" ON public.group_members;
DROP POLICY IF EXISTS "group_members: update own or admin"  ON public.group_members;

-- expenses
DROP POLICY IF EXISTS "expenses_select"                     ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert"                     ON public.expenses;
DROP POLICY IF EXISTS "expenses_update"                     ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete"                     ON public.expenses;
DROP POLICY IF EXISTS "expenses: read if member"            ON public.expenses;
DROP POLICY IF EXISTS "expenses: insert if member"          ON public.expenses;
DROP POLICY IF EXISTS "expenses: update own"                ON public.expenses;
DROP POLICY IF EXISTS "expenses: delete own"                ON public.expenses;
DROP POLICY IF EXISTS "expenses: update if member"          ON public.expenses;
DROP POLICY IF EXISTS "expenses: delete if member"          ON public.expenses;

-- expense_splits
DROP POLICY IF EXISTS "splits_select"                       ON public.expense_splits;
DROP POLICY IF EXISTS "splits_insert"                       ON public.expense_splits;
DROP POLICY IF EXISTS "splits_update"                       ON public.expense_splits;
DROP POLICY IF EXISTS "splits_delete"                       ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits: read if group member"    ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits: insert if group member"  ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits: delete if expense owner" ON public.expense_splits;
DROP POLICY IF EXISTS "expense_splits: delete if group member"  ON public.expense_splits;

-- expense_comments
DROP POLICY IF EXISTS "comments_select"                     ON public.expense_comments;
DROP POLICY IF EXISTS "comments_insert"                     ON public.expense_comments;
DROP POLICY IF EXISTS "comments_delete"                     ON public.expense_comments;
DROP POLICY IF EXISTS "expense_comments: read if group member"   ON public.expense_comments;
DROP POLICY IF EXISTS "expense_comments: insert if group member" ON public.expense_comments;
DROP POLICY IF EXISTS "expense_comments: delete own"             ON public.expense_comments;

-- settlements
DROP POLICY IF EXISTS "settlements_select"                  ON public.settlements;
DROP POLICY IF EXISTS "settlements_insert"                  ON public.settlements;
DROP POLICY IF EXISTS "settlements: read if group member"   ON public.settlements;
DROP POLICY IF EXISTS "settlements: insert if group member" ON public.settlements;


-- ─── 3. Helper: is_group_member ──────────────────────────────────────────────
-- SECURITY DEFINER avoids recursion when group_members has RLS enabled.
-- Now correctly excludes removed members (left_at IS NULL).

CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid
      AND user_id  = auth.uid()
      AND left_at  IS NULL
  );
$$;


-- ─── 4. SECURITY DEFINER RPC: create_group ───────────────────────────────────
-- Direct inserts on groups/group_members fail because the Supabase JS v2 JWT
-- is not always attached to the first DB request after sign-in. Running as
-- SECURITY DEFINER bypasses RLS entirely inside the function.

CREATE OR REPLACE FUNCTION public.create_group(
  p_name        text,
  p_cover_emoji text,
  p_group_type  text,
  p_member_ids  uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_group_id uuid;
  v_uid      uuid;
BEGIN
  INSERT INTO groups (name, cover_emoji, group_type, created_by)
  VALUES (p_name, p_cover_emoji, p_group_type, v_user_id)
  RETURNING id INTO v_group_id;

  -- Creator is always admin
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'admin');

  -- Add other members
  FOREACH v_uid IN ARRAY p_member_ids LOOP
    IF v_uid <> v_user_id THEN
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (v_group_id, v_uid, 'member');
    END IF;
  END LOOP;

  RETURN v_group_id;
END;
$$;


-- ─── 5. users ────────────────────────────────────────────────────────────────

-- See your own row
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- See users in the same group (for expense display, member lists)
CREATE POLICY "users_select_co_member" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM   group_members gm1
      JOIN   group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE  gm1.user_id = auth.uid()
        AND  gm2.user_id = users.id
        AND  gm1.left_at IS NULL
        AND  gm2.left_at IS NULL
    )
  );

-- Look up any user by invite code (needed before a friendship exists)
CREATE POLICY "users_select_by_invite_code" ON public.users
  FOR SELECT USING (
    invite_code IS NOT NULL AND auth.uid() IS NOT NULL
  );

-- Auth trigger inserts the row; profile screen can upsert
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- ─── 6. friendships ──────────────────────────────────────────────────────────
-- Canonical ordering (user_id < friend_id) enforced by DB constraint.

CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT USING (
    user_id = auth.uid() OR friend_id = auth.uid()
  );

CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR friend_id = auth.uid()
  );

CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE USING (
    user_id = auth.uid() OR friend_id = auth.uid()
  );


-- ─── 7. groups ───────────────────────────────────────────────────────────────
-- INSERT is handled by SECURITY DEFINER RPCs (create_group / create_personal_group).
-- Policy is a lightweight safety net: just require a valid session.

CREATE POLICY "groups_select_member" ON public.groups
  FOR SELECT USING (is_group_member(id));

CREATE POLICY "groups_insert" ON public.groups
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Any active member can update group name/emoji (flatmate context)
CREATE POLICY "groups_update_member" ON public.groups
  FOR UPDATE USING (is_group_member(id));

CREATE POLICY "groups_delete_creator" ON public.groups
  FOR DELETE USING (created_by = auth.uid());


-- ─── 8. group_members ────────────────────────────────────────────────────────

CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT USING (is_group_member(group_id));

-- Adding yourself, or an existing member adding others
CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR is_group_member(group_id)
  );

-- Updating your own row (left_at when leaving) or updating others as a member
CREATE POLICY "group_members_update" ON public.group_members
  FOR UPDATE USING (
    user_id = auth.uid()
    OR is_group_member(group_id)
  );

-- Only remove yourself
CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE USING (user_id = auth.uid());


-- ─── 9. expenses ─────────────────────────────────────────────────────────────
-- Any group member can edit/delete — flatmate context (not just the creator)

CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT USING (is_group_member(group_id));

CREATE POLICY "expenses_insert" ON public.expenses
  FOR INSERT WITH CHECK (
    is_group_member(group_id) AND added_by = auth.uid()
  );

CREATE POLICY "expenses_update" ON public.expenses
  FOR UPDATE USING (is_group_member(group_id));

CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE USING (is_group_member(group_id));


-- ─── 10. expense_splits ──────────────────────────────────────────────────────

CREATE POLICY "splits_select" ON public.expense_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits_insert" ON public.expense_splits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits_update" ON public.expense_splits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits_delete" ON public.expense_splits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );


-- ─── 11. expense_comments ────────────────────────────────────────────────────

CREATE POLICY "comments_select" ON public.expense_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "comments_insert" ON public.expense_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "comments_delete" ON public.expense_comments
  FOR DELETE USING (user_id = auth.uid());


-- ─── 12. settlements ─────────────────────────────────────────────────────────

CREATE POLICY "settlements_select" ON public.settlements
  FOR SELECT USING (
    from_user = auth.uid()
    OR to_user = auth.uid()
    OR is_group_member(group_id)
  );

CREATE POLICY "settlements_insert" ON public.settlements
  FOR INSERT WITH CHECK (
    from_user = auth.uid()
    AND is_group_member(group_id)
  );


-- ============================================================
-- SOURCE: supabase/migrations/003_member_lifecycle.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 003_member_lifecycle — Leave / Remove / Role management
--
-- What this adds:
--   • removed_at / removed_by columns on group_members
--   • Updated is_group_member() to exclude removed members
--   • is_group_admin() helper
--   • 4 SECURITY DEFINER RPCs: leave_group, remove_member,
--     transfer_admin_and_leave, update_member_role
--   • Trigger: ensure_group_has_admin (auto-promote safety net)
--   • Tightened group_members UPDATE RLS policy
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. Schema additions ─────────────────────────────────────────────────────

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS removed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by  UUID REFERENCES public.users(id);

-- Partial index for hot path: active members only
CREATE INDEX IF NOT EXISTS idx_group_members_active_v2
  ON public.group_members (group_id)
  WHERE left_at IS NULL AND removed_at IS NULL;


-- ─── 2. Update is_group_member to exclude removed members ────────────────────

CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = gid
      AND user_id    = auth.uid()
      AND left_at    IS NULL
      AND removed_at IS NULL
  );
$$;


-- ─── 3. Helper: is_group_admin ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_group_admin(gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = gid
      AND user_id    = auth.uid()
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  );
$$;


-- ─── 4. RPC: leave_group ─────────────────────────────────────────────────────
-- Any active member can leave.
-- Blocked if: sole active admin AND other active members remain.
-- Auto-archives the group if the last member leaves.

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID    := auth.uid();
  v_is_admin       BOOLEAN;
  v_admin_count    INTEGER;
  v_other_count    INTEGER;
BEGIN
  -- Must be an active member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = v_user_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  -- Check role
  SELECT (role = 'admin') INTO v_is_admin
  FROM group_members
  WHERE group_id = p_group_id AND user_id = v_user_id;

  IF v_is_admin THEN
    SELECT COUNT(*)::INTEGER INTO v_admin_count
    FROM group_members
    WHERE group_id   = p_group_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL;

    SELECT COUNT(*)::INTEGER INTO v_other_count
    FROM group_members
    WHERE group_id   = p_group_id
      AND user_id   <> v_user_id
      AND left_at    IS NULL
      AND removed_at IS NULL;

    -- Block: sole admin with remaining members
    IF v_admin_count = 1 AND v_other_count > 0 THEN
      RAISE EXCEPTION 'SOLE_ADMIN';
    END IF;
  END IF;

  -- Mark as left
  UPDATE group_members
  SET left_at = now()
  WHERE group_id = p_group_id AND user_id = v_user_id;

  -- Auto-archive if group is now empty
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    UPDATE groups SET archived_at = now() WHERE id = p_group_id;
  END IF;
END;
$$;


-- ─── 5. RPC: remove_member ───────────────────────────────────────────────────
-- Admins only. Cannot remove self (use leave_group).
-- Blocked if target is the last active admin.

CREATE OR REPLACE FUNCTION public.remove_member(
  p_group_id  UUID,
  p_target_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id    UUID    := auth.uid();
  v_target_role TEXT;
  v_admin_count INTEGER;
BEGIN
  -- Actor must be active admin
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = v_actor_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  -- Cannot remove yourself via this RPC
  IF v_actor_id = p_target_id THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_SELF';
  END IF;

  -- Target must be an active member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = p_target_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TARGET_NOT_MEMBER';
  END IF;

  SELECT role INTO v_target_role
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_target_id;

  -- If target is admin, at least one admin must remain after removal
  IF v_target_role = 'admin' THEN
    SELECT COUNT(*)::INTEGER INTO v_admin_count
    FROM group_members
    WHERE group_id   = p_group_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN';
    END IF;
  END IF;

  UPDATE group_members
  SET removed_at = now(),
      removed_by = v_actor_id
  WHERE group_id = p_group_id AND user_id = p_target_id;
END;
$$;


-- ─── 6. RPC: transfer_admin_and_leave ────────────────────────────────────────
-- Promote a chosen member to admin then leave — atomic, no orphaned group.

CREATE OR REPLACE FUNCTION public.transfer_admin_and_leave(
  p_group_id     UUID,
  p_new_admin_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
BEGIN
  -- Actor must be active admin
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = v_actor_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  IF v_actor_id = p_new_admin_id THEN
    RAISE EXCEPTION 'CANNOT_TRANSFER_TO_SELF';
  END IF;

  -- New admin must be an active member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = p_new_admin_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TARGET_NOT_MEMBER';
  END IF;

  -- Promote
  UPDATE group_members
  SET role = 'admin'
  WHERE group_id = p_group_id AND user_id = p_new_admin_id;

  -- Leave
  UPDATE group_members
  SET left_at = now()
  WHERE group_id = p_group_id AND user_id = v_actor_id;
END;
$$;


-- ─── 7. RPC: update_member_role ──────────────────────────────────────────────
-- Admins can promote/demote any active member.
-- Blocked if demoting the last active admin.

CREATE OR REPLACE FUNCTION public.update_member_role(
  p_group_id  UUID,
  p_target_id UUID,
  p_new_role  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id    UUID    := auth.uid();
  v_admin_count INTEGER;
BEGIN
  -- Validate role value
  IF p_new_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;

  -- Actor must be active admin
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = v_actor_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  -- Target must be active member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = p_group_id
      AND user_id    = p_target_id
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TARGET_NOT_MEMBER';
  END IF;

  -- If demoting, ensure at least one admin remains
  IF p_new_role = 'member' THEN
    SELECT COUNT(*)::INTEGER INTO v_admin_count
    FROM group_members
    WHERE group_id   = p_group_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN';
    END IF;
  END IF;

  UPDATE group_members
  SET role = p_new_role
  WHERE group_id = p_group_id AND user_id = p_target_id;
END;
$$;


-- ─── 8. Trigger: ensure_group_has_admin ──────────────────────────────────────
-- Safety net: if an update leaves a non-archived group with zero active admins,
-- auto-promote the longest-standing active member.
-- Should almost never fire; protects against manual DB edits / race conditions.

CREATE OR REPLACE FUNCTION public.ensure_group_has_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oldest_member UUID;
BEGIN
  -- Only care about non-archived groups
  IF NOT EXISTS (
    SELECT 1 FROM groups WHERE id = NEW.group_id AND archived_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- If at least one active admin still exists, nothing to do
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id   = NEW.group_id
      AND role       = 'admin'
      AND left_at    IS NULL
      AND removed_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Promote oldest active member
  SELECT user_id INTO v_oldest_member
  FROM group_members
  WHERE group_id   = NEW.group_id
    AND left_at    IS NULL
    AND removed_at IS NULL
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_oldest_member IS NOT NULL THEN
    UPDATE group_members
    SET role = 'admin'
    WHERE group_id = NEW.group_id AND user_id = v_oldest_member;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_group_has_admin ON public.group_members;
CREATE TRIGGER trg_ensure_group_has_admin
  AFTER UPDATE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_group_has_admin();


-- ─── 9. Tighten group_members UPDATE policy ──────────────────────────────────
-- All admin operations (remove, role change) go through SECURITY DEFINER RPCs
-- which bypass RLS entirely. Direct client UPDATE is only needed for self
-- (e.g. future profile preferences on the membership row).
-- The old policy allowed any group member to update any other member's row
-- directly, which is too permissive.

DROP POLICY IF EXISTS "group_members_update"      ON public.group_members;
DROP POLICY IF EXISTS "group_members_update_self" ON public.group_members;
DROP POLICY IF EXISTS "group_members_update_admin" ON public.group_members;

CREATE POLICY "group_members_update_self" ON public.group_members
  FOR UPDATE USING (user_id = auth.uid());


-- ============================================================
-- SOURCE: supabase/migrations/004_expense_history.sql
-- ============================================================

-- Migration 004: Expense edit history / changelog
-- Records a diff row every time an expense is updated.
-- The `changes` jsonb column stores an array of { field, from, to } entries.

create table if not exists public.expense_history (
  id          uuid        primary key default gen_random_uuid(),
  expense_id  uuid        not null references public.expenses(id) on delete cascade,
  changed_by  uuid        references public.users(id),
  changes     jsonb       not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists expense_history_expense_idx
  on public.expense_history (expense_id, created_at desc);


-- ============================================================
-- SOURCE: supabase/migrations/005_expense_history_rls.sql
-- ============================================================

-- Migration 005: RLS policies for expense_history
-- Supabase enables RLS on new tables by default; add matching policies.

ALTER TABLE public.expense_history ENABLE ROW LEVEL SECURITY;

-- Group members can read the history of any expense in their group
CREATE POLICY "expense_history_select" ON public.expense_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );

-- Group members can insert history entries for expenses in their group
CREATE POLICY "expense_history_insert" ON public.expense_history
  FOR INSERT WITH CHECK (
    changed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND is_group_member(e.group_id)
    )
  );


-- ============================================================
-- SOURCE: supabase/migrations/006_activity.sql
-- ============================================================

-- Migration 006: Activity feed table + RLS

CREATE TABLE IF NOT EXISTS public.activity (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES public.users(id) ON DELETE CASCADE,  -- recipient
  actor_id   uuid        REFERENCES public.users(id),                    -- who did it
  type       text        NOT NULL,
  ref_id     uuid,       -- expense_id / settlement_id / comment_id
  ref_type   text,       -- 'expense' | 'settlement' | 'comment'
  group_id   uuid        REFERENCES public.groups(id) ON DELETE CASCADE,
  meta       jsonb,
  read       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_user_created_idx ON public.activity (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_unread_idx       ON public.activity (user_id, read) WHERE read = false;

ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;

-- Users can only see their own activity rows
CREATE POLICY "activity_select" ON public.activity
  FOR SELECT USING (user_id = auth.uid());

-- Anyone who is a group member can insert activity rows for others in that group
CREATE POLICY "activity_insert" ON public.activity
  FOR INSERT WITH CHECK (
    actor_id = auth.uid()
    AND (
      group_id IS NULL
      OR is_group_member(group_id)
    )
  );

-- Users can mark their own activity as read
CREATE POLICY "activity_update" ON public.activity
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================
-- SOURCE: supabase/migrations/007_activity_realtime.sql
-- ============================================================

-- Migration 007: Enable realtime for activity table
-- Without this the postgres_changes subscription fires no events.
-- REPLICA IDENTITY FULL is required for filtered subscriptions on non-PK columns.

ALTER TABLE public.activity REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity;


-- ============================================================
-- SOURCE: supabase/migrations/008_push_tokens.sql
-- ============================================================

-- Migration 008: Push tokens table for expo-notifications

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token      text        NOT NULL,
  platform   text        CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own tokens
CREATE POLICY "push_tokens_select" ON public.push_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "push_tokens_insert" ON public.push_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens_delete" ON public.push_tokens
  FOR DELETE USING (user_id = auth.uid());


-- ============================================================
-- SOURCE: supabase/migrations/009_notification_prefs.sql
-- ============================================================

-- Migration 009: Per-user notification preferences

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{
    "expense_added": true,
    "expense_edited": true,
    "settlement_received": true,
    "comment_added": true
  }'::jsonb;


-- ============================================================
-- SOURCE: supabase/migrations/010_soft_delete.sql
-- ============================================================

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


-- ============================================================
-- SOURCE: supabase/migrations/011_app_config.sql
-- ============================================================

-- App-level remote config (force update, version gating).
-- One row, id = 'default'. Read by any authenticated user. Write restricted to service role.

create table if not exists public.app_config (
  id              text primary key default 'default',
  min_version     text not null default '1.0.0',   -- semver: app below this MUST update (force)
  latest_version  text not null default '1.0.0',   -- semver: app below this SHOULD update (soft)
  force_update    boolean not null default false,   -- true = block the app, false = dismissible nudge
  message         text not null default 'A new version of SplitNow is available.',
  store_url_android text not null default 'https://play.google.com/store/apps/details?id=com.vertazon.splitnow',
  store_url_ios     text not null default 'https://apps.apple.com/app/splitnow/id0000000000',
  updated_at      timestamptz not null default now()
);

-- Seed the single config row
insert into public.app_config (id) values ('default')
  on conflict (id) do nothing;

-- RLS: any authenticated user can read, nobody can write via client
alter table public.app_config enable row level security;

create policy "anyone can read app_config"
  on public.app_config for select
  using (auth.role() = 'authenticated');
