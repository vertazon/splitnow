# SplitNow — Features & Technical Context

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native, Expo managed workflow (~SDK 54) |
| Navigation | expo-router v3 (file-based, 5 tabs + stack screens) |
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

#### 4. Expense Logging (Full Screen — `app/(tabs)/add.tsx`)
- **Bare hero amount input**: large centered ₹ input, auto-focused, no box wrapper. Font size shrinks dynamically (34px → 20px) as digits increase.
- **Bare centered title input**: "What's this for?" placeholder, sits below the amount
- **Details card**: single `#161616` card containing:
  - Category: horizontal scroll of `emojiOnly` 54×54 square chips (first 8 categories) + "More +" chip for full picker
  - Paid By: tappable row → bottom-sheet picker with member avatars
  - Split With: avatar circle grid (44×44, tap to toggle), split type pill (= Equal / ≠ Amount / ≠ %) opens SplitSheet
- **Pinned footer CTA**: `ctaState` idle/success/error feedback — "Add Expense →" / "✓ Added!" / "Failed — try again"

#### 5. Split Types (via SplitSheet)
- **Equal**: amount divided evenly, no inputs shown
- **By Amount**: each person's exact amount entered manually (must sum to total)
- **By Percentage**: each person's percentage entered (must sum to 100%)
- `SplitSheet` component (`components/SplitSheet.tsx`): bottom-sheet modal with mode tabs, member rows, live validation summary strip

#### 6. Groups (`app/groups/`)
Fully shipped. Groups organize shared expenses by context (flat, trip, custom).

- **Groups list** (`app/groups/index.tsx`): all active groups with member avatar stack and net balance per group
- **Group detail** (`app/groups/[id].tsx`): group-scoped balance card, member list with per-member balances, full expense list, inline Add Expense bottom sheet
- **Create group** (`app/groups/create.tsx`): emoji picker, name input, member chips from friends list
- **Edit group** (`app/groups/edit/[id].tsx`): rename, emoji change, add/remove members

Hooks (all in `hooks/useGroups.ts`):
- `useGroups(userId)` — list with net balances
- `useGroupDetail(groupId)` — single group with members
- `useGroupMembers(groupId)` — members with roles
- `useCreateGroup()` — inserts group + member rows
- `useUpdateGroup()` — name/emoji/type patch
- `useArchiveGroup()` — sets `archived_at`
- `useAddGroupMember()` — upserts member row
- `useRemoveGroupMember()` — soft-removes via `left_at`

#### 7. Expense Detail & Edit
- Tap any expense to open full detail view (`app/expense/[id].tsx`)
- **Hero card**: title, large amount (`38px` bold), net pill (`+₹X you lent` / `−₹X you owe` / `not involved`)
- **Net states**: `lent` (green) / `owed` (red) / `personal` (no pill) / `uninvolved` (grey — you're in the group but not in this split)
- Shows: meta (added by, last edited), PAID BY card, SPLIT WITH card, NOTE card, COMMENTS
- Edit button routes to `app/expense/edit/[id].tsx` — same design as Add screen, hydrated from existing data
- Both screens use `slide_from_right` stack navigation with `chevron-back` button

#### 8. Comments (Live)
- Chat-style bubble UI on expense detail screen
- Real-time via Supabase Realtime channel on `expense_comments` table
- Own messages appear right-aligned (green bubble), others left-aligned (dark bubble)
- Pinned input bar at bottom with send button

#### 9. Settle Up
- Total owed amount prominently displayed
- "⚡ Settle All" CTA: records all settlements in DB in one tap
- Per-person "Settle" button for individual settlement recording
- Settlements stored in the `settlements` table; balances re-computed from DB
- *UPI deeplinks are disabled (code commented out) — planned for re-enablement*

#### 10. Insights
- This month's total spend
- Number of expenses logged
- Most frequent expense partner
- Average daily spend
- Spending by category (horizontal bar chart)

#### 11. Friends System
- Friends tab: view friends list with per-friend balance
- Add a friend by entering their 8-character invite code
- Each user has a unique `invite_code` (8 chars, auto-generated on signup)
- Join screen (`app/join/[code].tsx`): modal, presented from bottom
- Deep-link support: `splitnow://join/<code>` captured and processed after auth
- Sharing: Invite a Friend in Account screen sends invite message with native share sheet

#### 12. Account Screen (`app/account.tsx`)
- User card: avatar, name, phone, UPI ID
- ACCOUNT: Edit Profile, Manage Groups → `app/groups/index.tsx`, Settings (placeholder)
- GENERAL: Invite a Friend
- Sign out with Alert confirmation

#### 13. Profile Screen (`app/profile.tsx`)
- Edit name, avatar colour, UPI ID
- Saves to Supabase `users` table
- Stats row: group count, expense count

---

### Planned (Not Yet Implemented)

- UPI deeplink settlement (code exists, commented out — re-enable when ready)
- UPI SMS auto-fill for Quick Add strip
- Settings screen
- WhatsApp bot integration
- OCR receipt scanning
- Recurring expenses
- Group trips / multi-day ledger
- Voice input
- Group-level insights (spending breakdown scoped to a group)
- Trip mode with auto-archive on end date

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
    add.tsx                — Full expense entry (hero amount + details card)
    settle.tsx             — Settle Up screen
    insights.tsx           — Spending insights
    friends.tsx            — Friends list + add friend
  account.tsx              — Account/profile hub (slide_from_right)
  profile.tsx              — Edit profile (slide_from_right)
  expenses.tsx             — All expenses list (slide_from_right)
  expense/
    [id].tsx               — Expense detail + comments (slide_from_right)
    edit/[id].tsx          — Expense edit (slide_from_right)
  groups/
    index.tsx              — Groups list (slide_from_right)
    [id].tsx               — Group detail + add expense sheet (slide_from_right)
    create.tsx             — Create group (modal, slide_from_bottom)
    edit/[id].tsx          — Edit group (slide_from_right)
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
cover_emoji text  default '🏠'
group_type  text  default 'custom'   -- flat | trip | custom
archived_at timestamptz              -- null = active
created_at  timestamptz
```

### `group_members`
```sql
group_id   uuid  FK → groups.id  (PK composite)
user_id    uuid  FK → users.id   (PK composite)
role       text  default 'member'  -- admin | member
joined_at  timestamptz
left_at    timestamptz             -- null = still a member (soft remove)
```

### `expenses`
```sql
id         uuid  PK
group_id   uuid  FK → groups.id
title      text  NOT NULL
amount     numeric(10,2)  check (amount > 0)
category   text  NOT NULL          -- e.g. 'food', 'groceries', 'travel'
paid_by    uuid  FK → users.id
added_by   uuid  FK → users.id
note       text
created_at timestamptz
updated_at timestamptz             -- set on edit; null otherwise
```

### `expense_splits`
```sql
id          uuid  PK
expense_id  uuid  FK → expenses.id  ON DELETE CASCADE
user_id     uuid  FK → users.id
amount_owed numeric(10,2)           -- this person's portion of the expense
```

> **Note:** The column is `amount_owed`, not `share`. This is the actual live column name.

### `expense_comments`
```sql
id          uuid  PK
expense_id  uuid  FK → expenses.id  ON DELETE CASCADE
user_id     uuid  FK → users.id
text        text  NOT NULL
created_at  timestamptz
```

### `settlements`
```sql
id          uuid  PK
group_id    uuid  FK → groups.id
from_user   uuid  FK → users.id   -- person who paid
to_user     uuid  FK → users.id   -- person who was owed
amount      numeric(10,2)
status      text  default 'completed'
settled_at  timestamptz
```

### Balance Computation
Balances are not stored. They are computed on the fly from `expense_splits` and `settlements`:
```
net(currentUser, group) =
  + SUM(amount_owed WHERE expenses.paid_by = currentUser AND user_id ≠ currentUser AND group_id = group)  -- others owe you
  − SUM(amount_owed WHERE user_id = currentUser AND paid_by ≠ currentUser AND group_id = group)           -- you owe others
  + SUM(settlements WHERE from_user = currentUser AND group_id = group)                                   -- you paid (reduces your debt)
  − SUM(settlements WHERE to_user = currentUser AND group_id = group)                                     -- someone paid you
```

The `useBalances` hook runs this against Supabase on each load. Group-scoped balance is computed similarly inside `useGroups`.

---

## Key Components

### `ActivityRow` (`components/ActivityRow.tsx`)
Renders a single expense or settlement row in any list. Exports:
- `ActivityRow` — expense row with net pill
- `SettlementRow` — settlement row
- `MiniAvatars` — overlapping avatar dots (20×20)
- `getNetBalance(exp, userId)` — computes `{ type: NetType; amount: number }`
- `NetType` = `'lent' | 'owed' | 'personal' | 'uninvolved'`
  - `uninvolved` — user is in the group but has `amount_owed = 0` for this expense. Shows `—` / "not involved" in muted grey. Still shows the payer + avatar row.

### `CategoryChip` (`components/CategoryChip.tsx`)
Props: `category`, `selected`, `onPress`, `inline?`, `emojiOnly?`, `style?`
- Default: pill chip with emoji + label
- `inline`: compact inline chip
- `emojiOnly`: 54×54 square chip showing only the emoji, used in the details card category row

### `SplitSheet` (`components/SplitSheet.tsx`)
Bottom-sheet modal for custom splits. Props: `visible`, `onClose`, `members`, `totalAmount`, `mode`, `splits`, `currentUserId`, `onConfirm`.
- Tabs: Equal / Amount / %
- Per-member input rows for Amount and % modes
- Live validation strip: shows running sum vs total, error if mismatch
- `onConfirm(mode, splits)` returns the selected mode and raw split map

### `CategoryPickerModal` (`components/CategoryPickerModal.tsx`)
Full-screen modal showing all categories for when the user taps "More +" in the category row.

### `ToastNotification` (`components/ToastNotification.tsx`)
Auto-dismissing toast above the tab bar. Slides up on show, fades out after 2.4s.

---

## India-Specific Context

### UPI Ecosystem
- Primary payment apps: Google Pay (GPay), PhonePe, Paytm, BHIM
- Every UPI transaction generates an SMS from the user's bank
- UPI deeplinks work across all UPI apps (format: `upi://pay?pa={vpa}&pn={name}&am={amount}&cu=INR`)
- ~80% of urban young adults use UPI daily

### Currency & Number Formatting
- Currency symbol: ₹ (U+20B9)
- Large numbers: comma separator
- For amounts under ₹1,000: `₹540`
- For amounts ₹1,000+: `₹1,240`
- Positive balance: `+₹300` (green)
- Negative balance: `−₹640` (red — use `−` U+2212, not `-` hyphen)

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
