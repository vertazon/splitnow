-- SplitNow seed data
-- Produces these balances for Aryan:
--   Aryan owes Raj   ₹640
--   Aryan owes Arjun ₹900
--   Priya owes Aryan ₹300
--   Net: Aryan owes ₹1,240
--
-- Run this AFTER schema.sql. Safe to re-run (truncates first).

truncate table
  public.expense_comments,
  public.expense_splits,
  public.expenses,
  public.settlements,
  public.group_members,
  public.groups,
  public.users
restart identity cascade;

-- ─── Users ─────────────────────────────────────────────────────────────────────
insert into public.users (id, name, phone, upi_id, avatar_color) values
  ('11111111-1111-1111-1111-111111111111', 'Aryan',  '+919999900001', 'aryan@okaxis',  'green'),
  ('22222222-2222-2222-2222-222222222222', 'Raj',    '+919999900002', 'raj@okaxis',    'blue'),
  ('33333333-3333-3333-3333-333333333333', 'Priya',  '+919999900003', 'priya@okhdfc',  'purple'),
  ('44444444-4444-4444-4444-444444444444', 'Arjun',  '+919999900004', 'arjun@ybl',     'orange'),
  ('55555555-5555-5555-5555-555555555555', 'Deepak', '+919999900005', 'deepak@okicici','blue');

-- ─── Group ─────────────────────────────────────────────────────────────────────
insert into public.groups (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Flat 4B', '11111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555');

-- ─── Expenses producing the target balances ──────────────────────────────────

-- 1) Raj paid ₹1280 for dinner, split equally with Aryan → Aryan owes Raj ₹640
with e as (
  insert into public.expenses (id, group_id, title, amount, category, paid_by, added_by, note)
  values ('e1111111-1111-1111-1111-111111111111',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'Dinner · BBQ Nation', 1280, 'food',
          '22222222-2222-2222-2222-222222222222',
          '22222222-2222-2222-2222-222222222222',
          null)
  returning id
)
insert into public.expense_splits (expense_id, user_id, amount_owed, settled)
select e.id, u.user_id, 640, u.is_payer from e
cross join (values
  ('11111111-1111-1111-1111-111111111111'::uuid, false),
  ('22222222-2222-2222-2222-222222222222'::uuid, true)
) as u(user_id, is_payer);

-- A couple of seed comments on the dinner expense (matches the prototype data)
insert into public.expense_comments (expense_id, user_id, text, created_at) values
  ('e1111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333',
   'Great dinner! When do we settle up?',
   now() - interval '4 hours'),
  ('e1111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'Let''s do it this weekend',
   now() - interval '3 hours 30 minutes');

-- 2) Arjun paid ₹1800 for groceries, split equally with Aryan → Aryan owes Arjun ₹900
with e as (
  insert into public.expenses (id, group_id, title, amount, category, paid_by, added_by, note)
  values ('e2222222-2222-2222-2222-222222222222',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'Monthly groceries · BigBasket', 1800, 'groceries',
          '44444444-4444-4444-4444-444444444444',
          '44444444-4444-4444-4444-444444444444',
          null)
  returning id
)
insert into public.expense_splits (expense_id, user_id, amount_owed, settled)
select e.id, u.user_id, 900, u.is_payer from e
cross join (values
  ('11111111-1111-1111-1111-111111111111'::uuid, false),
  ('44444444-4444-4444-4444-444444444444'::uuid, true)
) as u(user_id, is_payer);

-- 3) Aryan paid ₹600 for electricity, split equally with Priya → Priya owes Aryan ₹300
with e as (
  insert into public.expenses (id, group_id, title, amount, category, paid_by, added_by, note)
  values ('e3333333-3333-3333-3333-333333333333',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'Electricity bill · April', 600, 'bills',
          '11111111-1111-1111-1111-111111111111',
          '11111111-1111-1111-1111-111111111111',
          null)
  returning id
)
insert into public.expense_splits (expense_id, user_id, amount_owed, settled)
select e.id, u.user_id, 300, u.is_payer from e
cross join (values
  ('11111111-1111-1111-1111-111111111111'::uuid, true),
  ('33333333-3333-3333-3333-333333333333'::uuid, false)
) as u(user_id, is_payer);

-- 4) Personal: Aryan's chai (no split with anyone else)
with e as (
  insert into public.expenses (id, group_id, title, amount, category, paid_by, added_by, note)
  values ('e4444444-4444-4444-4444-444444444444',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'Chai · CCD', 80, 'chai',
          '11111111-1111-1111-1111-111111111111',
          '11111111-1111-1111-1111-111111111111',
          null)
  returning id
)
insert into public.expense_splits (expense_id, user_id, amount_owed, settled)
select e.id, '11111111-1111-1111-1111-111111111111', 80, true from e;

-- 5) Personal: Aryan's Jio recharge
with e as (
  insert into public.expenses (id, group_id, title, amount, category, paid_by, added_by, note)
  values ('e5555555-5555-5555-5555-555555555555',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'Jio recharge', 299, 'recharge',
          '11111111-1111-1111-1111-111111111111',
          '11111111-1111-1111-1111-111111111111',
          null)
  returning id
)
insert into public.expense_splits (expense_id, user_id, amount_owed, settled)
select e.id, '11111111-1111-1111-1111-111111111111', 299, true from e;

-- 6) Personal: Aryan's Ola cab
with e as (
  insert into public.expenses (id, group_id, title, amount, category, paid_by, added_by, note)
  values ('e6666666-6666-6666-6666-666666666666',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'Ola cab', 161, 'travel',
          '11111111-1111-1111-1111-111111111111',
          '11111111-1111-1111-1111-111111111111',
          null)
  returning id
)
insert into public.expense_splits (expense_id, user_id, amount_owed, settled)
select e.id, '11111111-1111-1111-1111-111111111111', 161, true from e;
