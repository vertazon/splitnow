import { OneSignal } from 'react-native-onesignal';
import { ONESIGNAL_APP_ID } from '@/constants/app';

export function initOneSignal() {
  OneSignal.initialize(ONESIGNAL_APP_ID);
}

export function loginOneSignal(userId: string) {
  OneSignal.login(userId);
}

export function logoutOneSignal() {
  OneSignal.logout();
}
