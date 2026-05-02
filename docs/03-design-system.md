# SplitNow — Design System & Visual Language

## Design Personality

SplitNow should feel:
- **Fast** — snappy animations, instant feedback, no loading states for core actions
- **Effortless** — minimal visual noise, clear hierarchy, nothing unnecessary
- **Predictive** — the app feels like it knows what you're about to do
- **Indian** — UPI-native, ₹ currency, local context in microcopy

It should NOT feel:
- Form-heavy or bureaucratic
- Cluttered with features
- Generic (avoid looking like every other fintech app)

---

## Color System

### Core Palette
| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0D0D0D` | App background |
| Card | `#161616` | Card surfaces |
| Card Elevated | `#1C1C1C` | Inputs, chips |
| Border | `rgba(255,255,255,0.07)` | Subtle separators |
| Border Emphasis | `rgba(255,255,255,0.12)` | Inputs, active states |
| Accent | `#00D49A` | Primary brand, CTAs, positive balances |
| Accent Dim | `rgba(0,212,154,0.10)` | Selected chip backgrounds |
| Accent Mid | `rgba(0,212,154,0.22)` | Selected chip borders |
| Text Primary | `#F2F2F2` | Headings, primary content |
| Text Secondary | `#888888` | Labels, metadata |
| Text Muted | `#4A4A4A` | Placeholders, disabled |
| Danger | `#FF5959` | Amounts you owe, debt states |
| Danger Dim | `rgba(255,89,89,0.10)` | Danger card backgrounds |
| Danger Border | `rgba(255,89,89,0.18)` | Danger card borders |

### Semantic Color Usage
- **Green/Accent (`#00D49A`)** → money you are owed, positive actions, primary CTAs
- **Red/Danger (`#FF5959`)** → money you owe, settle-up prompts
- **Blue (`#5B9FFF`)** → secondary people, informational
- **Purple (`#A87CFF`)** → tertiary people, categories
- **Orange (`#FF9A3C`)** → quaternary people, warnings

---

## Typography

### Font
| Role | Font | Weights Used |
|------|------|-------------|
| Everything | **Plus Jakarta Sans** | 400, 500, 600, 700, 800 |

Single font stack. All display numbers, titles, body text, labels, and CTAs use Plus Jakarta Sans at different weights. The `fonts` constant in `constants/typography.ts` maps legacy alias names to this font:

```ts
export const fonts = {
  syne:           'PlusJakartaSans_800ExtraBold',    // display, numbers, titles
  bold:           'PlusJakartaSans_700Bold',          // section labels (bold)
  dmSansSemiBold: 'PlusJakartaSans_600SemiBold',     // row titles, chips
  dmSansMedium:   'PlusJakartaSans_500Medium',        // secondary body
  dmSans:         'PlusJakartaSans_400Regular',       // metadata, dates
};
```

**Note:** Alias names (`fonts.syne`, `fonts.dmSans`) are legacy from an earlier design. They map to Plus Jakarta Sans weights, not the literal fonts Syne or DM Sans.

### Type Scale
| Element | Size | Weight | Alias |
|---------|------|--------|-------|
| Screen title | 22–26px | 800 | `fonts.syne` |
| Balance amount | 40–48px | 800 | `fonts.syne` |
| Large input | 52–60px | 800 | `fonts.syne` |
| Section label | 10px | 700 | `fonts.dmSansSemiBold`, uppercase, 1px tracking |
| Body / row title | 13–14px | 600 | `fonts.dmSansSemiBold` |
| Metadata / date | 11–12px | 400 | `fonts.dmSans` |
| Chip label | 12–13px | 500–600 | `fonts.dmSansSemiBold` |
| CTA button | 15px | 800 | `fonts.syne` |

### Rules
- Numbers use weight 800 for impact — they're the hero of every screen
- Never use less than 10px font size
- Section labels: always uppercase, letter-spacing 1px, muted color (`colors.text2`)
- Balance amounts: letter-spacing -2px for large figures (tighter = more premium)

---

## Component Specs

### Cards
```
Border radius: 22px
Background: #161616
Border: 1px solid rgba(255,255,255,0.07)
Padding: 18px
```

### Chips (Category / People)
```
Border radius: 20px (pill) for people, 12–14px for category
Height: minimum 36px
Padding: 7px vertical, 13px horizontal
Default: bg #1C1C1C, border rgba(255,255,255,0.11)
Selected: bg rgba(0,212,154,0.10), border rgba(0,212,154,0.22), text #00D49A
Transition: all 0.12s ease
Active state: scale(0.95)
```

### Primary CTA Button
```
Border radius: 16px
Height: 52px
Background: #00D49A
Color: #000000
Font: Plus Jakarta Sans 800, 15px
Box shadow: 0 6px 24px rgba(0,212,154,0.28)
Active: scale(0.97), reduced shadow
```

### Back Button (Stack Screens)
```
Size: 36×36px
Border radius: 12px
Background: #1C1C1C (cardElevated)
Border: 1px solid rgba(255,255,255,0.07)
Icon: Ionicons chevron-back, 20px, colors.text
```

### Input Fields (Amount)
```
Background: #1C1C1C
Border: 1.5px solid rgba(255,255,255,0.11)
Border radius: 12–14px
Font: Plus Jakarta Sans 800, 18–20px
Focus: border-color #00D49A
```

### Avatar / Initials
```
Size: 38–44px (list rows), 58px (account screen)
Border radius: 50%
Each person has a consistent color slot:
  Green:  bg rgba(0,212,154,0.10)  / text #00D49A
  Blue:   bg rgba(91,159,255,0.10) / text #5B9FFF
  Purple: bg rgba(168,124,255,0.10)/ text #A87CFF
  Orange: bg rgba(255,154,60,0.10) / text #FF9A3C
  Red:    bg rgba(255,89,89,0.10)  / text #FF5959
Avatar color is stored on the user record (avatar_color field).
```

### Settle Button
```
Background: rgba(0,212,154,0.10)
Border: 1px solid rgba(0,212,154,0.22)
Border radius: 10px
Padding: 5px vertical, 12px horizontal
Min height: 28px
Text: Plus Jakarta Sans 600, 11px, #00D49A
Label: "Settle"
```

### Tab Bar
```
Background: rgba(12,12,12,0.97) with backdrop blur
Border top: 1px solid rgba(255,255,255,0.07)
Padding: 10px top, 26px bottom (for home indicator)
Tab icon: 20px
Tab label: 9px, 700 weight, uppercase
Active: accent color label + active indicator pip
```

---

## Motion & Animation

### Principles
- Animations should feel **snappy**, not floaty
- Duration: 120–200ms for micro-interactions, 250–300ms for screen transitions
- Easing: ease or cubic-bezier for natural feel

### Key Animations
| Interaction | Animation |
|-------------|-----------|
| Chip tap | scale(0.95) on :active, 120ms |
| CTA tap | scale(0.97) + shadow reduction, 120ms |
| Settle All tap | withSequence: scale 0.97 → 1, 100ms + 120ms |
| Expense added | Toast slides up from bottom, 200ms |
| Screen transition | slide_from_right (all stack screens), fade (tab switches) |
| Bar chart load | Width transition, 800ms cubic-bezier(0.34,1.56,0.64,1) |
| Quick add dot | Pulse/blink animation, 2.2s infinite |

### Toast Notification
```
Position: above tab bar, centered
Background: #00D49A
Color: #000
Border radius: 16px
Padding: 12px 22px
Show: opacity 0→1 + translateY(10px→0), 200ms
Auto-dismiss: 2.4 seconds
```

---

## Spacing System

```
4px   — tight internal spacing
8px   — chip gaps, small component gaps
10px  — grid gaps
12px  — row internal padding
16px  — standard padding
22px  — screen horizontal margin
24px  — section vertical spacing
```

---

## Visual Hierarchy Rules

1. **The number is always the hero** — balance amounts, expense amounts get the largest, boldest treatment
2. **Reduce borders, use spacing** — separation through whitespace, not lines
3. **Soft elevation over outlines** — use subtle background color changes, not heavy borders
4. **Accent color is precious** — only used for positive actions and confirmed states, not decorative
5. **Dark cards on dark background** — 3–4% lightness difference is enough for depth
