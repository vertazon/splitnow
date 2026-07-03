import { ONESIGNAL_APP_ID } from '@/constants/app';

let _OneSignal: any = null;
try { _OneSignal = require('react-native-onesignal').OneSignal; } catch {}

export function initOneSignal() {
  _OneSignal?.initialize(ONESIGNAL_APP_ID);
}

export function loginOneSignal(userId: string) {
  _OneSignal?.login(userId);
}

export function logoutOneSignal() {
  _OneSignal?.logout();
}
