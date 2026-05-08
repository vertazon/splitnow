# SplitNow — Groups Feature

**Status:** Shipped · May 2026

---

## Overview

Groups let users organize shared expenses by context — a flat, a trip, an office team. Every expense belongs to a group, and balances can be viewed globally (across all groups) or scoped to a specific group. Groups are reached from Account → Manage Groups.

---

## What Was Built

### Screens

| File | Purpose |
|------|---------|
| `app/groups/index.tsx` | Groups list — all active groups with member avatar stack, net balance per group |
| `app/groups/[id].tsx` | Group detail — balance card, members section, expense list, inline Add Expense bottom sheet |
| `app/groups/create.tsx` | Create group modal (slide_from_bottom) — emoji picker, name input, member chips |
| `app/groups/edit/[id].tsx` | Edit group — rename, cover emoji, add/remove members |

### Hooks (all in `hooks/useGroups.ts`)

| Hook | Purpose |
|------|---------|
| `useGroups(userId?)` | Fetch all active groups user belongs to, with computed net balance per group |
| `useGroupDetail(groupId)` | Single group with members list |
| `useGroupMembers(groupId)` | Members with role, joined_at, avatar data |
| `useCreateGroup()` | Insert group + member rows; creator is auto-added as admin |
| `useUpdateGroup()` | Patch name / cover_emoji / group_type |
| `useArchiveGroup()` | Set `archived_at = now()` |
| `useAddGroupMember()` | Upsert into group_members |
| `useRemoveGroupMember()` | Soft-remove via `left_at = now()` |

### Schema (live)

**`groups`**
```sql
id          uuid  PK
name        text  NOT NULL
created_by  uuid  FK → users.id
cover_emoji text  default '🏠'
group_type  text  default 'custom'   -- flat | trip | custom
archived_at timestamptz              -- null = active
created_at  timestamptz
```

**`group_members`**
```sql
group_id   uuid  FK → groups.id  composite PK
user_id    uuid  FK → users.id   composite PK
role       text  default 'member'  -- admin | member
joined_at  timestamptz
left_at    timestamptz  -- null = active member (soft remove)
```

---

## Add Expense Sheet (inside Group Detail)

The group detail screen contains a full Add Expense bottom sheet — same design as the standalone Add screen. When opened from a group, `group_id` is automatically attached to the expense.

**Sheet design:**
- Bare hero ₹ amount (no box wrapper), centered, auto-focused
- Bare centered title input below
- Details card: Category (emojiOnly chips) / Paid By (picker modal) / Split With (avatar circles + SplitSheet)
- Pinned footer CTA with `ctaState` success/error feedback
- All group members pre-populated as split candidates

---

## Balance Computation

Balances are computed in `useGroups` by joining `expense_splits` and `settlements` in-app:

```
net(currentUser, group) =
  + SUM(amount_owed WHERE expenses.paid_by = currentUser AND user_id ≠ currentUser AND group_id = group)
  − SUM(amount_owed WHERE user_id = currentUser AND paid_by ≠ currentUser AND group_id = group)
  + SUM(settlements WHERE from_user = currentUser AND group_id = group AND status = 'completed')
  − SUM(settlements WHERE to_user = currentUser AND group_id = group AND status = 'completed')
```

Settlements are **person-to-person and group-scoped**. The `settlements` table has a `group_id` column.

---

## What Was NOT Built (Deferred)

These were in the original plan but are not yet implemented:

| Feature | Notes |
|---------|-------|
| `expense_splits.settled_at` and `settlement_id` columns | Not added to the live schema. Balance recomputation works without them for now. |
| Group context switcher on Home screen | The chip row (All / 🏠 Flat / + New) was deferred. Home always shows global balance. |
| Home screen group badge on activity rows | Deferred with Home context switcher. |
| Admin handoff flow when admin leaves | Not implemented — no "Choose new admin" picker. |
| Leave group flow | Not implemented. |
| Group-scoped Settle screen | Deferred. Settle screen shows global balances only. |
| Group-level insights | Deferred. Insights are global. |
| Trip mode / auto-archive on end date | Deferred. |
| Group invite deep links | Not needed — existing invite code system is sufficient. |

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| Non-friend added to group | Allowed. Membership does not require friendship. |
| Archived groups | `archived_at IS NOT NULL` — excluded from all active queries |
| Member left group | `left_at IS NOT NULL` — excluded from active member queries; historical splits preserved |
| Creator auto-admin | `created_by` is inserted as `role = 'admin'` on group creation |
| New member sees all expenses | `expense_splits` includes only members at time of creation — new members are not retroactively added |

---

## Microcopy

### Groups list screen
| Element | Copy |
|---------|------|
| Screen title | `Groups` |
| Section — active | `YOUR GROUPS` |
| Group balance (owe) | `you owe` |
| Group balance (owed) | `owed to you` |
| Empty state | `No groups yet. Create one to split together.` |
| Create CTA | `+ Create New Group` |

### Group detail screen
| Element | Copy |
|---------|------|
| Balance label | `GROUP BALANCE` |
| Member section | `MEMBERS` |
| Expense section | `EXPENSES` |
| Settled member | `All settled` |

### Create group screen
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
| Expense added from group | `✓ ₹[amount] added to [Group]!` |
