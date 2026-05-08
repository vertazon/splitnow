# SplitNow — Product Vision & Philosophy

## What Is SplitNow?

SplitNow is an India-first expense splitting app for roommates and friend groups. It is built around one single obsession: **logging a shared expense should take under 2 seconds**.

The app exists because existing solutions like Splitwise — while feature-rich — require too many taps, too much typing, and too much mental effort for daily use. People stop logging expenses not because they forget, but because the friction is too high.

---

## The Core Insight

> Users should feel like they are **confirming** an expense, not **entering** one.

This is the foundational UX principle. Every screen, every interaction, every default exists to serve this idea. The app should feel predictive — like it already knows what you're about to do.

---

## The Problem We Solve

### Current Pain Points (Splitwise & similar apps)
- Too many taps to log a single expense (5–8 taps minimum)
- Must manually type amount after every UPI payment
- Category selection requires dropdown navigation
- People selection requires searching/scrolling
- No intelligence — every entry starts from zero

### The Real Behavior
Users make a UPI payment → get an SMS → open Splitwise → forget what they paid → give up.

### SplitNow's Answer
- UPI SMS auto-detects payment amount → pre-fills the Quick Add strip *(planned — not yet live)*
- Last-used category and people are pre-selected
- User just taps **+** to confirm
- Total interaction: **1–2 taps**

---

## Target Users

| Attribute | Detail |
|-----------|--------|
| Age | 20–32 |
| Living situation | Shared flat / PG / hostel |
| Group size | 3–6 people |
| Payment method | UPI (GPay, PhonePe, Paytm), sometimes cash |
| Frequency | 2–5 shared expenses per day |
| Location | Tier 1 and Tier 2 Indian cities |
| Platforms | Android primary, iOS secondary |

---

## What SplitNow Is NOT

- Not a full accounting app
- Not a chat-first app
- Not a feature showcase
- Not a replacement for UPI apps

It is a **confirmation layer** that sits between your UPI payment and your shared ledger.

---

## Current State (May 2026)

The app is a functional prototype with live Supabase backend:
- Phone-number OTP authentication (Supabase Auth)
- Groups, members, expenses, splits, settlements, and comments are stored in PostgreSQL via Supabase
- Balance computation is done in-app from live DB data
- **Groups feature is fully shipped** — create, manage, invite members, view group-scoped balances and expenses
- **Comments are live** — users can comment on any expense in real time
- **Custom splits are live** — equal, by amount, or by percentage via SplitSheet
- UPI deeplink settlement is implemented but **disabled** (code commented out) — settlements are recorded in the DB as manual confirmations
- Friends system: users can add friends via 8-character invite codes
- RLS (Row-Level Security) is intentionally disabled for the prototype phase

---

## Success Metric

A user should be able to add an expense in **under 2 seconds**.

If any flow takes longer, it needs to be redesigned.
