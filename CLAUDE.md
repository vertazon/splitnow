# SplitNow — Project Context for Claude Code

## Reference Docs
Always read these before making any design, UX, or feature decision:

| File | What's in it |
|---|---|
| `@docs/01-product-vision.md` | Why SplitNow exists, target users, core philosophy |
| `@docs/02-ux-principles.md` | The 5 UX laws, interaction patterns, screen-by-screen intent |
| `@docs/03-design-system.md` | Colors, typography, component specs, motion rules |
| `@docs/04-features-and-data.md` | Full feature map, data model, DB schema, navigation structure |
| `@docs/05-prompt-guide.md` | Prompt templates for design tools (ignore for coding) |
| `@docs/06-microcopy.md` | Exact copy strings, labels, toast messages, number formatting |
| `@docs/SplitNow.html` | **PRIMARY UI reference** — all screens including stack screens. Plus Jakarta Sans, #00D49A accent. Start here for any UI work. |

**How to use in Claude Code session:**
```
/add docs/03-design-system.md   ← when building any UI component
/add docs/06-microcopy.md       ← when writing any label or copy
/add docs/SplitNow.html         ← when replicating a specific screen
```

Or @-mention inline: *"Build the Settle screen following @docs/03-design-system.md and @docs/06-microcopy.md"*

---


## What Is SplitNow?
An India-first expense splitting app for roommates and friend groups.
**Core obsession:** Logging a shared expense must take ≤ 2 taps.
Users should feel like they are **confirming** an expense, not **entering** one.

## Tech Stack
- React Native (Expo managed workflow, ~SDK 54)
- expo-router v3 (file-based navigation, 5 tabs + stack screens)
- Supabase (PostgreSQL backend, phone OTP auth)
- TanStack React Query v5 (data fetching and caching)
- react-native-reanimated v3 (animations)
- expo-font (Plus Jakarta Sans — all weights 400–800)
- TypeScript

## Project Structure
```
app/
  (auth)/
    phone.tsx          ← Phone number entry
    otp.tsx            ← OTP verification
    profile.tsx        ← Profile setup (new users)
  (tabs)/
    index.tsx          ← Home: net balance + Quick Add + recent activity
    add.tsx            ← Full Add Expense screen
    settle.tsx         ← Settle Up screen
    insights.tsx       ← Insights screen
    friends.tsx        ← Friends list + add via invite code
  account.tsx          ← Account/profile hub (stack, slide_from_right)
  profile.tsx          ← Edit profile: name, avatar, UPI ID (stack)
  expenses.tsx         ← All expenses list (stack)
  expense/
    [id].tsx           ← Expense detail + comments (stack)
    edit/[id].tsx      ← Expense edit (stack)
  join/[code].tsx      ← Join via invite code (modal)
components/
  BalanceCard.tsx
  ActivityRow.tsx
  ToastNotification.tsx
constants/
  colors.ts
  typography.ts        ← fonts.syne = PlusJakartaSans_800, fonts.dmSans = 400, etc.
  sampleData.ts
store/
  useUserStore.ts
  useGroupStore.ts
hooks/
  useAuth.ts
  useExpenses.ts
  useBalances.ts
  useMembers.ts
  useFriends.ts
  useSettlements.ts
lib/
  queryClient.ts
  queryKeys.ts
  auth.ts
```

---

## Design System

### Colors (always use these exact values)
```ts
const colors = {
  bg: '#0D0D0D',
  card: '#161616',
  cardElevated: '#1C1C1C',
  border: 'rgba(255,255,255,0.07)',
  borderEmphasis: 'rgba(255,255,255,0.12)',
  accent: '#00D49A',           // green — positive balances, CTAs
  accentDim: 'rgba(0,212,154,0.10)',
  accentMid: 'rgba(0,212,154,0.22)',
  text: '#F2F2F2',
  text2: '#888888',
  text3: '#4A4A4A',
  danger: '#FF5959',           // red — amounts you owe
  dangerDim: 'rgba(255,89,89,0.10)',
  blue: '#5B9FFF',
  purple: '#A87CFF',
  orange: '#FF9A3C',
}
```

### Typography
- **Single font:** Plus Jakarta Sans across all weights
- Font aliases in `constants/typography.ts` use legacy names but all point to Plus Jakarta Sans:
  - `fonts.syne` = PlusJakartaSans_800ExtraBold (display, numbers, CTAs)
  - `fonts.dmSansSemiBold` = PlusJakartaSans_600SemiBold (row titles, chips)
  - `fonts.dmSans` = PlusJakartaSans_400Regular (metadata, dates)

| Element | Size | Weight | Alias |
|---|---|---|---|
| Screen title | 22px | 800 | `fonts.syne` |
| Balance amount | 42px | 800 | `fonts.syne` |
| Large input | 52px | 800 | `fonts.syne` |
| Section label | 10px | 700 | `fonts.dmSansSemiBold`, UPPERCASE, letterSpacing 1 |
| Row title | 13px | 600 | `fonts.dmSansSemiBold` |
| Metadata | 11px | 400 | `fonts.dmSans` |
| Chip label | 12px | 600 | `fonts.dmSansSemiBold` |
| CTA button | 15px | 800 | `fonts.syne` |

### Component Specs

**Cards**
```
borderRadius: 22, background: '#161616',
border: '1px solid rgba(255,255,255,0.07)', padding: 18
```

**Chips (People / Category)**
```
borderRadius: 20 (people), 14 (category)
minHeight: 36, paddingHorizontal: 13, paddingVertical: 7
default:   bg #1C1C1C, border rgba(255,255,255,0.11)
selected:  bg rgba(0,212,154,0.10), border rgba(0,212,154,0.22), color #00D49A
active:    scale(0.95), duration 120ms
```

**Primary CTA Button**
```
borderRadius: 16, height: 52, width: '100%'
background: #00D49A, color: #000, font: Syne 800 15px
shadow: 0 6px 24px rgba(0,212,154,0.28)
```

**Avatars**
```
size: 38, borderRadius: 50%
Aryan/You: bg rgba(0,212,154,0.12)  text #00D49A
Raj:       bg rgba(91,159,255,0.12) text #5B9FFF
Priya:     bg rgba(168,124,255,0.12) text #A87CFF
Arjun:     bg rgba(255,154,60,0.12) text #FF9A3C
```

**Toast**
```
background: #00D49A, color: #000
borderRadius: 16, padding: '10px 20px'
auto-dismiss: 2400ms
animation: slide up + fade in, 200ms
```

---

## UX Laws — Never Break These

1. **Every action ≤ 2 taps** — if a flow takes more, redesign it
2. **Never make the user type** — use pre-fills, chips, and smart defaults
3. **Pre-fill everything** — amount from UPI SMS or last entry, category from last used, people from last group
4. **No modals in the critical path** — Quick Add strip adds instantly, no sheet opens
5. **Chips over dropdowns** — all selections use visible tappable chips
6. **Tap targets ≥ 44×44px** — always

---

## The Hero Feature — Quick Add Strip

This is the most important component in the entire app. Protect it in every decision.

```
[ ₹540 ] [ 🍛 Food ] [ Raj ] [ Priya ] [ + ]
```

- Always visible on Home screen, never collapsed
- Amount: pre-filled from UPI SMS detection OR last used value
- Category chip: tap to cycle through categories
- People chips: tap to toggle on/off
- `+` button: logs expense instantly — NO modal, NO confirmation
- Shows hint below: `Last: 🍛 Food`
- Pulsing green dot next to "QUICK ADD" label

**UPI SMS Auto-Fill Flow:**
1. User pays via GPay/PhonePe
2. Bank SMS: "INR 540.00 debited...to VPA raj@okaxis"
3. App reads SMS (with permission) → amount auto-fills
4. User taps `+` → done in 1 tap

---

## Sample Data

### Group Members
```ts
const members = [
  { id: 'aryan',  name: 'Aryan',  initials: 'AR', color: 'green'  }, // logged-in user
  { id: 'raj',    name: 'Raj',    initials: 'RJ', color: 'blue'   },
  { id: 'priya',  name: 'Priya',  initials: 'PR', color: 'purple' },
  { id: 'arjun',  name: 'Arjun',  initials: 'AJ', color: 'orange' },
  { id: 'deepak', name: 'Deepak', initials: 'DK', color: 'blue'   },
]
```

### Sample Balances
```
Net position: You owe ₹1,240
You owe Raj: ₹640   (shown in danger red #FF5959)
Priya owes you: ₹300 (shown in accent green #00D49A)
You owe Arjun: ₹900  (shown in danger red #FF5959)
Settle total: ₹1,540
```

### Sample Expenses
```
1. Groceries — ₹420 — Yesterday — Raj, Priya
2. Dinner (Barbeque Nation) — ₹680 — Monday — All
3. Electricity Bill — ₹300 — Apr 18 — Arjun paid you
4. Chai (CCD) — ₹80 — Today — Personal
5. Jio Recharge — ₹299 — Apr 22 — Personal
6. Ola cab — ₹161 — Apr 21 — Personal
```

### Insights Sample Data
```
This month: ₹4,280
Expenses: 14 transactions
Most with: Raj (6 shared)
Avg/day: ₹214

Categories:
  🍛 Food:       ₹1,840
  🛒 Groceries:  ₹1,120
  ⚡ Bills:       ₹780
  🚗 Travel:     ₹540
```

---

## Categories
```ts
const categories = [
  { id: 'food',      emoji: '🍛', label: 'Food' },
  { id: 'groceries', emoji: '🛒', label: 'Groceries' },
  { id: 'travel',    emoji: '🚗', label: 'Travel' },
  { id: 'bills',     emoji: '⚡', label: 'Bills' },
  { id: 'chai',      emoji: '☕', label: 'Chai/Coffee' },
  { id: 'recharge',  emoji: '📱', label: 'Recharge' },
]
```

---

## Microcopy (exact strings to use)

### Labels
- Greeting: `Hey Aryan 👋`
- Balance card label: `NET BALANCE`
- Quick Add section: `QUICK ADD` + pulsing dot
- Quick Add hint: `Last: 🍛 Food`
- Settle button (balance row): `Settle`
- Settle All CTA: `⚡ Settle All · ₹1,540`
- Individual settle (settle screen): `Settle`
- Split calculator: `Each pays ₹180 (3 people)`
- Add screen title: `Add Expense`
- Add CTA: `Add Expense →`

### Toast Messages
- Quick add success: `✓ ₹540 added!`
- Individual settle: `Settled with [Name] ✓`
- Settle all: `All settlements recorded ✓`
- Home balance row settle: `Marked as paid to [Name] ✓`

### Number Formatting
- Always use ₹ (never $, never Rs)
- Whole numbers: `₹540` (no decimal)
- Thousands: `₹1,240` (comma separator)
- Positive balance: `+₹300` (green)
- Negative balance: `−₹640` (red, use − not -)

---

## Payment — UPI Settlement
UPI deeplink settlement is implemented but **disabled** (code commented out). Settlements are recorded in the DB manually. Re-enable by uncommenting UPI code in `settle.tsx`, `index.tsx`, and `BalanceCard.tsx`.

UPI deeplink format (for when re-enabled):
```
upi://pay?pa={vpa}&pn={name}&am={amount}&cu=INR
```

---

## Anti-Patterns — Never Do These
- ❌ Dropdown for category selection
- ❌ Multi-step wizard flows
- ❌ Confirmation dialogs after adding expense
- ❌ Mandatory description/title field in default flow
- ❌ Empty states with no defaults (always pre-fill)
- ❌ Cards as currency ($ sign anywhere)
- ❌ "Transfer" or "Transaction" language — use "Settle"
- ❌ Custom modal/overlay for navigation — use standard stack screens

---

## Screen Summary

### Tab Screens
| Screen | File | Purpose |
|---|---|---|
| Home | `app/(tabs)/index.tsx` | Balance overview + Quick Add Strip (hero) |
| Add | `app/(tabs)/add.tsx` | Full expense entry for edge cases |
| Settle | `app/(tabs)/settle.tsx` | Record settlements, view balances |
| Insights | `app/(tabs)/insights.tsx` | Spending patterns, category breakdown |
| Friends | `app/(tabs)/friends.tsx` | Friends list, add via invite code |

### Stack Screens (all `slide_from_right`)
| Screen | File | Purpose |
|---|---|---|
| Account | `app/account.tsx` | Profile hub: edit, groups, invite, sign out |
| Profile edit | `app/profile.tsx` | Edit name, avatar colour, UPI ID |
| Expenses list | `app/expenses.tsx` | Full expense history |
| Expense detail | `app/expense/[id].tsx` | Detail view + comments |
| Expense edit | `app/expense/edit/[id].tsx` | Edit existing expense |

### Modal Screen
| Screen | File | Purpose |
|---|---|---|
| Join group | `app/join/[code].tsx` | Process invite code, add friendship |
