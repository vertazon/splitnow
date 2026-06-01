/**
 * Google Sign-In — native ID-token flow wired to Supabase.
 *
 * Flow:
 *   GoogleSignin.signIn()  →  Google ID token  →  supabase.auth.signInWithIdToken()
 *
 * The rest of the app reacts to the resulting SIGNED_IN event in useAuthInit(),
 * so this module only needs to obtain a session — profile setup, group creation,
 * OneSignal login, etc. all happen downstream exactly as they do for email OTP.
 *
 * Android-only for now. iOS additionally requires Sign in with Apple (App Store
 * Guideline 4.8) before we can expose Google there, so the button is gated to
 * Android in the UI.
 */
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';
import { GOOGLE_WEB_CLIENT_ID } from '@/constants/app';

let configured = false;

/** Idempotent one-time configure. Safe to call before every sign-in attempt. */
export function configureGoogleSignin() {
  if (configured) return;
  GoogleSignin.configure({
    // MUST be the WEB client ID — it sets the audience Supabase validates.
    webClientId: GOOGLE_WEB_CLIENT_ID,
    // We only need the ID token for Supabase; no server-side offline access.
    offlineAccess: false,
  });
  configured = true;
}

export type GoogleSignInResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; error: string };

/**
 * Run the full native Google sign-in → Supabase session exchange.
 * Never throws — returns a typed result so the UI can distinguish a user
 * cancellation (no error toast) from a real failure.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    return { ok: false, cancelled: false, error: 'Google sign-in is not configured.' };
  }

  try {
    configureGoogleSignin();

    // Verify Play Services are present & current (some devices lack them).
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();

    // v13+ returns { type: 'success' | 'cancelled', data }. Older returns userInfo.
    if (response && 'type' in response && response.type === 'cancelled') {
      return { ok: false, cancelled: true };
    }

    const idToken =
      (response as any)?.data?.idToken ?? (response as any)?.idToken ?? null;

    if (!idToken) {
      return { ok: false, cancelled: false, error: 'No ID token returned from Google.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      return { ok: false, cancelled: false, error: error.message };
    }

    return { ok: true };
  } catch (e: unknown) {
    if (isErrorWithCode(e)) {
      switch (e.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          return { ok: false, cancelled: true };
        case statusCodes.IN_PROGRESS:
          return { ok: false, cancelled: true };
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          return {
            ok: false,
            cancelled: false,
            error: 'Google Play Services are unavailable. Please use email instead.',
          };
      }
    }
    return {
      ok: false,
      cancelled: false,
      error: e instanceof Error ? e.message : 'Google sign-in failed.',
    };
  }
}

/**
 * Sign the device out of the Google SDK so the next sign-in re-prompts the
 * account picker. Call alongside supabase.auth.signOut(). Best-effort.
 */
export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in via Google, or SDK unavailable — ignore.
  }
}
