import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface the misconfiguration loudly during development so the app doesn't
  // silently fall back to broken queries.
  console.warn(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env'
  );
}

// AsyncStorage accesses `window` at import time on web SSR (Node.js), which
// throws "window is not defined". Use localStorage on web, AsyncStorage on native.
function getStorage() {
  if (Platform.OS === 'web') {
    // During SSR window/localStorage don't exist — return a no-op adapter so
    // the module loads cleanly; the real session is hydrated client-side.
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return {
        getItem: (_key: string) => Promise.resolve(null),
        setItem: (_key: string, _value: string) => Promise.resolve(),
        removeItem: (_key: string) => Promise.resolve(),
      };
    }
    return window.localStorage;
  }
  // Native: use AsyncStorage (imported lazily to avoid the SSR crash)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@react-native-async-storage/async-storage').default;
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
