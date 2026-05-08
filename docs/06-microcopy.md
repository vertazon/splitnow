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
| "not involved" | "No share" or "N/A" |

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
- Amount placeholder: `0`
- Title placeholder: `What's this for?`
- Section labels: `CATEGORY` · `PAID BY` · `SPLIT WITH`
- Split pill labels: `= Equal` · `≠ Amount` · `≠ %`
- CTA (idle): `Add Expense →`
- CTA (success): `✓ Added!`
- CTA (error): `Failed — try again`

### Group Detail Screen
- Balance label: `GROUP BALANCE`
- Member section: `MEMBERS`
- Expense section: `EXPENSES`
- Add button: `Add Expense`
- Sheet title: `Add Expense`
- Settled member label: `All settled`

### Expense Detail Screen
- Back button: chevron-back icon (no text)
- Edit button: `Edit`
- Delete button: `Delete` → `Confirm?` (2-tap confirm)
- Net pill (lent): `+₹X` / `you lent`
- Net pill (owed): `−₹X` / `you owe`
- Net pill (uninvolved): `not involved`
- Paid by badge (you paid): `You paid`
- Paid by badge (they paid): `They paid`
- Payer sub-text: `Paid ₹X`
- Split member tag (payer in split): `paid · settled`
- Comments section label: `COMMENTS` / `COMMENTS  N`
- Comments empty state: `No comments yet. Start the conversation.`
- Comment input placeholder: `Add a comment…`

### Expense Edit Screen
- Screen title: `Edit Expense`
- Amount placeholder: `0`
- Title placeholder: `What's this for?`
- CTA (idle): `Save Changes →`
- CTA (pending): `Saving…`
- CTA (success): `✓ Saved!`
- CTA (error): `Failed — try again`

### SplitSheet
- Sheet title: `Split ₹[amount]`
- Tab labels: `Equal` · `Amount` · `%`
- Confirm button: `Confirm split`
- Summary (amount): `₹X of ₹total`
- Summary (percent): `X% of 100%`
- Error (amount): `Must add up to total amount`
- Error (percent): `Must add up to 100%`

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

### Groups Screen
- Screen title: `Groups`
- Section — active: `YOUR GROUPS`
- Section — archived: `PAST GROUPS`
- Group balance (owe): `you owe`
- Group balance (owed): `owed to you`
- Empty state: `No groups yet. Create one to split together.`
- Create CTA: `+ Create New Group`

### Create Group Screen
- Title: `New Group`
- Emoji section: `GROUP ICON`
- Name section: `GROUP NAME`
- Name placeholder: `e.g. Flat, Goa Trip, Office…`
- Members section: `ADD MEMBERS`
- Members hint: `Only friends you've added can be members`
- CTA: `Create Group →`

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

---

## Toast Messages

### Expense actions
- After Quick Add: `✓ ₹540 added!`
- After Add Expense (full screen): `✓ ₹[amount] added!`
- After Edit Expense: `Changes saved ✓`
- After Delete Expense: *(navigates back immediately, no toast)*

### Settlement actions
- After Settle (individual): `Settled with [Name] ✓`
- After Settle All: `All settlements recorded ✓`
- After home screen balance row settle: `Marked as paid to [Name] ✓`

### Group actions
- Group created: `🏠 [Name] created ✓`
- Group archived: `[Name] archived ✓`
- Member removed: `[Name] removed from [Group] ✓`
- Expense added from group: `✓ ₹[amount] added to [Group]!`
- Left group: `Left [Group] ✓`

### Friend actions
- After friend added: `[Name] added as a friend ✓`

---

## Error / Validation Copy

| Trigger | Message |
|---------|---------|
| Amount field empty or invalid | `Enter a valid amount` |
| Title field empty | `Title is required` |
| No people selected for split | `Select at least one person to split with` |
| Split amounts don't add up | `Must add up to total amount` |
| Split percentages don't add up | `Must add up to 100%` |
| Remove member with balance | `Settle ₹[amount] with [Name] first` |
| Leave group with balance | `You owe ₹[amount] in this group. Settle first.` |
| Save expense error | `Couldn't save: [error message]` |

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
- No groups: `No groups yet. Create one to split together.`
- No comments: `No comments yet. Start the conversation.`

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
