# SplitNow — Microcopy & Content Guidelines

## Tone of Voice

SplitNow speaks like a smart, casual friend — not a bank or a startup.

| ✅ Do | ❌ Don't |
|-------|---------|
| "Hey Aryan 👋" | "Welcome back, User" |
| "Settle" | "Initiate Transfer" |
| "Settle All" | "Clear Outstanding Balance" |
| "Split with" | "Select Participants" |
| "You owe" | "Outstanding Liability" |
| "Owes you" | "Receivable Amount" |
| "Added!" | "Transaction Recorded Successfully" |
| "Settled with X ✓" | "Payment recorded successfully" |

---

## Screen-by-Screen Copy

### Home Screen
- Greeting: `Hey [Name] 👋`
- Sub-greeting: month label e.g. `May 2026`
- Balance card label: `NET BALANCE`
- Balance sub (owed): `from N people`
- Balance sub (owes): `to N people`
- Balance sub (zero): `All settled up ✓`
- Section headers: `BALANCES` · `RECENT ACTIVITY`
- Balance row (owe): `−₹640` in danger red
- Balance row (owed): `+₹300` in accent green
- Settle button: `Settle`
- Quick Add label: `QUICK ADD` with pulsing dot
- Quick Add hint: `Last: 🍛 Food`
- See all link: `See all (N) →`

### Add Screen
- Title: `Add Expense`
- Section labels: `CATEGORY` · `SPLIT WITH`
- Split row: `Each pays ₹180 (3 people)`
- CTA: `Add Expense →`

### Settle Screen
- Title: `Settle Up`
- Hero label: `TOTAL YOU OWE`
- Hero sub (owes): `to N people · May 2026`
- Hero sub (settled): `All settled up · May 2026`
- Settle All CTA: `⚡ Settle All · ₹1,540`
- Section headers: `SUGGESTED` · `ALL BALANCES`
- Suggested row label: `You → [Name]`
- Individual settle button: `Settle`
- Empty state title: `All settled up!`
- Empty state sub: `No outstanding balances with anyone.`

### Insights Screen
- Title: `Insights`
- Stat labels: `THIS MONTH` · `EXPENSES` · `MOST WITH` · `AVG / DAY`
- Section: `BY CATEGORY` · `PERSONAL`
- Sub labels: `May 2026` · `transactions` · `6 shared` · `this month`

### Friends Screen
- Title: `Friends`
- Add friend button: `Add a friend`
- Invite code input label: `Enter invite code`
- Empty state: `No friends yet. Share your invite code to get started.`

### Account Screen
- Header title: `Profile`
- Section label (account): `ACCOUNT`
- Section label (general): `GENERAL`
- Menu item: `Edit Profile` — sub `Name, avatar colour & UPI ID`
- Menu item: `Manage Groups` — sub `Members & balances`
- Menu item: `Settings` — sub `Coming soon`
- Menu item: `Invite a Friend` — sub `Share your invite code`
- Menu item: `Sign out` — red, destructive
- Sign out alert title: `Sign out`
- Sign out alert body: `You'll need to verify your phone number to sign back in.`
- Sign out alert confirm: `Sign out`

### Profile / Edit Screen
- Header: ✕ button (right side)
- Save CTA: `Save`

### Expense Detail Screen
- Back button: chevron-back icon (no text)
- Edit button: `Edit`

### Toast Messages
- After Quick Add: `✓ ₹540 added!`
- After Add Expense: `✓ ₹[amount] added!`
- After Settle (individual): `Settled with [Name] ✓`
- After Settle All: `All settlements recorded ✓`
- After home screen balance row settle: `Marked as paid to [Name] ✓`
- After friend added: `[Name] added as a friend ✓`

---

## Category Names
```
🍛  Food
🛒  Groceries
🚗  Travel
⚡  Bills
☕  Chai/Coffee
📱  Recharge
```

---

## Number Formatting
```
₹540        → ₹540 (no decimal for whole numbers)
₹1,240      → ₹1,240 (comma separator)
+₹300       → positive balance (green, accent)
−₹640       → negative balance (red, danger — use − not -)
₹4,280      → monthly total
₹214        → average (round, no decimal)
```

**Never use:**
- `$` sign anywhere
- `Rs.` prefix
- Decimal for whole numbers (₹540.00 → wrong)
- `-` (hyphen) for negative balances — use `−` (U+2212 minus sign)

---

## Empty States
- No expenses yet: `No expenses yet. Tap + to add one.`
- All settled up (settle screen): `All settled up!` / `No outstanding balances with anyone.`
- All settled up (home balance card): `All settled up ✓`
- No personal expenses: `No personal expenses this month`
- No friends: `No friends yet. Share your invite code to get started.`

---

## Auth Flow
- Phone screen title: `SplitNow`
- Phone input placeholder: `+91 98765 43210`
- Send OTP button: `Send OTP`
- OTP screen title: `Verify`
- OTP sub: `Enter the code sent to [phone]`
- Resend link: `Resend OTP`
- Profile setup title: `Set up profile`
- Profile setup CTA: `Get started`
