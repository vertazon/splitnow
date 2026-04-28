import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuthInit } from '@/hooks/useAuth';
import { useUserStore } from '@/store/useUserStore';

SplashScreen.preventAutoHideAsync();

// ─── Auth guard ───────────────────────────────────────────────────────────────
// Reads from useUserStore (populated by useAuthInit) and redirects:
//   no session          → /(auth)/phone
//   session, no name    → /(auth)/profile   (new user, needs profile setup)
//   session, has name   → /(tabs)

function AuthGuard() {
  const router      = useRouter();
  const segments    = useSegments();
  const isLoading   = useUserStore(s => s.isLoading);
  const currentUser = useUserStore(s => s.currentUser);
  const currentUserId = useUserStore(s => s.currentUserId);

  useEffect(() => {
    if (isLoading) return;

    const inAuth  = segments[0] === '(auth)';
    const inTabs  = segments[0] === '(tabs)';

    if (!currentUserId) {
      // Not signed in — go to phone entry
      if (!inAuth) router.replace('/(auth)/phone' as never);
    } else if (!currentUser?.name) {
      // Signed in but no profile yet — go to profile setup
      if (segments[1] !== 'profile') router.replace('/(auth)/profile' as never);
    } else {
      // Fully authenticated — go to tabs
      if (!inTabs) router.replace('/(tabs)' as never);
    }
  }, [isLoading, currentUserId, currentUser?.name, segments]);

  return null;
}

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Bootstrap auth once, at the app root
  useAuthInit();

  const isAuthLoading = useUserStore(s => s.isLoading);

  useEffect(() => {
    if (fontsLoaded && !isAuthLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isAuthLoading]);

  // Keep the splash screen visible while fonts or session are loading
  if (!fontsLoaded || isAuthLoading) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" backgroundColor="#0D0D0D" />
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="(auth)"         options={{ animation: 'none' }} />
        <Stack.Screen name="(tabs)"         options={{ animation: 'none' }} />
        <Stack.Screen name="expense/[id]" />
        <Stack.Screen name="expense/edit/[id]" />
      </Stack>
    </QueryClientProvider>
  );
}
