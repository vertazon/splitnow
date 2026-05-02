# SplitNow — UX Principles & Interaction Design

## The 5 Laws of SplitNow UX

### 1. Every action ≤ 2 taps
No interaction should require more than 2 taps from the home screen. If it does, it's a design failure.

### 2. Never make the user type
Typing is the highest friction input. Use:
- Pre-filled numeric inputs (from SMS or last used)
- Chip-based category selection
- Chip-based people selection
- No free-text fields in the critical path

### 3. Pre-fill everything
- Amount → from UPI SMS auto-detection OR last entry
- Category → last used category
- People → last used group
- The user's job is to *change* things, not *fill* things

### 4. No modals in the critical path
The Quick Add strip must add an expense without opening any modal, sheet, or overlay. Instant confirmation.

### 5. Reduce cognitive load at all costs
- Show only what's needed for the current action
- Hide advanced options behind secondary flows
- Use visual hierarchy to make the primary action obvious

---

## Interaction Patterns

### Chips over Dropdowns
All selections (category, people) use horizontally or grid-laid chips. Chips are:
- Visible all at once (no hidden options)
- Tappable with a single tap
- Visually clear about selected state
- Minimum 44px tap target

### Smart Defaults
The app tracks:
- Last used category
- Last used group of people
- Most frequent expense patterns by time of day

These are applied automatically. The user overrides, not selects.

### Tap Targets
- All interactive elements: minimum 44px × 44px
- Primary CTAs: full-width, minimum 52px height
- Chips: minimum 36px height with horizontal padding

### Navigation Model
All secondary screens use standard stack navigation with `slide_from_right` animation. No custom overlays or modal hacks in the navigation layer.

- Tab bar: 4 tabs (Home, Add, Settle, Insights, Friends)
- Stack screens: Account, Profile, Expenses list, Expense detail, Expense edit, Join group
- Back navigation: always `router.back()` — predictable, system-standard
- Account screen (`app/account.tsx`) is the user profile hub, reached from the avatar on Home

---

## Screen-by-Screen UX Intent

### Home Screen
**Purpose:** The home screen IS the add screen. A user should never need to navigate away to log a common expense.

**Critical element — Quick Add Strip:**
```
[ ₹540 ] [ 🍛 Food ] [ Raj · Priya ] [ + ]
```
- Always visible, never collapsed
- Amount: auto-filled from UPI SMS or last entry
- Category chip: tap to cycle through categories
- People chips: tap to toggle on/off
- + button: adds instantly, no confirmation step

**Secondary elements:**
- Balance card: net position at a glance (you owe X / owed X)
- Per-person balances with inline Settle button
- Recent activity (last 5 entries, tap to open detail)

### Add Screen (Full Entry)
**Purpose:** For edge cases when Quick Add isn't enough — larger amount, different split type, or adding a description.

**Layout priority:**
1. Amount input — centered, large, auto-focused
2. Category chips — icon grid, last used pre-selected
3. People chips — tap to select/deselect
4. Add button — full width, bottom CTA

**No scrolling required** for the core flow.

### Settle Screen
**Purpose:** Simplify the awkward "who pays who" conversation.

**Key insight:** Show optimized settlements, not raw balances. Instead of showing a complex web of debts, show the minimum number of transactions to settle everything.

**Current state:** UPI deeplinks are disabled. Settlements are recorded in the database as confirmed manually. Button labels say "Settle" not "UPI →". Toasts confirm recording, not payment.

**Primary CTA:** "⚡ Settle All · ₹X" — records all settlements.
**Secondary:** Per-person "Settle" buttons for individual confirmations.

### Insights Screen
**Purpose:** Secondary, not critical path. Shows spending patterns over time.

**Kept intentionally simple:**
- Total spend this month
- Category breakdown (bar chart)
- Most frequent expense partner
- Personal (non-split) expenses

### Friends Screen
**Purpose:** Manage the social graph — who you split with.

- View current friends list with balances
- Add a friend via 8-character invite code
- Share your own invite code with the native share sheet

### Account Screen (`app/account.tsx`)
**Purpose:** Hub for user identity and app settings. Reached from the avatar button on Home.

**Layout:**
- User card: avatar, name, phone, UPI ID
- ACCOUNT section: Edit Profile → `app/profile.tsx`, Manage Groups (placeholder), Settings (coming soon)
- GENERAL section: Invite a Friend (native share sheet with invite code)
- Sign out (red, Alert confirmation)

### Profile Screen (`app/profile.tsx`)
**Purpose:** Edit user profile data only — name, avatar colour, UPI ID. Not a hub.

- Reached from Account → Edit Profile
- ✕ close button on the right
- Saves changes to Supabase users table

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad |
|---|---|
| Dropdown for category | Hidden options, extra tap, cognitive overhead |
| Multi-step "wizard" flow | Breaks the ≤2 tap rule |
| Confirmation dialogs | Adds a tap, slows down habit formation |
| Mandatory description/title field | Forces typing in critical path |
| Split type selection upfront | Advanced feature, not default path |
| Empty states with no defaults | Forces user to start from zero every time |
| Custom modal/overlay for navigation | Breaks back-button behavior, hard to maintain |

---

## The UPI SMS Auto-Fill Flow (Planned)

This is SplitNow's killer feature for the Indian market. Not yet implemented.

**Intended flow:**
1. User pays ₹540 on GPay
2. Bank sends SMS: *"INR 540.00 debited from A/c...to VPA raj@okaxis..."*
3. SplitNow reads SMS (with permission)
4. Amount auto-fills in Quick Add strip
5. User selects people (already pre-selected from last time)
6. Taps +
7. Done

**Result:** The expense is logged before the user has even opened the app intentionally.

**Fallback:** If SMS permission is not granted, the last-used amount remains pre-filled. The flow degrades gracefully.
