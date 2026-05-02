# SplitNow — Features & Technical Context

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native, Expo managed workflow (~SDK 54) |
| Navigation | expo-router v3 (file-based, 4 tabs + stack screens) |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| State / Data | TanStack React Query v5 + Zustand |
| Animations | react-native-reanimated v3 |
| Auth | Supabase phone OTP (SMS verification) |
| Font | Plus Jakarta Sans (`@expo-google-fonts/plus-jakarta-sans`) |
| Icons | `@expo/vector-icons` (Ionicons) |

---

## Feature Map

### Implemented (Live)

#### 1. Authentication
- Phone number OTP via Supabase Auth
- New users routed to profile setup (`name`, `avatar_color`, `upi_id`)
- Session persisted via Supabase client; restored on app launch
- AuthGuard in `_layout.tsx` handles all redirect logic

#### 2. Quick Add Strip
The most important feature in the entire app.

- Always visible on the home screen — never hidden or collapsed
- Pre-filled state: last used amount + last used category + last used people
- Components: amount input → category chip → people chips → add button
- On tap of +: expense is logged instantly with no modal or confirmation dialog
- Category chip: tap to cycle through available categories
- People chips: tap to toggle each person on/off
- *UPI SMS integration: planned, not yet implemented*

#### 3. Balance Overview
- Net balance card: single number showing total you owe or are owed
- Per-person breakdown: each group member shown with their balance
- Color coding: red for amounts you owe, green for amounts owed to you
- Inline "Settle" button on rows where you owe money

#### 4. Expense Logging (Full Screen)
- Large centered amount input (auto-focused on screen open)
- Category selection: 6 primary categories as icon + label chips
  - Food 🍛, Groceries 🛒, Travel 🚗, Bills ⚡, Chai/Coffee ☕, Recharge 📱
- People selection: all group members shown as chips, tap to select/deselect
- Live split calculator: shows "Each pays ₹X (N people)" that updates as people are toggled
- Single Add button — description field optional

#### 5. Expense Detail & Edit
- Tap any expense to open full detail view (`app/expense/[id].tsx`)
- Shows: title, amount, category, date, paid-by, splits, notes
- Edit button routes to `app/expense/edit/[id].tsx`
- Both screens use `slide_from_right` stack navigation with chevron-back button

#### 6. Settle Up
- Total owed amount prominently displayed
- "⚡ Settle All" CTA: records all settlements in DB in one tap
- Per-person "Settle" button for individual settlement recording
- Settlements stored in the `settlements` table; balances re-computed from DB
- *UPI deeplinks are disabled (code commented out) — planned for re-enablement*

#### 7. Insights
- This month's total spend
- Number of expenses logged
- Most frequent expense partner
- Average daily spend
- Spending by category (horizontal bar chart)

#### 8. Friends System
- Friends tab: view friends list with per-friend balance
- Add a friend by entering their 8-character invite code
- Each user has a unique `invite_code` (8 chars, auto-generated on signup)
- Join screen (`app/join/[code].tsx`): modal, presented from bottom
- Deep-link support: `splitnow://join/<code>` captured and processed after auth
- Sharing: Invite a Friend in Account screen sends invite message with native share sheet

#### 9. Account Screen (`app/account.tsx`)
- User card: avatar, name, phone, UPI ID
- ACCOUNT: Edit Profile, Manage Groups (placeholder), Settings (placeholder)
- GENERAL: Invite a Friend
- Sign out with Alert confirmation

#### 10. Profile Screen (`app/profile.tsx`)
- Edit name, avatar colour, UPI ID
- Saves to Supabase `users` table
- Stats row: group count, expense count

---

### Planned (Not Yet Implemented)

- UPI deeplink settlement (code exists, commented out — re-enable when ready)
- UPI SMS auto-fill for Quick Add strip
- Manage Groups screen (UI only, no backend yet)
- Settings screen
- WhatsApp bot integration
- OCR receipt scanning
- Recurring expenses
- Group trips / multi-day ledger
- Voice input

---

## Navigation Structure

```
app/
  _layout.tsx              — Root layout: QueryClientProvider, AuthGuard, DeepLinkCapture
  (auth)/
    phone.tsx              — Phone entry screen
    otp.tsx                — OTP verification
    profile.tsx            — Profile setup (new users)
  (tabs)/
    index.tsx              — Home: balance card + Quick Add + recent activity
    add.tsx                — Full expense entry
    settle.tsx             — Settle Up screen
    insights.tsx           — Spending insights
    friends.tsx            — Friends list + add friend
  account.tsx              — Account/profile hub (slide_from_right)
  profile.tsx              — Edit profile (slide_from_right)
  expenses.tsx             — All expenses list (slide_from_right)
  expense/
    [id].tsx               — Expense detail (slide_from_right)
    edit/[id].tsx          — Expense edit (slide_from_right)
  join/[code].tsx          — Join via invite code (modal, slide_from_bottom)
```

---

## Database Schema (Supabase / PostgreSQL)

> **RLS is disabled** for the prototype phase. Enable and write policies before going to production.

### `users`
```sql
id           uuid  PK  default gen_random_uuid()
name         text      -- nullable: set during profile setup
phone        text  UNIQUE
upi_id       text
avatar_color text  default 'green'
invite_code  text  UNIQUE  default generate_invite_code()
created_at   timestamptz
```

### `friendships`
```sql
id         uuid  PK
user_id    uuid  FK → users.id
friend_id  uuid  FK → users.id
created_at timestamptz
-- Invariant: user_id::text < friend_id::text (canonical ordering, one row per pair)
-- Constraint: no_self_friendship, canonical_order, unique(user_id, friend_id)
```

### `groups`
```sql
id          uuid  PK
name        text  NOT NULL
created_by  uuid  FK → users.id
created_at  timestamptz
```

### `group_members`
```sql
group_id   uuid  FK → groups.id  (PK composite)
user_id    uuid  FK → users.id   (PK composite)
joined_at  timestamptz
```

### `expenses`
```sql
id         uuid  PK
group_id   uuid  FK → groups.id
title      text  NOT NULL
amount     numeric(10,2)  check (amount > 0)
category   text  NOT NULL          -- e.g. 'food', 'groceries', 'travel'
type       text  default 'group'   -- 'group' | 'personal' | 'advance'
paid_by    uuid  FK → users.id
added_by   uuid  FK → users.id
note       text
created_at timestamptz
updated_at timestamptz             -- set on edit; null otherwise
```

### `expense_splits`
```sql
id          uuid  PK
expense_id  uuid  FK → expenses.id
user_id     uuid  FK → users.id
share       numeric(10,2)   -- this person's portion of the expense
```

### `settlements`
```sql
id          uuid  PK
group_id    uuid  FK → groups.id
from_user   uuid  FK → users.id   -- person who paid
to_user     uuid  FK → users.id   -- person who was owed
amount      numeric(10,2)
created_at  timestamptz
```

### `expense_comments` *(schema defined, UI not yet built)*
```sql
id          uuid  PK
expense_id  uuid  FK → expenses.id
user_id     uuid  FK → users.id
body        text  NOT NULL
created_at  timestamptz
```

### Balance Computation
Balances are not stored. They are computed on the fly:
```
balance(A→B) = SUM(splits where payer=B, participant=A) − SUM(settlements where from=A, to=B)
```
The `useBalances` hook runs this query against Supabase on each load.

---

## India-Specific Context

### UPI Ecosystem
- Primary payment apps: Google Pay (GPay), PhonePe, Paytm, BHIM
- Every UPI transaction generates an SMS from the user's bank
- SMS format varies by bank but always contains: amount, debit/credit, VPA or merchant name
- UPI deeplinks work across all UPI apps (format: `upi://pay?pa={vpa}&pn={name}&am={amount}&cu=INR`)
- ~80% of urban young adults use UPI daily

### Currency & Number Formatting
- Currency symbol: ₹ (U+20B9)
- Large numbers: comma separator, Indian system where applicable
- For amounts under ₹1,000: `₹540`
- For amounts over ₹1,000: `₹1,240`

### Common Expense Categories in Indian Friend Groups
1. Food (eating out, ordering in) — highest frequency
2. Groceries (Big Basket, local kirana, D-Mart runs)
3. Travel (Ola/Uber/auto, petrol splits, outstation trips)
4. Bills (electricity, WiFi, gas, society maintenance)
5. Chai/Coffee (chai tapri, CCD, Starbucks)
6. Recharge (Jio/Airtel mobile recharges, OTT subscriptions)

---

## Competitive Context

| App | Strength | Weakness for India |
|-----|----------|-------------------|
| Splitwise | Feature complete, trusted | Too many taps, no UPI integration, no SMS auto-fill |
| Google Pay Groups | UPI native | Not a proper ledger, limited splitting logic |
| Paytm Split | UPI native | Cluttered UI, not popular |
| IOU | Simple | No UPI, not India-specific |

**SplitNow's gap:** The intersection of a proper ledger (like Splitwise) + UPI-native payments + SMS auto-fill + minimal friction.
