# SplitNow — Activity Feed, Notifications & Expense Changelog Plan

## Recommended Build Sequence

> **Why this order?** Each phase is independently shippable and the next one builds on the previous.

| # | Phase | Rationale |
|---|---|---|
| **1st** | Phase 3 — Expense Changelog | Fully self-contained — one DB table, diff logic in the existing edit mutation, UI inside an existing screen. Zero new infrastructure. Fastest to ship, immediate visible value. |
| **2nd** | Phase 1 — Activity Feed | Requires the `activity` table + fan-out writes + new bell + new screen. No push infrastructure yet. This is the foundation everything else builds on — must come before push. |
| **3rd** | Phase 2 — Push Notifications | Layers directly on the `activity` table from Phase 1. Since activity rows are already being written, push only needs token registration + the Edge Function + a webhook. |
| **4th** | Phase 4 — Notification Settings | Polish layer. Only useful once users are actually receiving push notifications and want control over them. |

---

## Overview

Three interconnected features, implemented in four phases:

| Feature | What it is | Where it lives |
|---|---|---|
| **Activity Feed** | In-app list of events relevant to you | Bell icon → `app/activity.tsx` |
| **Push Notifications** | Phone alert when something happens | System tray → deep-links into app |
| **Expense Changelog** | Exact diff of what changed on an edit | Inside `app/expense/[id].tsx` |
| **Notification Settings** | Per-type toggles to control what you receive | `app/notification-settings.tsx` |

---

## Architecture

```
DB Event (expense insert / settlement / comment / edit)
    ↓
App mutation writes to `activity` table (fan-out — one row per recipient)
    ↓
Supabase DB Webhook fires Edge Function on activity INSERT
    ↓
Edge Function → Expo Push API → user's phone (APNs / FCM via Expo)
    ↓
User taps notification → app opens → navigates to expense / settlement
```

Push stack: **expo-notifications** + **Expo Push Service** (free, no Firebase setup needed).

---

## Database Changes

### 1. `activity` table

```sql
create table public.activity (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references users(id) on delete cascade,  -- recipient
  actor_id   uuid        references users(id),                    -- who did it
  type       text        not null,
  ref_id     uuid,       -- expense_id / settlement_id / comment_id
  ref_type   text,       -- 'expense' | 'settlement' | 'comment'
  group_id   uuid        references groups(id) on delete cascade,
  meta       jsonb,      -- { title, amount, category, comment_text, group_name }
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

create index activity_user_created_idx on activity (user_id, created_at desc);
create index activity_unread_idx on activity (user_id, read) where read = false;
```

**Event types:**

| `type` | Trigger | Recipients |
|---|---|---|
| `expense_added` | New expense logged | All split members except `added_by` |
| `expense_edited` | Expense edited | All split members except editor |
| `settlement_received` | Settlement recorded | The `to_user` |
| `comment_added` | Comment posted | Expense payer + all split members except commenter |
| `friend_added` | Friend joined via invite code | The inviter |

**`meta` shape per type:**

```jsonb
-- expense_added / expense_edited
{ "title": "Groceries", "amount": 420, "category": "groceries", "group_name": "Flat" }

-- settlement_received
{ "amount": 300, "group_name": "Flat" }

-- comment_added
{ "expense_title": "Dinner", "comment_text": "Split cab too?" }

-- friend_added
{ "friend_name": "Priya" }
```

---

### 2. `push_tokens` table

```sql
create table public.push_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references users(id) on delete cascade,
  token      text        not null,
  platform   text        check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
```

---

### 3. `expense_history` table

```sql
create table public.expense_history (
  id          uuid        primary key default gen_random_uuid(),
  expense_id  uuid        references expenses(id) on delete cascade,
  changed_by  uuid        references users(id),
  changes     jsonb       not null,
  created_at  timestamptz not null default now()
);

create index expense_history_expense_idx on expense_history (expense_id, created_at desc);
```

**`changes` jsonb — array of diff entries:**

```jsonb
[
  { "field": "title",            "from": "6milk",   "to": "5milk"  },
  { "field": "amount",           "from": 265.00,    "to": 242.00   },
  { "field": "category",         "from": "food",    "to": "groceries" },
  { "field": "split.userId123",  "from": 88.30,     "to": 80.60    },
  { "field": "split.userId456",  "from": 88.30,     "to": 96.00    }
]
```

Split diff entries use `"split.<userId>"` as the field key. The UI resolves the userId to a name via the member map.

---

### 4. `notification_prefs` column on `users` (Phase 4)

```sql
alter table public.users
  add column notification_prefs jsonb not null default '{
    "expense_added": true,
    "expense_edited": true,
    "settlement_received": true,
    "comment_added": true,
    "friend_added": true
  }'::jsonb;
```

---

## New Files

```
app/
  activity.tsx                  ← Activity feed screen (stack, slide_from_right)
  notification-settings.tsx     ← Notification preference toggles (stack)
hooks/
  useActivity.ts                ← fetch, unread count, markRead, markAllRead, realtime sub
  useNotifications.ts           ← permission request, token registration, tap handler
  useExpenseHistory.ts          ← fetch history rows for an expense
lib/
  notifications.ts              ← registerForPushNotificationsAsync, handleNotificationTap
supabase/
  migrations/
    activity.sql                ← activity + push_tokens + expense_history tables
  functions/
    notify-on-activity/
      index.ts                  ← Edge Function: fetch token → call Expo Push API
```

---

## Modified Files

| File | Change |
|---|---|
| `app/(tabs)/index.tsx` | Add bell icon + unread badge in header |
| `app/expense/[id].tsx` | Add history section at bottom of screen |
| `app/account.tsx` | Add "Notifications" row linking to settings |
| `hooks/useExpenses.ts` | Fan-out activity writes on addExpense + editExpense; write expense_history on edit |
| `hooks/useSettlements.ts` | Fan-out activity write on settleUp |
| `app/_layout.tsx` | Register push token + notification tap listener on mount |
| `lib/queryKeys.ts` | Add `qk.activity.*`, `qk.expenseHistory.*` keys |

---

## Phase 1 — Activity Feed

**Goal:** In-app feed with real-time updates. No push yet.

### `hooks/useActivity.ts`

```ts
useActivity(userId)      // paginated, newest-first, invalidated by realtime
useUnreadCount(userId)   // returns number — used for bell badge
markRead(id)             // PATCH activity SET read=true WHERE id=?
markAllRead(userId)      // PATCH activity SET read=true WHERE user_id=?
```

Real-time: Supabase `.channel('activity').on('postgres_changes', { table: 'activity', filter: `user_id=eq.${userId}` })` — same pattern as `useExpenses`.

### `app/activity.tsx` — UI

Screen title: `Activity`
Back button: standard stack back (chevron-left, 36×36, cardElevated bg)
Header right: "Mark all read" button (text, accent color) — hidden when unread count is 0

**Row layout:**
```
[Avatar 38px]  [Event text 13px semibold]          [Time 11px text2]
               [Sub-text 12px text2]                [● unread dot]
```

**Event text copy:**
```
expense_added:       "Raj added Groceries"       sub: "You owe ₹140 · 🏠 Flat"
expense_edited:      "Raj updated Groceries"     sub: "₹420 → ₹380 · 🏠 Flat"
settlement_received: "Priya settled ₹300 with you"  sub: "🏠 Flat"
comment_added:       "Raj commented on Dinner"   sub: "Split cab too?"
friend_added:        "Priya joined via your invite"  sub: ""
```

**Grouping:**
- `TODAY` — events from today
- `THIS WEEK` — events from last 7 days (excluding today)
- `EARLIER` — everything older

Tapping a row:
- `expense_added` / `expense_edited` / `comment_added` → `router.push('/expense/' + ref_id)`
- `settlement_received` → `router.push('/settle')`
- `friend_added` → `router.push('/friends')`
Tap also calls `markRead(row.id)`.

### Home header bell

```tsx
// Right side of header: bell + avatar
<TouchableOpacity onPress={() => router.push('/activity')}>
  <View style={styles.bellWrap}>
    <Ionicons name="notifications-outline" size={22} color={colors.text} />
    {unreadCount > 0 && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
      </View>
    )}
  </View>
</TouchableOpacity>
```

Badge: 16×16px circle, bg `#FF5959`, text white 9px bold, positioned top-right of bell icon.

### Fan-out write helper

```ts
// lib/activityFanOut.ts
async function fanOutActivity(rows: ActivityInsert[]) {
  await supabase.from('activity').insert(rows);
}
```

Called inside each mutation's `onSuccess`:

**addExpense fan-out:**
```ts
const splitMembers = splits.map(s => s.userId).filter(id => id !== addedBy);
await fanOutActivity(splitMembers.map(userId => ({
  user_id: userId,
  actor_id: addedBy,
  type: 'expense_added',
  ref_id: expense.id,
  ref_type: 'expense',
  group_id: expense.group_id,
  meta: { title: expense.title, amount: expense.amount, category: expense.category, group_name },
})));
```

**settleUp fan-out:**
```ts
await fanOutActivity([{
  user_id: toUserId,
  actor_id: currentUserId,
  type: 'settlement_received',
  ref_id: settlement.id,
  ref_type: 'settlement',
  group_id,
  meta: { amount, group_name },
}]);
```

---

## Phase 2 — Push Notifications

**Package to install:** `expo-notifications`

**`app.json` changes:**
```json
{
  "expo": {
    "plugins": [
      ["expo-notifications", {
        "icon": "./assets/notification-icon.png",
        "color": "#00D49A"
      }]
    ]
  }
}
```

### `lib/notifications.ts`

```ts
async function registerForPushNotificationsAsync(): Promise<string | null>
// 1. Check if device is physical (simulators can't receive push)
// 2. Request permissions via Notifications.requestPermissionsAsync()
// 3. Get token via Notifications.getExpoPushTokenAsync()
// 4. Return token string or null if denied

async function upsertPushToken(userId: string, token: string, platform: 'ios' | 'android')
// Upsert to push_tokens table

function handleNotificationTap(response: NotificationResponse, router: Router)
// Parse response.notification.request.content.data
// { ref_type: 'expense', ref_id: '...' } → router.push('/expense/' + ref_id)
// { ref_type: 'settlement' } → router.push('/settle')
// { ref_type: 'comment', ref_id: '...' } → router.push('/expense/' + ref_id)
```

### `app/_layout.tsx` changes

```ts
// On mount (after user is authenticated):
useEffect(() => {
  if (!currentUserId) return;
  registerForPushNotificationsAsync().then(token => {
    if (token) upsertPushToken(currentUserId, token, Platform.OS as 'ios' | 'android');
  });

  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    handleNotificationTap(response, router);
  });
  return () => sub.remove();
}, [currentUserId]);
```

### Supabase Edge Function: `notify-on-activity`

File: `supabase/functions/notify-on-activity/index.ts`

```ts
// Triggered by DB webhook on activity INSERT
// Request body: { type: 'INSERT', table: 'activity', record: ActivityRow }

Deno.serve(async (req) => {
  const { record } = await req.json();

  // 1. Skip if actor == recipient (self-actions don't notify)
  if (record.actor_id === record.user_id) return ok();

  // 2. Fetch push token
  const { data: tokenRow } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', record.user_id)
    .single();
  if (!tokenRow) return ok();

  // 3. (Phase 4) Check notification_prefs
  // const { data: user } = await supabase.from('users').select('notification_prefs').eq('id', record.user_id).single();
  // if (!user.notification_prefs[record.type]) return ok();

  // 4. Build payload
  const { title, body } = buildPayload(record);

  // 5. Send via Expo Push API
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: tokenRow.token,
      title,
      body,
      data: { ref_type: record.ref_type, ref_id: record.ref_id },
      sound: 'default',
    }),
  });

  return ok();
});
```

**`buildPayload` copy:**
```ts
expense_added:       title: "{actor} added {title}", body: "You owe ₹{your_split}"
expense_edited:      title: "{actor} updated {title}", body: "₹{old} → ₹{new}"
settlement_received: title: "{actor} settled up", body: "You received ₹{amount}"
comment_added:       title: "{actor} commented on {expense_title}", body: "{comment_text}"
friend_added:        title: "{actor} joined SplitNow", body: "Added via your invite"
```

**DB Webhook setup (Supabase dashboard):**
- Table: `activity` · Event: `INSERT`
- HTTP POST → `https://<project-ref>.supabase.co/functions/v1/notify-on-activity`
- Headers: `Authorization: Bearer <service_role_key>`

---

## Phase 3 — Expense Changelog

### Edit mutation changes (`useExpenses.ts`)

Before saving the edit, compute the diff:

```ts
function computeExpenseDiff(before: Expense, after: ExpenseInput, beforeSplits, afterSplits): DiffEntry[] {
  const changes: DiffEntry[] = [];
  if (before.title !== after.title)
    changes.push({ field: 'title', from: before.title, to: after.title });
  if (before.amount !== after.amount)
    changes.push({ field: 'amount', from: before.amount, to: after.amount });
  if (before.category !== after.category)
    changes.push({ field: 'category', from: before.category, to: after.category });
  // per-user split diffs
  afterSplits.forEach(s => {
    const prev = beforeSplits.find(b => b.user_id === s.user_id);
    if (prev && prev.amount_owed !== s.amount_owed)
      changes.push({ field: `split.${s.user_id}`, from: prev.amount_owed, to: s.amount_owed });
  });
  return changes;
}
```

After saving, insert into `expense_history`:
```ts
if (diff.length > 0) {
  await supabase.from('expense_history').insert({
    expense_id: id,
    changed_by: currentUserId,
    changes: diff,
  });
}
```

### `hooks/useExpenseHistory.ts`

```ts
useExpenseHistory(expenseId)
// Fetches expense_history rows for this expense, newest-first
// Joins changed_by to get actor name
// Returns: { id, changedBy: { id, name, avatar_color }, changes, created_at }[]
```

### `app/expense/[id].tsx` — History section

Added below the comments section:

```
HISTORY

Raj updated this expense · 2h ago
  · Description changed from "6milk" to "5milk"
  · Raj's share changed from ₹88 to ₹80
  · Priya's share changed from ₹88 to ₹96

Aryan added this expense · Yesterday
```

**"Added" entry:** Always shown as the last history item, derived from `expense.added_by` + `expense.created_at` (not a real history row — synthesized in UI).

**Diff row rendering:**
- Field `title` → "Description changed from X to Y"
- Field `amount` → "Total changed from ₹X to ₹Y"
- Field `category` → "Category changed from X to Y"
- Field `split.<userId>` → "{name}'s share changed from ₹X to ₹Y"

**Styling:** Same card as comments section. History entries use `colors.text2` for the changed-from value, `colors.text` for the changed-to value.

---

## Phase 4 — Notification Settings

### `app/notification-settings.tsx`

Stack screen, accessible from `app/account.tsx` → "Notifications" row.

```
NOTIFY ME WHEN
─────────────────────────────────────────
New expenses                    [toggle ON ]
Expense edits                   [toggle ON ]
Settlements received            [toggle ON ]
Comments                        [toggle ON ]
Friend activity                 [toggle OFF]
```

Toggle: React Native `Switch` with `trackColor={{ true: colors.accent }}`.

Saves to `users.notification_prefs` jsonb column on toggle change (debounced 500ms).

Edge Function reads `notification_prefs` before sending (see commented code in Phase 2).

---

## Implementation Order

Build in this sequence — each step is a discrete, testable unit of work.

### Build 1 — Expense Changelog (Phase 3 first)
```
Step 1   DB migration            — expense_history table only
Step 2   Expense history diff    — computeExpenseDiff helper + insert in useExpenses editExpense mutation
Step 3   hooks/useExpenseHistory — fetch hook + queryKey
Step 4   expense/[id].tsx        — history section UI (below comments)
```
✓ Shippable: edit an expense → history appears in detail screen.

---

### Build 2 — Activity Feed (Phase 1)
```
Step 5   DB migration            — activity table (push_tokens can wait)
Step 6   lib/queryKeys.ts        — add activity.* keys
Step 7   lib/activityFanOut.ts   — fan-out insert helper
Step 8   hooks/useActivity.ts    — fetch + unread count + realtime sub + markRead/markAllRead
Step 9   Fan-out writes          — update useExpenses (add + edit), useSettlements, comment mutations
Step 10  app/activity.tsx        — feed screen (TODAY / THIS WEEK / EARLIER sections)
Step 11  Home header bell        — bell icon + unread badge in index.tsx
```
✓ Shippable: activity rows created on every event, feed screen live, badge updates in real-time.

---

### Build 3 — Push Notifications (Phase 2)
```
Step 12  DB migration            — push_tokens table
Step 13  expo-notifications      — install package, update app.json plugins
Step 14  lib/notifications.ts    — registerForPushNotificationsAsync, upsertPushToken, handleNotificationTap
Step 15  app/_layout.tsx         — token registration + tap listener on mount
Step 16  Edge Function           — supabase/functions/notify-on-activity/index.ts
Step 17  DB Webhook              — wire in Supabase dashboard (activity INSERT → Edge Function)
```
✓ Shippable: phone receives push when a group member adds expense / settles / comments. Tap navigates to correct screen.

---

### Build 4 — Notification Settings (Phase 4)
```
Step 18  DB migration            — notification_prefs jsonb column on users
Step 19  app/account.tsx         — add "Notifications" row
Step 20  app/notification-settings.tsx — toggle screen
Step 21  Edge Function update    — read notification_prefs before sending (uncomment check)
```
✓ Shippable: users can disable specific notification types from Account screen.

---

## Design Notes

### Bell icon badge
```
Size: 16×16px, borderRadius 8
Background: #FF5959
Text: white, 9px, 700 weight
Position: absolute, top: -4, right: -4 relative to bell icon
Hidden when unreadCount === 0
```

### Activity row
```
paddingHorizontal: 16, paddingVertical: 14
Avatar: 38px, same color system as rest of app
Unread dot: 7px circle, bg accent (#00D49A), absolute right-aligned
Time: 11px, text2, right-aligned
Event text: 13px, semibold, text (primary)
Sub-text: 12px, text2
```

### Expense history entry
```
paddingHorizontal: 16, paddingVertical: 12
Actor line: 12px semibold text + timestamp text2 (same line, spaced)
Diff lines: 12px text2, paddingLeft 12, bullet "·" prefix
Changed-from value: strikethrough or text3 color
Changed-to value: text (primary) or accent
```

---

## Key Query Keys to Add

```ts
// lib/queryKeys.ts additions
activity: {
  all: ['activity'],
  list: (userId: string) => ['activity', 'list', userId],
  unread: (userId: string) => ['activity', 'unread', userId],
},
expenseHistory: {
  all: ['expenseHistory'],
  list: (expenseId: string) => ['expenseHistory', 'list', expenseId],
},
```
