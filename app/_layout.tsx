import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
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
import { usePendingInvite } from '@/store/usePendingInvite';
import {
  registerForPushNotificationsAsync,
  upsertPushToken,
  handleNotificationTap,
} from '@/lib/notifications';

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
      // Not signed in — must be on an auth screen
      if (!inAuth) router.replace('/(auth)/phone' as never);
    } else if (!currentUser?.name) {
      // Signed in but no profile yet — must be on profile setup
      if (segments[1] !== 'profile') router.replace('/(auth)/profile' as never);
    } else {
      // Fully authenticated — only redirect if still sitting on an auth screen
      if (inAuth) router.replace('/(tabs)' as never);
    }
  }, [isLoading, currentUserId, currentUser?.name, segments]);

  return null;
}

// ─── Deep link capture ────────────────────────────────────────────────────────
// Runs at all times. Intercepts join/<code> URLs and saves the code to the
// pending store so it survives an auth redirect (unauthenticated users).
// Authenticated users are routed directly by Expo Router; this acts as a safety
// net for the unauthenticated case before AuthGuard fires.

const JOIN_CODE_RE = /^join\/([a-z2-9]{8})$/i;

function DeepLinkCapture() {
  const url = Linking.useURL();

  useEffect(() => {
    if (!url) return;
    try {
      const parsed = Linking.parse(url);
      const path = (parsed.path ?? '').replace(/^\//, '');
      const match = path.match(JOIN_CODE_RE);
      if (match) {
        usePendingInvite.getState().setCode(match[1].toLowerCase());
      }
    } catch {}
  }, [url]);

  return null;
}

// ─── Pending invite processor ─────────────────────────────────────────────────
// After auth completes, if there is a saved invite code, navigate to the join
// screen to process the friendship.

function PendingInviteProcessor() {
  const router        = useRouter();
  const pendingCode   = usePendingInvite(s => s.pendingCode);
  const clearCode     = usePendingInvite(s => s.clearCode);
  const currentUserId = useUserStore(s => s.currentUserId);
  const hasProfile    = useUserStore(s => !!s.currentUser?.name);

  useEffect(() => {
    if (!pendingCode || !currentUserId || !hasProfile) return;
    clearCode();
    router.push(`/join/${pendingCode}` as never);
  }, [pendingCode, currentUserId, hasProfile]);

  return null;
}

// ─── Push notification setup ──────────────────────────────────────────────────
// Registers for push once the user is authenticated and wires the tap handler.

function PushNotificationSetup() {
  const router        = useRouter();
  const currentUserId = useUserStore(s => s.currentUserId);
  const tapListenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!currentUserId) return;

    // Register token
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        upsertPushToken(currentUserId, token, Platform.OS as 'ios' | 'android');
      }
    });

    // Tap listener — fires when user taps a notification while app is backgrounded/closed
    tapListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      response => handleNotificationTap(response, router),
    );

    return () => {
      tapListenerRef.current?.remove();
    };
  }, [currentUserId]);

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

  // Keep the splash screen visible while fonts or session are loading.
  // Return a dark view (not null) so that if isLoading briefly becomes true
  // again after the splash is dismissed (e.g. during OTP sign-in profile fetch),
  // the user sees the app background instead of a white screen.
  if (!fontsLoaded || isAuthLoading) return <View style={{ flex: 1, backgroundColor: '#0D0D0D' }} />;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" backgroundColor="#0D0D0D" />
      <DeepLinkCapture />
      <AuthGuard />
      <PendingInviteProcessor />
      <PushNotificationSetup />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="(auth)"            options={{ animation: 'none' }} />
        <Stack.Screen name="(tabs)"            options={{ animation: 'none' }} />
        <Stack.Screen name="account"           options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile"           options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="expenses"          options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="expense/[id]"      options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="expense/edit/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="join/[code]"       options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="groups/index"      options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="groups/[id]"       options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="groups/create"     options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="groups/edit/[id]"  options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="activity"                options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notification-settings"   options={{ animation: 'slide_from_right' }} />
      </Stack>
    </QueryClientProvider>
  );
}
