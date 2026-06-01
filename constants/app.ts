/**
 * App identity — single source of truth.
 * Change APP_NAME here and it propagates everywhere in the app.
 *
 * Note: app.json fields (name, slug, android.package, ios.bundleIdentifier)
 * must be updated manually — they are build-time identifiers, not runtime values.
 * The slug and bundle ID should NOT change after the first store submission.
 */
export const APP_NAME = 'SplitNow';
export const CONTACT_EMAIL = 'hello@vertazon.com';
export const WEBSITE_URL   = 'https://splitnow.vertazon.com';
export const PRIVACY_URL   = 'https://splitnow.vertazon.com/privacy';
export const TERMS_URL     = 'https://splitnow.vertazon.com/terms';

// OneSignal — App ID is not a secret (it's embedded in the app binary)
// OneSignal — App ID is not a secret (embedded in the app binary, safe to commit)
// Get this from: OneSignal dashboard → Settings → Keys & IDs
export const ONESIGNAL_APP_ID = '43cc1733-c4ca-49ef-99db-10d7b825d147';

// Google Sign-In — the WEB OAuth client ID (NOT the Android one).
// This sets the ID-token audience that Supabase validates, so it must match the
// Web client registered in Supabase → Auth → Providers → Google.
// Not a secret (it's embedded in the app binary). Set via EAS env var per environment.
// Get this from: Google Cloud Console → APIs & Services → Credentials → Web client.
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
