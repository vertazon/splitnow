# SplitNow — Go Live Checklist

Everything required to get SplitNow approved and published on Google Play and the Apple App Store.

---

## Current Status

| Feature | Status | Notes |
|---|---|---|
| Delete account (in-app) | ✅ Done | `supabase.rpc('delete_my_account')` in `app/account.tsx` |
| Push notifications | ✅ Done | Expo + Edge Function + DB webhook |
| Activity feed | ✅ Done | Realtime + fan-out pattern |
| Notification settings | ✅ Done | Per-type toggles saved to `users.notification_prefs` |
| Email OTP auth | ✅ Code done | `sendEmailOtp` + `verifyEmailOtp` via Supabase built-in |
| Supabase Email provider | ❌ Enable in dashboard | Authentication → Providers → Email → enable, OTP mode |
| Privacy Policy page | ❌ Missing | Must be a live public URL |
| App name | ⚠️ TBD | "SplitNow" is a placeholder — see hardcoded references below |
| App icon | ❌ Needs custom artwork | Current 💸 emoji will be rejected by Apple — see risk below |
| Empty states | ⚠️ Partial | Verify all screens with zero data |
| Production build | ❌ Not built | Need `eas build --profile production` |

---

## ⚠️ Pre-Launch Decisions Required

### App Name (TBD)
The name **"SplitNow"** is used as a placeholder and has not been finalized.  
Once the name is decided, update it in these files:

| File | Where |
|---|---|
| `app.json` | `name`, `slug`, `android.package`, `ios.bundleIdentifier` |
| `app/(auth)/phone.tsx` | Logo text: `<Text style={styles.logoText}>SplitNow</Text>` |
| `CLAUDE.md` | Project name throughout |
| `docs/08-go-live-checklist.md` | This file — store listing copy |
| Play Store / App Store listings | Must match the final name |

> Check availability before finalizing: [namechk.com](https://namechk.com) (username across platforms) + Play Console + App Store Connect.

---

### App Icon — Custom Artwork Required
The current icon uses the **💸 emoji**, which creates two rejection risks:

1. **Apple rejects emoji-as-icon** — App Store Review Guideline 4.1.2 requires distinctive, original artwork. System emoji used as app icons are rejected.
2. **Dollar sign imagery** — may trigger extra review under payment app policies (Apple 3.1.1 / Play Financial App policy), even though SplitNow does not process payments.

**Required action before App Store submission:**
- Design a custom icon (PNG, at minimum 1024×1024, no alpha on iOS)
- Replace in `assets/images/icon.png` (Expo generates all size variants from this)
- Update `android.adaptiveIcon.foregroundImage` in `app.json` if using adaptive icon
- Recommended style: simple, geometric, no emoji, avoids currency symbols — e.g., a split/arrow motif in your green accent `#00D49A`

---

## 🔴 Mandatory — App Will Be Rejected Without These

### Both Stores

#### 1. Delete Account (In-App)
- **Status:** ✅ Done
- Must be accessible inside the app, not via "email us"
- Location: Account screen → Delete account (two-step confirmation)
- DB function: `public.delete_my_account()` (migration `010_delete_account.sql`)

#### 2. Privacy Policy — Live Public URL
- **Status:** ❌ Missing
- Must be a real, publicly accessible URL (not localhost)
- Quickest option: [privacypolicygenerator.info](https://privacypolicygenerator.info) or Google Sites / Notion
- **Must cover:**
  - What data is collected: email address, name, UPI ID, expense data
  - Where it's stored: Supabase (cloud, region per your Supabase project settings)
  - That data is not sold to third parties
  - How users can delete their data (in-app delete account)
  - Contact email for data requests
- Add the URL to: Play Store listing, App Store listing, and optionally the auth screen in-app

#### 3. Working Email OTP Authentication
- **Status:** ✅ Code done — ⚠️ Supabase dashboard step required
- **No third-party SMS provider needed** — email OTP is handled entirely by Supabase's built-in email service
- **Dashboard step:** Authentication → Providers → Email → toggle **ON** → set to **OTP** mode (disable magic link)
- Supabase sends the 6-digit OTP from their own sending domain — no custom domain required for launch
- Test end-to-end on a real device: sign in with your email, receive the OTP, verify

#### 4. No Crashes on Empty States
- **Status:** ⚠️ Needs verification
- App reviewer creates a fresh account — zero groups, zero friends, zero expenses
- Every screen must handle empty data gracefully
- Screens to verify: Home (no groups/expenses), Groups list (empty), Friends (no friends), Insights (no data), Activity (no activity)

#### 5. App Icon — Custom Artwork
- **Status:** ❌ Needs design
- See "App Icon — Custom Artwork Required" section above
- Expo generates all sizes from `assets/images/icon.png` (must be 1024×1024, no alpha for iOS)

#### 6. Age Rating / Content Declaration
- SplitNow = **4+ / Everyone** (no violence, no adult content, no gambling)
- Both stores ask you to self-declare during listing setup

---

### Play Store Specific

#### 7. Data Safety Form
- Google's questionnaire about data collection practices
- Fill during Play Console listing setup
- Answers for SplitNow:
  - **Data collected:** Email address, Name, Financial info (expense amounts)
  - **Data shared:** No (not shared with third parties)
  - **Encrypted in transit:** Yes (Supabase uses TLS)
  - **Users can delete data:** Yes (in-app delete account)
  - **Data collected is required for app functionality:** Yes

#### 8. Android App Bundle (AAB)
- Submit `.aab` not `.apk`
- Build command: `eas build --profile production --platform android`
- Target API: Android 15 (API 35) — handled by Expo SDK 54 ✅

> **No DLT registration needed.** DLT (TRAI) is only required for custom branded SMS sender IDs (e.g. "SPLTNO"). Since auth is now email-based via Supabase, there is no SMS involved and no DLT registration is required.

---

### App Store Specific

#### 9. Privacy Nutrition Labels
- Apple's detailed per-field data declaration
- More granular than Play Store Data Safety
- Declared during App Store Connect listing setup
- For SplitNow:
  - **Contact Info:** Email address (required, linked to identity)
  - **Financial Info:** User-entered expense amounts (linked to identity)
  - **Identifiers:** User ID (linked to identity)
  - **Usage Data:** Not collected

#### 10. Support URL
- Must be a live URL — can be same as Privacy Policy page or a simple contact form
- Declared in App Store Connect

#### 11. Sign In with Apple
- **NOT required** for SplitNow ✅
- Only required if you offer Google/Facebook/Twitter login
- SplitNow uses email OTP only → exempt

#### 12. App Store Review Notes
- Email OTP is far more reviewer-friendly than phone OTP — Apple reviewers can use **any email address** and receive the OTP directly
- Still useful to note in review:

  ```
  This app authenticates via email OTP.
  To review, use any email address — the OTP will be delivered to that inbox.
  No special test credentials required.
  ```

- Optional: Supabase test OTP fallback — Dashboard → Authentication → Settings → add test email + fixed OTP `123456` (useful if reviewer's email is slow)

#### 13. Apple Developer Account
- Cost: $99/year (~₹8,000/year)
- Enroll at: [developer.apple.com](https://developer.apple.com)

---

## 🟡 Won't Reject But Will Hurt UX / Ratings

| Item | Notes |
|---|---|
| **Empty state copy** | Each empty state should explain the next action: "No expenses yet. Tap + to add one." |
| **Network error handling** | Show a message when offline or when a request fails |
| **Privacy Policy link on auth screen** | Add a small "Privacy Policy" text link below the email input — common practice, sets trust |
| **Terms of Service** | Not mandatory but recommended for a financial app |
| **Loading skeletons** | Currently using `ActivityIndicator` — fine for launch |
| **Onboarding hint** | First-time user after sign-up sees zero data — consider a one-time tooltip |

---

## 🛠️ Step-by-Step Launch Sequence

```
Step 0 — Decisions (do these first)
  └─ Finalize app name
  └─ Design custom app icon (1024×1024 PNG, no emoji)

Step 1 — Enable Email OTP in Supabase (15 min)
  └─ Dashboard → Authentication → Providers → Email → ON
  └─ Set mode to OTP (disable magic link)
  └─ Test end-to-end: real device, real email, real OTP received

Step 2 — Privacy Policy (1 hour)
  └─ Generate at privacypolicygenerator.info
  └─ Host on Google Sites, Notion, or Carrd (free)
  └─ Note the URL — needed for both store listings

Step 3 — Fresh account smoke test (1–2 hours)
  └─ Create a new Supabase user with a different email
  └─ Go through every screen with zero data
  └─ Fix any crashes or broken empty states

Step 4 — Production builds
  └─ eas build --profile production --platform android
  └─ eas build --profile production --platform ios
  └─ Both take 15–30 min in EAS queue

Step 5 — Play Store listing
  └─ Create app at play.google.com/console
  └─ Upload AAB
  └─ Fill Data Safety form (email, not phone)
  └─ Add screenshots (minimum 2 phone screenshots)
  └─ Short description (80 chars): "Split expenses with friends & roommates. No friction."
  └─ Set Privacy Policy URL
  └─ Submit for review → ~3 days

Step 6 — App Store listing
  └─ Create app in App Store Connect
  └─ Upload IPA via Xcode or Transporter
  └─ Fill Privacy Nutrition Labels (email address, not phone)
  └─ Add screenshots (iPhone 6.9" required)
  └─ Set Privacy Policy + Support URL
  └─ Add review notes (email OTP — no test credentials needed)
  └─ Submit for review → ~1–3 days
```

---

## Play Store Listing Copy

> ⚠️ Replace "SplitNow" with the final app name before submitting.

```
Short description (80 chars):
Split expenses with roommates & friends. Instant. No friction.

Full description:
[App Name] makes splitting shared expenses effortless.

Add an expense in seconds — just enter the amount, pick who paid,
and [App Name] splits it equally. No complicated flows, no forms.

FEATURES
• Add shared expenses instantly
• Split equally or with custom amounts
• Track who owes what across multiple groups
• Record settlements with one tap
• Activity feed with real-time updates
• Push notifications for new expenses and settlements
• Invite friends via a simple 8-character code

Built for Indian roommates, friend groups, and travel squads.
Uses UPI IDs for easy payment reference.

Your data is stored securely and never shared or sold.
```

---

## App Store Review — Email OTP (No Special Setup Needed)

Unlike SMS OTP (which required a test phone number + static OTP for US-based Apple reviewers), **email OTP works for everyone** — the reviewer simply uses their own email address and receives the code.

Review notes template:
```
Authentication: Email OTP
To test: enter any email address, receive the 6-digit OTP in your inbox, enter it to sign in.
No special test account required.
```

Optional safety net — add a Supabase test OTP for a specific email (e.g. `review@apple.com`) in case the reviewer's email is slow or filtered:
1. Dashboard → Authentication → Settings → Test OTPs
2. Add email `review@apple.com` → OTP `123456`
3. Note this in review notes as a backup

---

## Known Risks

### 🔴 App Icon (Emoji)
**Severity: Will cause rejection on App Store**  
The current 💸 emoji used as the app icon does not meet Apple's human interface guidelines for distinctive app icons. Must be replaced with custom-designed artwork before App Store submission.

### 🟡 App Name Not Finalized
**Severity: Operational risk, not a rejection risk**  
"SplitNow" is used throughout the codebase as a placeholder. Play Store and App Store slugs / bundle IDs are hard to change after publishing. Finalize and update all references (see table above) before submitting to either store.

### 🟢 Apple OTP Review — Resolved
Email OTP fully solves the Apple reviewer access problem. No workaround needed — reviewers use their own inbox. ✅

---

## Reference Links

| Resource | URL |
|---|---|
| Play Console | play.google.com/console |
| App Store Connect | appstoreconnect.apple.com |
| Apple Developer Enroll | developer.apple.com/enroll |
| EAS Build docs | docs.expo.dev/build/introduction |
| Supabase Auth — Email | supabase.com/docs/guides/auth/auth-email |
| Privacy policy generator | privacypolicygenerator.info |
| Name availability checker | namechk.com |
