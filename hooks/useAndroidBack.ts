/**
 * Android hardware back button / back gesture.
 *
 * iOS has no equivalent, so this was never needed while the app was iOS-only.
 * On Android the default is brutal: back pops the entire screen off the router
 * stack. On a multi-step wizard that throws away every step the user filled in;
 * on an active training session it ends the session with no confirmation.
 *
 * `handler` returns true to say "I handled this, do not pop the screen", or
 * false to let the default navigation happen. It only listens while the screen
 * is focused, so a wizard does not keep intercepting back from other screens.
 *
 * No-op on iOS.
 */
import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

export function useAndroidBack(handler: () => boolean, enabled: boolean = true) {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !enabled) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', handler);
      return () => sub.remove();
    }, [handler, enabled])
  );
}
