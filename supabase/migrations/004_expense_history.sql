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
