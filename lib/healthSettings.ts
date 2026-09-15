/**
 * Where health read access is actually decided.
 *
 * iOS asks ONCE. After that the toggles live in the Health app (profile →
 * Apps → FitLink) and there is no deep link to that page, but opening Health
 * lands one tap away. Android's Health Connect permissions live in its own
 * app / system settings. The URL is our own constant, never user input
 * (lib/safeUrl.ts rule).
 */
import { Linking, Platform } from 'react-native';

export function openHealthSettings(): void {
  if (Platform.OS === 'ios') {
    Linking.openURL('x-apple-health://').catch(() => Linking.openSettings().catch(() => {}));
  } else {
    Linking.openSettings().catch(() => {});
  }
}
