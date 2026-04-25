# SplitNow — Features & Technical Context

## Feature Map

### Core Features (MVP)

#### 1. Quick Add Strip
The most important feature in the entire app.

- Always visible on the home screen — never hidden or collapsed
- Pre-filled state: last used amount + last used category + last used people
- Components: amount input → category chip → people chips → add button
- On tap of +: expense is logged instantly with no modal or confirmation dialog
- Category chip: tap to cycle through available categories
- People chips: tap to toggle each person on/off
- UPI SMS integration: when a UPI SMS is detected, amount auto-updates in the strip

#### 2. Balance Overview
- Net balance card: single number showing total you owe or are owed
- Per-person breakdown: each group member shown with their balance
- Color coding: red for amounts you owe, green for amounts owed to you
- Inline "Pay UPI" button on rows where you owe money

#### 3. Expense Logging (Full Screen)
- Large centered amount input (auto-focused on screen open)
- Category selection: 6 primary categories as icon + label chips
  - Food 🍛, Groceries 🛒, Travel 🚗, Bills ⚡, Chai/Coffee ☕, Recharge 📱
- People selection: all group members shown as chips, tap to select/deselect
- Live split calculator: shows "Each pays ₹X (N people)" that updates as people are toggled
- Single Add button — no description field required in default flow

#### 4. Settle Up
- Total owed amount prominently displayed
- "Settle All" CTA: opens UPI deeplink for total amount
- Optimized settlements: algorithm minimizes number of transactions
- Per-person UPI buttons: individual settlement via UPI deeplink
- UPI deeplink format: `upi://pay?pa={vpa}&pn={name}&am={amount}&cu=INR`

#### 5. Insights
- This month's total spend
- Number of expenses logged
- Most frequent expense partner
- Average daily spend
- Spending by category (horizontal bar chart)
- Personal (non-split) expenses list

---

## Data Model

### Group Members (Sample Data)
```
Aryan (You)  — the logged-in user
Raj          — owes Aryan ₹640 (Aryan owes Raj)
Priya        — owes Aryan ₹300 (Priya owes Aryan)
Arjun        — owes Aryan ₹900 (Aryan owes Arjun)
Deepak       — fourth member, appears in Add screen
```

### Sample Balances
```
Net position: You owe ₹1,240 (640 + 900 - 300)
You owe Raj: ₹640
Priya owes you: ₹300
You owe Arjun: ₹900
Settle total: ₹1,540
```

### Sample Expense History
```
1. Groceries — ₹420 — Yesterday — Raj, Priya
2. Dinner (Barbeque Nation) — ₹680 — Monday — All
3. Electricity Bill — ₹300 — Apr 18 — Arjun paid you
4. Chai (CCD) — ₹80 — Today — Personal
5. Jio Recharge — ₹299 — Apr 22 — Personal
6. Ola cab — ₹161 — Apr 21 — Personal
```

### Sample Insights (April 2026)
```
Total spend: ₹4,280
Expenses: 14 transactions
Most with: Raj (6 shared)
Avg/day: ₹214

By category:
  Food:      ₹1,840 (43%)
  Grocery:   ₹1,120 (26%)
  Bills:     ₹780   (18%)
  Travel:    ₹540   (13%)
```

---

## India-Specific Context

### UPI Ecosystem
- Primary payment apps: Google Pay (GPay), PhonePe, Paytm, BHIM
- Every UPI transaction generates an SMS from the user's bank
- SMS format varies by bank but always contains: amount, debit/credit, VPA or merchant name
- UPI deeplinks work across all UPI apps
- ~80% of urban young adults use UPI daily

### Currency & Number Formatting
- Currency symbol: ₹ (U+20B9)
- Large numbers use Indian system: 1,00,000 (lakh) not 100,000
- For amounts under ₹1,000: show as ₹540
- For amounts over ₹1,000: show as ₹1,240 (no lakh formatting needed for typical group expenses)

### Common Expense Categories in Indian Friend Groups
1. Food (eating out, ordering in) — highest frequency
2. Groceries (Big Basket, local kirana, D-Mart runs)
3. Travel (Ola/Uber/auto, petrol splits, outstation trips)
4. Bills (electricity, WiFi, gas, society maintenance)
5. Chai/Coffee (chai tapri, CCD, Starbucks)
6. Recharge (Jio/Airtel mobile recharges, OTT subscriptions)

### Microcopy & Tone
- Casual and friendly, not corporate
- Use "Hey [Name] 👋" style greetings
- "Pay UPI" not "Transfer Funds"
- "Settle All" not "Clear Outstanding Balance"
- "Split With" not "Select Participants"
- Amounts always with ₹ prefix, no decimal for whole numbers

---

## Competitive Context

| App | Strength | Weakness for India |
|-----|----------|-------------------|
| Splitwise | Feature complete, trusted | Too many taps, no UPI integration, no SMS auto-fill |
| Google Pay Groups | UPI native | Not a proper ledger, limited splitting logic |
| Paytm Split | UPI native | Cluttered UI, not popular |
| IOU | Simple | No UPI, not India-specific |

**SplitNow's gap:** The intersection of a proper ledger (like Splitwise) + UPI-native payments + SMS auto-fill + minimal friction.

---

## Future Features (Post-MVP)

- WhatsApp bot: "₹500 groceries Raj Priya" → logged automatically
- OCR receipt scanning: photograph a bill → amounts and items extracted
- Recurring expenses: auto-log monthly bills
- Group trips: dedicated trip ledger with multi-day expense grouping
- Voice input: "Add 200 rupees for chai with Raj"
- Splitwise sync: two-way sync for users migrating from Splitwise
