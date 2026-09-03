/**
 * lib/socialAuth.ts — Apple / Google one-tap sign-in for account.tsx.
 *
 * Both flows return the same shape so the caller never branches on provider:
 * `{ ok: true }` on a completed sign-in (AuthContext's onAuthStateChange picks
 * up the session and applies the staged onboarding draft), `{ cancelled: true }`
 * when the person backed out of the OS sheet — not an error, say nothing — or
 * `{ error: string }` for anything else, which the caller surfaces via
 * showAlert.
 *
 * Google's native module is optional at the JS level (require'd lazily) so a
 * build without it configured never crashes this screen — it simply reports
 * isGoogleAvailable() === false and the button never renders.
 */
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

export type SocialAuthResult = { ok: true } | { cancelled: true } | { error: string };

export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<SocialAuthResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { error: "Apple didn't return a sign-in token. Try again." };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { error: error.message };

    // Apple only hands over the name on the FIRST authorization ever — grab
    // it now or it's gone for good.
    const given = credential.fullName?.givenName;
    if (given) {
      const name = `${given} ${credential.fullName?.familyName ?? ''}`.trim();
      await supabase.auth.updateUser({ data: { name } }).catch(() => {});
    }

    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { cancelled: true };
    return { error: e?.message || 'Apple sign-in failed.' };
  }
}

export function isGoogleAvailable(): boolean {
  return !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
}

export async function signInWithGoogle(): Promise<SocialAuthResult> {
  try {
    // Lazily required: the native module may not be linked in every build,
    // and importing it at module scope would crash any screen that imports
    // this file, not just the one that calls this function.
    const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = require('@react-native-google-signin/google-signin');

    GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();

    // v13+ wraps the payload as { type, data }; earlier versions return the
    // user/idToken fields directly. Handle both shapes.
    let idToken: string | null = null;
    if (typeof isSuccessResponse === 'function') {
      if (!isSuccessResponse(response)) return { cancelled: true };
      idToken = response.data?.idToken ?? null;
    } else {
      idToken = response?.idToken ?? response?.data?.idToken ?? null;
    }

    if (!idToken) return { error: "Google didn't return a sign-in token. Try again." };

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) return { error: error.message };

    return { ok: true };
  } catch (e: any) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { isErrorWithCode, statusCodes } = require('@react-native-google-signin/google-signin');
      if (isErrorWithCode?.(e) && e.code === statusCodes?.SIGN_IN_CANCELLED) {
        return { cancelled: true };
      }
    } catch {
      // Module unavailable — fall through to the generic cancel/error checks.
    }
    if (e?.code === 'SIGN_IN_CANCELLED' || e?.code === '12501') return { cancelled: true };
    return { error: e?.message || 'Google sign-in failed.' };
  }
}
