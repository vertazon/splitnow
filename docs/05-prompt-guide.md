# SplitNow — Prompt Guide for AI Design Tools

This file contains ready-to-use prompts for different AI design contexts.
Pick the one that matches your current intent.

---

## 1. COLD START — Let AI Be Fully Creative
*Use when: You want to see fresh, unbiased design ideas. Don't share any existing designs.*

```
App name: SplitNow

What it does: Expense splitting for Indian roommates and friend groups who pay via UPI and cash.

Core goal: Log a shared expense in under 2 seconds. Users should feel like they're confirming, not entering.

Key features:
- Track who owes who and how much (₹)
- Split expenses between selected people instantly
- Settle dues directly via UPI
- See spending patterns over time

Context: India, UPI payments, friend groups of 3–6 people, used daily

Design the app. Dark theme. Be creative.
```

---

## 2. SCREEN-GUIDED — Give Feature Context Per Screen
*Use when: You want more control over what appears on each screen but still want creative freedom.*

```
Design a mobile app called SplitNow — an India-first expense splitting app for roommates and friend groups.

Core philosophy: Users should feel like they're confirming an expense, not entering one. Every action must take ≤ 2 taps. No forms, no dropdowns, no multi-step flows.

The app has 4 screens:
1. Home — Shows net balance, a Quick Add strip (always pre-filled), per-person balances, and recent activity
2. Add Expense — Large amount input, category chips, people chips, one CTA
3. Settle Up — Total owed, Settle All button, suggested settlements with UPI pay per person
4. Insights — Spending stats, category breakdown, personal expenses

Key context:
- The Quick Add strip is the hero feature — pre-filled, no modal opens
- UPI is the primary payment method
- People in the group: Raj, Priya, Arjun, Deepak
- Currency: ₹ (Indian Rupee)
- Sample balance: You owe ₹640 to Raj, ₹900 to Arjun. Priya owes you ₹300

Design all 4 screens. Dark theme preferred. Be bold with the visual direction.
```

---

## 3. ITERATION — Refine an Existing Design
*Use when: You've seen the first design and want to evolve it.*

```
Here is the current SplitNow design [attach screenshot/artifact].

Keep what works. I want you to specifically:
- [describe what you liked]
- Change: [describe what felt off]
- Explore: [describe what you want to try differently]

The core philosophy must stay: ≤ 2 taps, pre-filled defaults, confirming not entering.
```

---

## 4. COMPONENT FOCUS — Design a Single Feature
*Use when: You want to zoom in on one specific component.*

### Quick Add Strip
```
Design the "Quick Add" strip for SplitNow — an expense splitting app.

This is the most important UI element in the app. It must:
- Always be visible on the home screen
- Show a pre-filled amount (e.g. ₹540), a category chip (e.g. 🍛 Food), people chips (Raj, Priya), and a + button
- Add an expense instantly when + is tapped — no modal opens
- Feel fast, minimal, and predictive

Indian context. ₹ currency. Dark theme. Make it memorable.
```

### Balance Card
```
Design a balance overview card for SplitNow (Indian expense splitting app).

Shows: net balance (You owe ₹1,240), breakdown across 3 people, month context.
Dark theme. The number is the hero. Green for owed-to-you, red for you-owe.
```

---

## 5. FULL SPEC PROMPT — Maximum Context
*Use when: You want the AI to have all context and produce production-ready output.*

```
Design a complete mobile app UI for SplitNow.

WHAT IT IS:
An India-first expense splitting app for roommates and friend groups. Think Splitwise but rebuilt for UPI-native, low-friction daily use.

CORE UX LAW:
Logging an expense must take ≤ 2 taps. Users confirm, they don't enter.
No forms. No dropdowns. No multi-step flows. Pre-fill everything.

THE HERO FEATURE — Quick Add Strip:
Always visible on home. Structure: [₹Amount] [Category Chip] [People Chips] [+ Button]
Pre-filled with last used values. Tapping + adds instantly, no modal.
UPI SMS auto-fills the amount when a payment is detected.

4 SCREENS NEEDED:

Home:
- Greeting with user name
- Net balance card (large number, green/red)
- Quick Add Strip (hero element)
- Per-person balance list with UPI pay buttons
- Recent activity list

Add Expense:
- Large centered ₹ amount input (auto-focused)
- Category selection: Food🍛 Grocery🛒 Travel🚗 Bills⚡ Chai☕ Recharge📱
- People chips: Raj, Priya, Arjun, Deepak
- Live split calculator ("Each pays ₹180 — 3 people")
- Full-width Add button

Settle Up:
- You owe ₹1,540 hero card
- "Settle All" primary CTA (opens UPI)
- Suggested settlements: You → Raj ₹640, You → Arjun ₹900
- Per-row UPI pay buttons

Insights:
- Stats: ₹4,280 this month, 14 expenses, Raj most frequent, ₹214/day avg
- Category bars: Food ₹1,840 / Grocery ₹1,120 / Bills ₹780 / Travel ₹540
- Personal expenses list

DESIGN DIRECTION:
Dark minimal. ₹ currency. India context (UPI, GPay, local categories).
Font pairing: bold display font for numbers, clean sans-serif for body.
Accent: your choice — but must work for positive/negative financial states.
Tap targets ≥ 44px. Breathing room. Memorable, not generic.
```

---

## Tips for Getting the Best Output

1. **Don't over-specify the visual style** — say "dark minimal, be creative" not "use #00D49A as accent"
2. **Always mention the ≤ 2 taps rule** — it's the constraint that shapes every design decision
3. **Lead with the Quick Add Strip** — it's the differentiator; make sure the AI understands its importance
4. **Mention UPI explicitly** — it signals Indian context and changes the payment UI language
5. **Give real data** — use the actual sample balances (₹640, ₹900 etc.) so the design feels grounded
