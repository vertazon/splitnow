-- ─── Migration 001: invite codes + friendships ───────────────────────────────
-- Run once in the Supabase SQL editor.
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
--
-- WHY the three-step column approach:
--   Calling generate_invite_code() as a column DEFAULT inside ALTER TABLE ADD COLUMN
--   causes Postgres to invoke the function while the table file is mid-modification,
--   producing "could not read blocks" errors. The fix is to:
--     1. Add the column with no default (just nullable)
--     2. Back-fill existing rows in a separate DO block (column now fully exists)
--     3. Add the UNIQUE constraint + DEFAULT as independent DDL statements

-- ─── Step 1: invite-code generator ───────────────────────────────────────────
-- 8 chars from a 32-char alphabet (confusable chars removed: 0, 1, i, l, o).
-- Keyspace: 32^8 ≈ 1.1 trillion. Retry loop guarantees uniqueness.
-- Created before the column exists — no self-reference problem at creation time.

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

    -- invite_code column is guaranteed to exist by the time this function
    -- is called for back-fill or future inserts.
    exit when not exists (
      select 1 from public.users where invite_code = code
    );
  end loop;
  return code;
end;
$$;

-- ─── Step 2: add column with no default (avoids mid-DDL function call) ───────

alter table public.users
  add column if not exists invite_code text;

-- ─── Step 3: back-fill existing rows one at a time ───────────────────────────
-- A DO block runs after the ALTER TABLE is fully committed, so the column
-- is readable and the uniqueness check in generate_invite_code() works safely.

do $$
declare
  r record;
begin
  for r in select id from public.users where invite_code is null loop
    update public.users
      set invite_code = public.generate_invite_code()
    where id = r.id;
  end loop;
end;
$$;

-- ─── Step 4: add UNIQUE constraint + set DEFAULT ─────────────────────────────
-- ADD CONSTRAINT IF NOT EXISTS is not valid syntax in PostgreSQL;
-- use a DO block to guard the idempotent constraint creation.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_invite_code_unique'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_invite_code_unique unique (invite_code);
  end if;
end;
$$;

alter table public.users
  alter column invite_code set default public.generate_invite_code();

-- ─── Friendships ─────────────────────────────────────────────────────────────
-- Single canonical row per pair.
-- Invariant: user_id::text < friend_id::text (lexicographic UUID ordering).
-- This prevents both (A,B) and (B,A) from coexisting.
-- The app's canonicalPair() helper in hooks/useFriends.ts enforces the ordering
-- before every insert; the CHECK constraint is a DB-level safety net.

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

-- ─── Explicitly disable RLS (prototype phase) ────────────────────────────────
-- Supabase enables RLS by default on tables created via the dashboard, even
-- when the SQL schema leaves it off. Explicitly disabling ensures anon sessions
-- can look up users by invite_code and read/write friendships.
-- Re-enable with proper policies before going to production.

alter table public.users        disable row level security;
alter table public.friendships  disable row level security;

-- ─── RLS policies (uncomment when real Auth is wired up) ─────────────────────
-- alter table public.friendships enable row level security;
--
-- create policy "read own friendships" on public.friendships
--   for select using (user_id = auth.uid() or friend_id = auth.uid());
--
-- create policy "insert own friendships" on public.friendships
--   for insert with check (user_id = auth.uid() or friend_id = auth.uid());
--
-- create policy "delete own friendships" on public.friendships
--   for delete using (user_id = auth.uid() or friend_id = auth.uid());
