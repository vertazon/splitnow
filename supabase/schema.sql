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
-- See migrations/001_friendships.sql for the full rationale.
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

-- Explicitly disable RLS for the prototype phase.
-- Supabase enables it by default on dashboard-created tables; this overrides that.
alter table public.users               disable row level security;
alter table public.friendships         disable row level security;
alter table public.groups              disable row level security;
alter table public.group_members       disable row level security;
alter table public.expenses            disable row level security;
alter table public.expense_splits      disable row level security;
alter table public.expense_comments    disable row level security;
alter table public.settlements         disable row level security;

-- TODO: enable RLS once Supabase Auth is wired up:
-- alter table public.users             enable row level security;
-- alter table public.groups            enable row level security;
-- alter table public.group_members     enable row level security;
-- alter table public.expenses          enable row level security;
-- alter table public.expense_splits    enable row level security;
-- alter table public.expense_comments  enable row level security;
-- alter table public.settlements       enable row level security;
