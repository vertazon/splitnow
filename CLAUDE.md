# SplitNow — Project Context for Claude Code

## Reference Docs
Always read these before making any design, UX, or feature decision:

| File | What's in it |
|---|---|
| `@docs/01-product-vision.md` | Why SplitNow exists, target users, core philosophy |
| `@docs/02-ux-principles.md` | The 5 UX laws, interaction patterns, screen-by-screen intent |
| `@docs/03-design-system.md` | Colors, typography, component specs, motion rules |
| `@docs/04-features-and-data.md` | Full feature map, data model, UPI deeplink format |
| `@docs/05-prompt-guide.md` | Prompt templates for design tools (ignore for coding) |
| `@docs/06-microcopy.md` | Exact copy strings, labels, toast messages, number formatting |
| `@docs/splitnow_app_prototype.html` | **PRIMARY UI reference** — dark theme, Syne+DM Sans, #00D49A accent. Matches design system exactly. Start here. |
| `@docs/SplitNow.html` | **ALT UI reference** — different visual direction, lime #bdf41a accent. Use only when switching themes later. |

**How to use in Claude Code session:**
```
/add docs/03-design-system.md       ← when building any UI component
/add docs/06-microcopy.md           ← when writing any label or copy
/add docs/splitnow_app_prototype.html ← when replicating a specific screen
```

Or @-mention inline: *"Build the Settle screen following @docs/03-design-system.md and @docs/06-microcopy.md"*

---


## What Is SplitNow?
An India-first expense splitting app for roommates and friend groups.
**Core obsession:** Logging a shared expense must take ≤ 2 taps.
Users should feel like they are **confirming** an expense, not **entering** one.

## Tech Stack
- React Native (Expo managed workflow)
- expo-router (file-based navigation, 4 tabs)
- react-native-reanimated (animations)
- expo-font (Syne + DM Sans from Google Fonts)
- TypeScript

## Project Structure
```
app/
  (tabs)/
    index.tsx         ← Home + Quick Add Strip
    add.tsx           ← Full Add Expense screen
    settle.tsx        ← Settle Up screen
    insights.tsx      ← Insights screen
components/
  QuickAddStrip.tsx
  BalanceCard.tsx
  PersonChip.tsx
  CategoryChip.tsx
  ToastNotification.tsx
constants/
  colors.ts
  typography.ts
  sampleData.ts
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
- **Display / Numbers:** Syne, weight 800 — screen titles, balance amounts, CTAs
- **Body / Labels:** DM Sans, weight 400–600 — all other text

| Element | Size | Weight | Font |
|---|---|---|---|
| Screen title | 24px | 800 | Syne |
| Balance amount | 42px | 800 | Syne |
| Large input | 52px | 800 | Syne |
| Section label | 10px | 700 | DM Sans, UPPERCASE, letterSpacing 1 |
| Row title | 13px | 600 | DM Sans |
| Metadata | 11px | 400 | DM Sans |
| Chip label | 12px | 600 | DM Sans |
| CTA button | 15px | 800 | Syne |

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
- Pay button: `Pay UPI`
- Settle All CTA: `⚡ Settle All · Pay ₹1,540`
- Individual settle: `UPI →`
- Split calculator: `Each pays ₹180 (3 people)`
- Add screen title: `Add Expense`
- Add CTA: `Add Expense →`

### Toast Messages
- Quick add success: `✓ ₹540 added!`
- Pay tap: `Opening GPay for Raj…`
- Settle all: `Opening UPI for all settlements…`

### Number Formatting
- Always use ₹ (never $, never Rs)
- Whole numbers: `₹540` (no decimal)
- Thousands: `₹1,240` (comma separator)
- Positive balance: `+₹300` (green)
- Negative balance: `−₹640` (red, use − not -)

---

## Payment — UPI Deeplink Format
```
upi://pay?pa={vpa}&pn={name}&am={amount}&cu=INR

Examples:
upi://pay?pa=raj@okaxis&pn=Raj&am=640&cu=INR
upi://pay?pa=arjun@ybl&pn=Arjun&am=900&cu=INR
```

---

## Anti-Patterns — Never Do These
- ❌ Dropdown for category selection
- ❌ Multi-step wizard flows
- ❌ Confirmation dialogs after adding expense
- ❌ Mandatory description/title field in default flow
- ❌ Empty states with no defaults (always pre-fill)
- ❌ Cards as currency ($ sign anywhere)
- ❌ "Transfer" or "Transaction" language — use "Pay UPI"

---

## Screen Summary

| Screen | File | Purpose |
|---|---|---|
| Home | `app/(tabs)/index.tsx` | Balance overview + Quick Add Strip (hero) |
| Add | `app/(tabs)/add.tsx` | Full expense entry for edge cases |
| Settle | `app/(tabs)/settle.tsx` | Pay who you owe via UPI |
| Insights | `app/(tabs)/insights.tsx` | Spending patterns, category breakdown |
