# SplitNow — Groups Feature Implementation

**Status:** Planned · May 2026  
**Scope:** Full groups feature — schema, UX flows, data queries, edge cases, build order

---

## Overview

Groups let users organize shared expenses by context — a flat, a trip, an office team. Every expense belongs to a group, and balances can be viewed globally or scoped to a specific group. The Home screen's group context switcher makes this zero-friction: switching context is one tap, not a navigation action.

---

## Schema Changes

The existing schema needs the following additions before any code is written.

### `groups` table

```sql
ALTER TABLE groups ADD COLUMN cover_emoji  TEXT        DEFAULT '🏠';
ALTER TABLE groups ADD COLUMN group_type   TEXT        DEFAULT 'flat'; -- flat | trip | custom
ALTER TABLE groups ADD COLUMN archived_at  TIMESTAMPTZ;                -- soft delete
```

### `group_members` table

```sql
ALTER TABLE group_members ADD COLUMN role    TEXT        DEFAULT 'member'; -- admin | member
ALTER TABLE group_members ADD COLUMN left_at TIMESTAMPTZ;                  -- soft remove
```

### `expense_splits` table

```sql
ALTER TABLE expense_splits ADD COLUMN settled_at    TIMESTAMPTZ;
ALTER TABLE expense_splits ADD COLUMN settlement_id UUID REFERENCES settlements(id);
```

`settled_at` and `settlement_id` are critical. Without them, you cannot determine which settlement cleared which split, making balance recomputation ambiguous when multiple settlements exist between two people.

### `expenses` table

`group_id` is already present per the current schema. No change needed.

### `settlements` table

`group_id` is already present. No change needed.

---

## Full Schema Reference (Post-Migration)

### `groups`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto-generated |
| name | text NOT NULL | e.g. "Flat", "Goa Trip" |
| created_by | uuid FK → users.id | admin by default |
| cover_emoji | text | default '🏠' |
| group_type | text | flat \| trip \| custom |
| archived_at | timestamptz | null = active |
| created_at | timestamptz | |

### `group_members`

| Column | Type | Notes |
|--------|------|-------|
| group_id | uuid FK → groups.id | composite PK |
| user_id | uuid FK → users.id | composite PK |
| role | text | admin \| member |
| joined_at | timestamptz | |
| left_at | timestamptz | null = still a member |

### `expense_splits` (updated)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| expense_id | uuid FK → expenses.id | |
| user_id | uuid FK → users.id | |
| share | numeric(10,2) | this person's portion |
| settled_at | timestamptz | null = unsettled |
| settlement_id | uuid FK → settlements.id | which settlement cleared this |

---

## Navigation Structure

Groups do not get their own tab. They live under Account → Manage Groups. The Home screen's group chip row provides the primary interaction surface without any navigation.

### New files (expo-router)

```
app/
  groups/
    [id].tsx          — Group detail: balance card + Quick Add + members + expenses
    create.tsx        — Create group modal (slide_from_bottom)
    edit/[id].tsx     — Edit group name, emoji, members (slide_from_right)
```

### Entry points

| Entry | Destination |
|-------|------------|
| Account → Manage Groups | Groups list (full screen, slide_from_right) |
| Groups list → group card | `groups/[id].tsx` (slide_from_right) |
| Groups list → + button | `groups/create.tsx` (modal) |
| Home → + New chip | `groups/create.tsx` (modal) |
| Group detail → ··· menu | Options: Edit, Archive, Leave |

---

## UX Flows

### Creating a group

```
Account → Manage Groups → + 
  → New Group modal (slide_from_bottom)
    → Emoji picker (6 options: 🏠 🏕️ 🍺 ✈️ 🎮 👥)
    → Name input (auto-focused)
    → Add members from friends list (chips, pre-selected: all friends)
  → Create Group →
  → Lands on Group Detail
```

Toast: `🏠 [Name] created ✓`

Tap count from home: 3 taps + typing the name. Acceptable — one-time setup, not on the critical path.

### Adding an expense to a group

```
Inside Group Detail → Quick Add Strip (people chips = group members) → +
```

The Quick Add Strip inside Group Detail has its people chips pre-locked to group members. Same 1-tap flow. `group_id` is automatically attached to the expense.

### Group context switcher on Home

A horizontal chip row sits between the greeting and the balance card:

```
[ All ] [ 🏠 Flat ] [ 🏕️ Goa Trip ] [ + New ]
```

Tapping a chip:
- Filters the balance card to that group's net balance
- Filters Recent Activity to that group's expenses
- Locks Quick Add Strip people chips to that group's members
- Shows the group badge on the balance card

The `+ New` chip opens group creation. The chip row is hidden for users with 0 groups.

### Removing a member

```
Group Detail → ··· → Edit Group → Member row → Remove
  → If unsettled balance exists: 
      "Settle with [Name] first" (blocked, shows amount)
  → If balance is zero:
      Confirmation alert → soft-delete (left_at = now())
```

Historical expenses and splits are preserved. The removed member's splits remain and still contribute to balance calculation until settled.

### Leaving a group (self)

```
Group Detail → ··· → Leave Group
  → If unsettled balance: show amount, "Settle first" (blocked)
  → If admin and other members remain: "Choose a new admin" picker
  → If last member: destructive confirmation → group archived
  → If balance is zero and not last admin: soft-delete, go back
```

### Archiving a group

```
Group Edit → Archive Group
  → Confirmation: "No new expenses can be added. History is kept."
  → archived_at = now()
```

Archived groups appear in a collapsed "PAST GROUPS" section in Manage Groups. Their balances remain in the global Settle screen until settled, with a group label on that row so the user knows the context.

---

## Balance Computation

### Global balance (unchanged)

The existing formula remains:

```
balance(A→B) = SUM(expense_splits.share WHERE expenses.paid_by = B AND expense_splits.user_id = A AND settled_at IS NULL)
             − SUM(settlements WHERE from_user = A AND to_user = B)
```

Settlements are **person-to-person, not group-scoped**. When Raj settles ₹640 with you, it clears debt across all groups. This avoids the UX confusion of "which group is this payment for."

### Group-scoped balance (new)

Used in Group Detail and Home when a group chip is selected:

```sql
SELECT
  es.user_id,
  SUM(es.share) AS owed
FROM expense_splits es
JOIN expenses e ON e.id = es.expense_id
WHERE e.group_id = $groupId
  AND e.paid_by = $currentUser
  AND es.settlement_id IS NULL
GROUP BY es.user_id;
```

This is additive — the existing `useBalances()` hook is not modified. A new `useGroupBalances(groupId)` hook handles group-scoped queries.

---

## Data Hooks

### `useGroups(userId)`

Fetches all active groups the user belongs to, with member count and their net balance within each group.

```sql
SELECT 
  g.*,
  COUNT(gm.user_id) FILTER (WHERE gm.left_at IS NULL) AS member_count,
  -- balance subquery per group
FROM groups g
JOIN group_members gm ON gm.group_id = g.id
WHERE gm.user_id = $userId
  AND gm.left_at IS NULL
  AND g.archived_at IS NULL
ORDER BY g.created_at DESC;
```

### `useGroupDetail(groupId)`

Members with their roles, `left_at`, and per-member balance within the group.

### `useGroupExpenses(groupId)`

Paginated expense list for the group. 20 per page, most recent first. Includes `paid_by` user details and split count.

### `useGroupBalances(groupId)`

Per-member net balance scoped to a single group. Powers the Members section in Group Detail and the filtered balance card on Home.

---

## API Surface

```
POST   /groups                           → create group
GET    /groups/:id                       → group detail + members + balances
PATCH  /groups/:id                       → rename, emoji, archive
DELETE /groups/:id                       → soft delete (archive)
POST   /groups/:id/members               → add member
DELETE /groups/:id/members/:userId       → remove member (with balance check)
GET    /groups/:id/expenses              → paginated expense list
GET    /groups/:id/balances              → per-member balances within group
```

Expenses already carry `group_id` — no separate endpoint needed for adding group expenses. The existing `POST /expenses` handles it.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Member leaves with unsettled balance | Block removal. Show "Settle ₹X with [Name] first." |
| Expense added before a member joined | `expense_splits` only includes members at time of creation. New member is not retroactively added. |
| Admin leaves, others remain | Promote member with earliest `joined_at` to admin automatically. |
| Admin leaves, no members remain | Group archives automatically (`archived_at = now()`). |
| Last member leaves | Destructive alert: "This will archive the group and all history." `archived_at = now()`. |
| 0 groups (new user) | Group chip row hidden on Home. Manage Groups shows empty state: "No groups yet. Create one to split together." |
| Duplicate group name | Allowed. Groups are differentiated by emoji + member avatars. |
| Archived group has unsettled balances | Balances surface in global Settle screen. Row shows group badge (e.g. `🏕️ Goa Trip`) so user understands the context. |
| Group with 1 member (solo) | Valid. Useful for personal expense tracking under a group label. No restriction. |
| Concurrent expense entries | Supabase row-level locking handles this. `useBalances` refetches on app focus — React Query `staleTime: 0` for balance queries. |
| 10+ members | People chips in Quick Add wrap to 2 lines max, then `+N more` chip that expands inline. No modal. |
| Non-friend added to group | Allowed. Group membership does not require friendship. Friendship is a separate social graph. |

---

## Microcopy

### Manage Groups screen

| Element | Copy |
|---------|------|
| Screen title | `Groups` |
| Section — active | `YOUR GROUPS` |
| Section — archived | `PAST GROUPS` |
| Group balance (owe) | `you owe` |
| Group balance (owed) | `owed to you` |
| Empty state | `No groups yet. Create one to split together.` |
| Create CTA | `+ Create New Group` |

### Group Detail screen

| Element | Copy |
|---------|------|
| Balance label | `GROUP BALANCE` |
| Member section | `MEMBERS` |
| Expenses section | `EXPENSES` |
| Admin badge | `admin` |
| Settled member | `All settled` |
| ··· menu items | `Edit Group` · `Archive Group` · `Leave Group` |

### Create Group modal

| Element | Copy |
|---------|------|
| Title | `New Group` |
| Emoji section | `GROUP ICON` |
| Name section | `GROUP NAME` |
| Name placeholder | `e.g. Flat, Goa Trip, Office…` |
| Members section | `ADD MEMBERS` |
| Members hint | `Only friends you've added can be members` |
| CTA | `Create Group →` |

### Toasts

| Action | Toast |
|--------|-------|
| Group created | `🏠 [Name] created ✓` |
| Group archived | `[Name] archived ✓` |
| Member removed | `[Name] removed from [Group] ✓` |
| Expense added from group context | `✓ ₹[amount] added to [Group]!` |
| Leave group | `Left [Group] ✓` |

### Error / blocked states

| Trigger | Message |
|---------|---------|
| Remove member with balance | `Settle ₹[amount] with [Name] first` |
| Leave group with balance | `You owe ₹[amount] in this group. Settle first.` |
| Archive group with unsettled balances | `[N] unsettled balances will stay visible in Settle until cleared.` |

---

## Build Order

### Phase 1 — Backend + hooks (1–2 days)

- Schema migrations (ALTER TABLE additions above)
- `useGroups`, `useGroupDetail`, `useGroupBalances`, `useGroupExpenses` hooks
- Create group mutation
- Add / remove member mutations
- Archive group mutation

### Phase 2 — Manage Groups screen (1 day)

- Groups list with balance and member avatar stack per card
- Create group modal (emoji picker, name input, member chips)
- Group detail screen: balance card, members, expense list
- Edit group: rename, emoji change, add/remove member

### Phase 3 — Home integration (1 day)

- Group context chip row on Home screen
- Chip tap → filter balance card + balance rows + Quick Add context
- Quick Add Strip people chips switch to group members on context change
- Group badge on Recent Activity expense rows

### Phase 4 — Expense flow updates (0.5 day)

- `group_id` passed through when expense is added from group context
- Expense detail shows group badge
- Add Expense screen: group context chip (pre-selected from navigation context)

### Phase 5 — Edge cases + polish (1 day)

- Leave group flow with admin handoff prompt
- Archive group flow with unsettled balance warning
- Archived group balance label on Settle screen
- Empty states per microcopy above
- All toasts wired up

---

## What is NOT in V1

These are explicitly deferred. Do not build them now.

- **Group-scoped settlements** — settlements are global (person-to-person). No "settle within this group" flow.
- **Group invite deep links** — the existing invite code system is sufficient.
- **Group chat** — out of scope per product vision. Comments exist on individual expenses only.
- **Trip mode / date ranges** — auto-archive on trip end date is post-MVP.
- **Custom split types within groups** — equal split only for V1. `split_type` field is in the schema but the UI exposes it later.
- **Expense visibility controls** — all group members see all expenses.
- **Group-level insights** — spending breakdown per group is V1.5, not V1.

---

## Files to Create / Modify

### New files

```
app/groups/[id].tsx
app/groups/create.tsx
app/groups/edit/[id].tsx

hooks/useGroups.ts
hooks/useGroupDetail.ts
hooks/useGroupBalances.ts
hooks/useGroupExpenses.ts

mutations/createGroup.ts
mutations/updateGroup.ts
mutations/archiveGroup.ts
mutations/addGroupMember.ts
mutations/removeGroupMember.ts
```

### Modified files

```
app/(tabs)/index.tsx          — add group chip row, update Quick Add strip, add group badges to activity
app/account.tsx               — wire Manage Groups row to groups list navigation
hooks/useBalances.ts          — unchanged (global balance logic stays the same)
constants/microcopy.ts        — add groups microcopy strings
```
