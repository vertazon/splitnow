import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '@/lib/supabase';
import type { Router } from 'expo-router';

// Show alerts + play sound while the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[push] Skipping — not a physical device');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[push] Permission denied');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SplitNow',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00D49A',
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

export async function upsertPushToken(
  userId: string,
  token: string,
  platform: 'ios' | 'android',
): Promise<void> {
  const { error } = await supabase
    .from('push_tokens' as any)
    .upsert({ user_id: userId, token, platform }, { onConflict: 'user_id,token' });
  if (error) console.warn('[push] token upsert failed:', error.message);
}

export function handleNotificationTap(
  response: Notifications.NotificationResponse,
  router: Router,
): void {
  const data = response.notification.request.content.data as Record<string, any>;
  if (!data) return;

  switch (data.ref_type) {
    case 'expense':
      if (data.ref_id) router.push(`/expense/${data.ref_id}` as never);
      break;
    case 'settlement':
      router.push('/(tabs)/settle' as never);
      break;
    case 'comment':
      if (data.ref_id) router.push(`/expense/${data.ref_id}` as never);
      break;
    default:
      router.push('/activity' as never);
  }
}
