-- ─────────────────────────────────────────────────────────────────────────────
-- SplitNow — Seed Data (May 2026)
--
-- 5 users: Himanshu, Nidhish, Raj, Arjun, Deepak
-- Prerequisites:
--   1. All 5 users have signed up via OTP — public.users rows exist
--   2. All RLS migration files (001–004) have been run
--
-- Fully idempotent: deletes seeded rows by fixed UUID before re-inserting.
-- Safe to re-run at any time.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_himanshu  uuid := '5a655e0c-c61a-4652-8738-3ae4245d84fb';
  u_nidhish   uuid := '2a3e7220-1c56-4190-92ef-2873911db9ff';
  u_raj       uuid := 'bff2549b-edc1-43ed-8d3c-e95677982855';
  u_arjun     uuid := '4c9cc1de-9d9f-41ae-bdda-b9b1695725c4';
  u_deepak    uuid := 'c3f1a554-9996-4fa5-a1e8-3325f2fc85c4';

  g_flat uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  e1 uuid := 'e1000000-0000-0000-0000-000000000001';
  e2 uuid := 'e2000000-0000-0000-0000-000000000002';
  e3 uuid := 'e3000000-0000-0000-0000-000000000003';
  e4 uuid := 'e4000000-0000-0000-0000-000000000004';
  e5 uuid := 'e5000000-0000-0000-0000-000000000005';
  e6 uuid := 'e6000000-0000-0000-0000-000000000006';
  e7 uuid := 'e7000000-0000-0000-0000-000000000007';
  e8 uuid := 'e8000000-0000-0000-0000-000000000008';
  e9 uuid := 'e9000000-0000-0000-0000-000000000009';

  all_users  uuid[] := ARRAY[u_himanshu, u_nidhish, u_raj, u_arjun, u_deepak];
  all_expns  uuid[] := ARRAY[e1,e2,e3,e4,e5,e6,e7,e8,e9];

BEGIN

-- ─── Cleanup previous seed data (delete in FK-safe order) ────────────────────

  DELETE FROM expense_comments WHERE expense_id = ANY(all_expns);
  DELETE FROM expense_splits   WHERE expense_id = ANY(all_expns);
  DELETE FROM settlements      WHERE group_id = g_flat;
  DELETE FROM expenses         WHERE id = ANY(all_expns);
  DELETE FROM group_members    WHERE group_id = g_flat;
  DELETE FROM friendships
    WHERE user_id = ANY(all_users) OR friend_id = ANY(all_users);
  DELETE FROM groups WHERE id = g_flat;


-- ─── Upsert user profiles ────────────────────────────────────────────────────

  INSERT INTO public.users (id, name, avatar_color) VALUES
    (u_himanshu, 'Himanshu', 'green'),
    (u_nidhish,  'Nidhish',  'blue'),
    (u_raj,      'Raj',      'purple'),
    (u_arjun,    'Arjun',    'red'),
    (u_deepak,   'Deepak',   'blue')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, avatar_color = EXCLUDED.avatar_color;


-- ─── Personal groups (creates if missing, no-op if already exists) ───────────

  PERFORM create_personal_group(u_himanshu);
  PERFORM create_personal_group(u_nidhish);
  PERFORM create_personal_group(u_raj);
  PERFORM create_personal_group(u_arjun);
  PERFORM create_personal_group(u_deepak);


-- ─── Friendships ─────────────────────────────────────────────────────────────

  INSERT INTO friendships (user_id, friend_id) VALUES
    (u_nidhish,  u_arjun),
    (u_nidhish,  u_himanshu),
    (u_nidhish,  u_raj),
    (u_nidhish,  u_deepak),
    (u_arjun,    u_himanshu),
    (u_arjun,    u_raj),
    (u_arjun,    u_deepak),
    (u_himanshu, u_raj),
    (u_himanshu, u_deepak),
    (u_raj,      u_deepak)
  ON CONFLICT DO NOTHING;


-- ─── Flat group ───────────────────────────────────────────────────────────────

  INSERT INTO groups (id, name, cover_emoji, group_type, created_by)
  VALUES (g_flat, 'Flat', '🏠', 'flat', u_himanshu);

  INSERT INTO group_members (group_id, user_id, role) VALUES
    (g_flat, u_himanshu, 'admin'),
    (g_flat, u_nidhish,  'member'),
    (g_flat, u_raj,      'member'),
    (g_flat, u_arjun,    'member'),
    (g_flat, u_deepak,   'member');


-- ─── Expenses ────────────────────────────────────────────────────────────────

  -- 1. Electricity Bill — ₹2,400 — Nidhish paid — all 5 equal (₹480 each)
  INSERT INTO expenses (id, group_id, title, amount, category, paid_by, added_by, created_at)
  VALUES (e1, g_flat, 'Electricity Bill', 2400, 'bills', u_nidhish, u_nidhish, NOW() - INTERVAL '7 days');
  INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (e1, u_himanshu, 480), (e1, u_nidhish, 480), (e1, u_raj, 480),
    (e1, u_arjun, 480),    (e1, u_deepak, 480);

  -- 2. Groceries — ₹840 — Himanshu paid — all 5 equal (₹168 each)
  INSERT INTO expenses (id, group_id, title, amount, category, paid_by, added_by, created_at)
  VALUES (e2, g_flat, 'Groceries', 840, 'groceries', u_himanshu, u_himanshu, NOW() - INTERVAL '6 days');
  INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (e2, u_himanshu, 168), (e2, u_nidhish, 168), (e2, u_raj, 168),
    (e2, u_arjun, 168),    (e2, u_deepak, 168);

  -- 3. Dinner BBQ Nation — ₹3,000 — Raj paid — all 5 equal (₹600 each)
  INSERT INTO expenses (id, group_id, title, amount, category, paid_by, added_by, note, created_at)
  VALUES (e3, g_flat, 'Dinner BBQ Nation', 3000, 'food', u_raj, u_raj, 'Friday night dinner 🔥', NOW() - INTERVAL '5 days');
  INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (e3, u_himanshu, 600), (e3, u_nidhish, 600), (e3, u_raj, 600),
    (e3, u_arjun, 600),    (e3, u_deepak, 600);

  -- 4. WiFi Bill — ₹1,200 — Deepak paid — all 5 equal (₹240 each)
  INSERT INTO expenses (id, group_id, title, amount, category, paid_by, added_by, created_at)
  VALUES (e4, g_flat, 'WiFi Bill', 1200, 'bills', u_deepak, u_deepak, NOW() - INTERVAL '4 days');
  INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (e4, u_himanshu, 240), (e4, u_nidhish, 240), (e4, u_raj, 240),
    (e4, u_arjun, 240),    (e4, u_deepak, 240);

  -- 5. Gas Cylinder — ₹900 — Arjun paid — all 5 equal (₹180 each)
  INSERT INTO expenses (id, group_id, title, amount, category, paid_by, added_by, created_at)
  VALUES (e5, g_flat, 'Gas Cylinder', 900, 'bills', u_arjun, u_arjun, NOW() - INTERVAL '3 days');
  INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (e5, u_himanshu, 180), (e5, u_nidhish, 180), (e5, u_raj, 180),
    (e5, u_arjun, 180),    (e5, u_deepak, 180);

  -- 6. Ola Cab — ₹320 — Himanshu paid — Himanshu + Nidhish only (₹160 each)
  INSERT INTO expenses (id, group_id, title, amount, category, paid_by, added_by, created_at)
  VALUES (e6, g_flat, 'Ola Cab', 320, 'travel', u_himanshu, u_himanshu, NOW() - INTERVAL '2 days');
  INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (e6, u_himanshu, 160), (e6, u_nidhish, 160);

  -- 7. Chai Run — ₹180 — Deepak paid — Deepak + Raj only (₹90 each)
  --    Himanshu, Nidhish, Arjun → "not involved"
  INSERT INTO expenses (id, group_id, title, amount, category, paid_by, added_by, created_at)
  VALUES (e7, g_flat, 'Chai Run', 180, 'chai', u_deepak, u_deepak, NOW() - INTERVAL '1 day');
  INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (e7, u_deepak, 90), (e7, u_raj, 90);

  -- 8. Netflix — ₹649 — Himanshu paid — unequal 3-way split
  INSERT INTO expenses (id, group_id, title, amount, category, paid_by, added_by, created_at)
  VALUES (e8, g_flat, 'Netflix Subscription', 649, 'recharge', u_himanshu, u_himanshu, NOW() - INTERVAL '12 hours');
  INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (e8, u_himanshu, 216), (e8, u_nidhish, 217), (e8, u_raj, 216);

  -- 9. House Party Groceries — ₹1,560 — Raj paid — Raj + Himanshu + Nidhish (₹520 each)
  INSERT INTO expenses (id, group_id, title, amount, category, paid_by, added_by, note, created_at)
  VALUES (e9, g_flat, 'House Party Groceries', 1560, 'groceries', u_raj, u_raj, 'Saturday house party', NOW() - INTERVAL '6 hours');
  INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES
    (e9, u_himanshu, 520), (e9, u_nidhish, 520), (e9, u_raj, 520);


-- ─── Settlement ───────────────────────────────────────────────────────────────

  INSERT INTO settlements (group_id, from_user, to_user, amount, status, settled_at)
  VALUES (g_flat, u_himanshu, u_nidhish, 500, 'completed', NOW() - INTERVAL '3 days');


-- ─── Comments ────────────────────────────────────────────────────────────────

  INSERT INTO expense_comments (expense_id, user_id, text, created_at) VALUES
    (e3, u_raj,      'That was insane 🔥 we should go again',      NOW() - INTERVAL '5 days' + INTERVAL '2 hours'),
    (e3, u_arjun,    'Best dinner this month 😍',                   NOW() - INTERVAL '5 days' + INTERVAL '3 hours'),
    (e3, u_himanshu, 'Raj you absolute legend 🙏',                  NOW() - INTERVAL '5 days' + INTERVAL '4 hours');

  INSERT INTO expense_comments (expense_id, user_id, text, created_at) VALUES
    (e8, u_nidhish, 'My share is ₹217 because I watched the most 😂', NOW() - INTERVAL '10 hours');

END $$;
