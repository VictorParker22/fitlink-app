/**
 * lib/permissions.ts — the one place the app asks the OS for anything.
 *
 * Doctrine (HIG + Play policy, and how the good apps do it):
 * - The system prompt is never fired cold. A primer screen (onboarding) or an
 *   in-context moment owns the ask, explains why in our words first, and only
 *   then surfaces the OS dialog.
 * - iOS shows each system prompt ONCE per install. `canAskAgain === false`
 *   means the only path left is Settings — callers get 'blocked' so the UI
 *   can deep-link there instead of showing a dead "Allow" button.
 * - Declining anything is a first-class outcome. Nothing here throws on "no".
 */

import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { supabase } from './supabase';
import { registerForPushNotificationsAsync } from '../utils/registerForPushNotificationsAsync';

export type PermState = 'granted' | 'ask' | 'blocked';

function toState(granted: boolean, canAskAgain: boolean): PermState {
  if (granted) return 'granted';
  return canAskAgain ? 'ask' : 'blocked';
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotificationState(): Promise<PermState> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return toState(status === 'granted', canAskAgain !== false);
  } catch {
    return 'ask';
  }
}

/**
 * Fires the system prompt, and on a grant immediately registers the push
 * token and stores it on the caller's row — so "Allow" in the primer is the
 * whole job, not the first half of one.
 */
export async function requestNotifications(): Promise<PermState> {
  try {
    const before = await Notifications.getPermissionsAsync();
    if (before.status !== 'granted' && before.canAskAgain === false) return 'blocked';

    const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return toState(false, canAskAgain !== false);

    // Best-effort, detached from the grant result: token trouble is a
    // next-launch problem, not a reason to tell the user "denied".
    registerForPushNotificationsAsync()
      .then(async (token) => {
        if (!token) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const role = (user.user_metadata?.role as string) || 'trainer';
        // Supabase resolves with { error } — check it, don't rely on catch.
        const { error } = role === 'client'
          ? await supabase.from('clients').update({ expo_push_token: token }).eq('auth_user_id', user.id)
          : await supabase.from('trainers').update({ expo_push_token: token }).eq('id', user.id);
        if (error && __DEV__) console.warn('[permissions] push token not stored:', error.message);
      })
      .catch((e) => { if (__DEV__) console.warn('[permissions] push registration failed:', e); });

    return 'granted';
  } catch {
    return 'ask';
  }
}

// ─── Camera + microphone (Studio: filming exercises, going live) ─────────────

export async function getCameraMicState(): Promise<PermState> {
  try {
    const [cam, mic] = await Promise.all([
      ImagePicker.getCameraPermissionsAsync(),
      Audio.getPermissionsAsync(),
    ]);
    const granted = cam.status === 'granted' && mic.status === 'granted';
    const blocked =
      (cam.status !== 'granted' && cam.canAskAgain === false) ||
      (mic.status !== 'granted' && mic.canAskAgain === false);
    if (granted) return 'granted';
    return blocked ? 'blocked' : 'ask';
  } catch {
    return 'ask';
  }
}

export async function requestCameraMic(): Promise<PermState> {
  try {
    // Sequential on purpose: two stacked system dialogs feel like an ambush;
    // one at a time reads as a conversation.
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const mic = await Audio.requestPermissionsAsync();
    const granted = cam.status === 'granted' && mic.status === 'granted';
    const blocked =
      (cam.status !== 'granted' && cam.canAskAgain === false) ||
      (mic.status !== 'granted' && mic.canAskAgain === false);
    if (granted) return 'granted';
    return blocked ? 'blocked' : 'ask';
  } catch {
    return 'ask';
  }
}

// ─── Settings deep link (the only exit from 'blocked') ───────────────────────

export function openAppSettings() {
  if (Platform.OS === 'web') return;
  Linking.openSettings().catch(() => {});
}
