import { createContext, useContext, useState, useEffect, useCallback, type PropsWithChildren } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
// Platform-aware wrapper: expo-secure-store has NO web implementation and
// throws on first call. See ../lib/secureStore.ts.
import * as SecureStore from '../lib/secureStore';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { layers } from '../lib/layers';
import { clearSnapshots } from '../lib/offlineCache';
import { clearOutbox } from '../lib/outbox';
import { clearMediaUrlCache } from '../lib/privateMedia';
import type { User, Session } from '@supabase/supabase-js';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * In-context priming shown before the one-shot iOS notification prompt.
 * Resolves true only if the user actively opts in.
 */
function primeForPushPermission(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      'Turn on notifications?',
      "FitLink uses notifications for the things you'd want a nudge about: a new message from your coach, a session starting soon, and your check-in reminders. Nothing else.",
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Turn on', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    // Awaited: the channel must exist before any notification is delivered,
    // otherwise Android drops the first ones silently.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      // HIG / App Review: never fire the system notification prompt cold. The
      // iOS prompt can only ever be shown ONCE, so asking silently at login —
      // before the user has seen anything the notifications are about — burns
      // the single chance and reads as a demand. Explain first, in our own
      // words, and only surface the system dialog if they opt in. Declining
      // here leaves the system permission untouched, so Settings (and a later
      // launch) can still ask.
      const wantsPush = await primeForPushPermission();
      if (!wantsPush) return null;
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }

    try {
      if (Platform.OS === 'android') {
        // Native FCM token — delivered via our Firebase Cloud Function (no service account key needed)
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        if (__DEV__) console.log('FCM Device Token:', deviceToken.data);
        return deviceToken.data as string;
      } else {
        // iOS — Expo push token (works perfectly through Expo's push service)
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        if (!projectId) return null;
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (__DEV__) console.log('Expo Push Token:', token);
        return token;
      }
    } catch (e) {
      // Gated: the push-registration error can echo the device/push token.
      if (__DEV__) console.warn('Error fetching push token:', e);
      return null;
    }
  } else {
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: 'trainer' | 'client';
  isAuthenticated: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInWithPhone: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, token: string, metadata?: Record<string, string>) => Promise<any>;
  signUpAsClient: (email: string, password: string, name: string) => Promise<void>;
  verifyOtpAsClient: (phone: string, token: string, name?: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'trainer' | 'client'>('trainer');

  useEffect(() => {
    const handleSession = async (s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      const role = (s?.user?.user_metadata?.role as 'trainer' | 'client') || 'trainer';
      setUserRole(role);

      // AUTH IS RESOLVED HERE, AND NOTHING BELOW MAY DELAY IT.
      //
      // setLoading(false) used to sit at the BOTTOM of this function, behind
      // `await registerForPushNotificationsAsync()`. That made the entire app
      // wait on a notification-permission decision to finish signing in —
      // two things with nothing to do with each other. AuthGuard renders null
      // while `loading` is true, so the Stack never mounted and the user sat
      // on the splash screen forever, signed in, with no way forward and no
      // error to explain it. Observed on web, where the permission promise can
      // simply never settle; the same shape hangs on native if the OS dialog
      // is never answered.
      //
      // Whether push works is not part of whether you are logged in.
      setLoading(false);

      if (!s?.user) return;

      // ── Everything past here is best-effort and deliberately not awaited ──
      // Detached with .then/.catch rather than awaited, so a hanging permission
      // prompt or a slow network can never again hold the app on the splash.
      registerForPushNotificationsAsync()
        .then(async (token) => {
          if (!token) return;
          // Supabase writes resolve with { error } — they do not throw, so the
          // catch below would never see a failed write. Check it explicitly.
          // Failure is non-fatal: no push until the next launch.
          const { error: tokenError } = role === 'client'
            ? await supabase.from('clients').update({ expo_push_token: token }).eq('auth_user_id', s.user.id)
            : await supabase.from('trainers').update({ expo_push_token: token }).eq('id', s.user.id);
          if (tokenError && __DEV__) {
            console.warn('[AuthContext] Push token not stored:', tokenError.message);
          }
        })
        .catch((e) => {
          if (__DEV__) console.warn('[AuthContext] Failed to register push token:', e);
        });

      // ── Layers: identify authenticated user ──────────────────────────────
      try {
        layers.identify(s.user.id, {
          email: s.user.email,
          phone: s.user.phone,
          role,
          name: s.user.user_metadata?.name,
          signup_date: s.user.created_at,
        });
      } catch (e) {
        if (__DEV__) console.warn('[Layers] identify error:', e);
      }
    };

    // Get initial session — catch stale/invalid refresh tokens and sign out cleanly
    // instead of crashing with AuthApiError: Refresh Token Not Found
    supabase.auth.getSession().then(({ data: { session: s }, error }) => {
      if (error) {
        // Gated: auth error text can quote the refresh token it rejected.
        if (__DEV__) console.warn('[AuthContext] Session restore failed (stale token), signing out:', error.message);
        supabase.auth.signOut();
        setLoading(false);
        return;
      }
      handleSession(s);
    });


    // Listen for auth state changes
    // TOKEN_REFRESH_FAILURE fires when a background refresh fails (e.g. on reconnect with an
    // expired token). Sign out immediately to clear the stale session rather than entering a
    // broken half-authenticated state.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED' && !s) return; // shouldn't happen but guard anyway
      if (event === 'SIGNED_OUT' || (event as string) === 'TOKEN_REFRESH_FAILURE') {
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      handleSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Email/Password (Trainer) ---
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Layers: login event (identify fires via onAuthStateChange)
    layers.track('login', { method: 'email', role: 'trainer' });
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
    layers.track('sign_up', { method: 'email', role: 'trainer', name });
  }, []);

  // --- Phone OTP (Shared) ---
  const signInWithPhone = useCallback(async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string, metadata: Record<string, string> = {}) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (error) throw error;

    // Update user metadata if provided (name, etc.)
    if (data.user && Object.keys(metadata).length > 0) {
      await supabase.auth.updateUser({ data: metadata });
    }

    // Layers: login via phone OTP
    layers.track('login', { method: 'phone_otp', role: 'trainer' });
    return data;
  }, []);

  // --- Client-Specific Auth ---
  const signUpAsClient = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: 'client' } },
    });
    if (error) throw error;
    layers.track('sign_up', { method: 'email', role: 'client', name });
    // DB trigger on auth.users automatically links matching client row
  }, []);

  const verifyOtpAsClient = useCallback(async (phone: string, token: string, name?: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (error) throw error;

    // Set role to client in metadata
    if (data.user) {
      const meta: Record<string, string> = { role: 'client' };
      if (name) meta.name = name;
      await supabase.auth.updateUser({ data: meta });
      // DB trigger handles auto-linking by phone via raw_user_meta_data
    }

    // Layers: new client signed up via phone OTP
    layers.track(data.user?.created_at === data.user?.last_sign_in_at ? 'sign_up' : 'login', {
      method: 'phone_otp',
      role: 'client',
      name,
    });

    return data;
  }, []);
  // linkClientAccount is no longer needed — a DB trigger on auth.users
  // automatically sets auth_user_id on matching client rows at signup time.

  const signOut = useCallback(async () => {
    // The signed-out user id, captured before the session goes away — every
    // local store below is keyed by it, so it has to be read first.
    const signedOutUserId = user?.id ?? session?.user?.id ?? null;

    // ORDER MATTERS: local data is cleared BEFORE supabase.auth.signOut().
    // If the network call went first and then a clear failed, the PII would be
    // sitting on disk with no session left to retry the clear from. Doing it
    // this way, the worst case is data cleared from a still-valid session.
    //
    // None of these may abort the sign-out — the user asked to be signed out
    // and must end up signed out regardless. But they are not swallowed
    // either: each failure is warned about in __DEV__ (the helpers do their
    // own logging; this catch covers a helper throwing unexpectedly).

    // 1. Offline snapshots — health intake, emails, phones, message previews,
    //    a coach's whole roster, all in plain AsyncStorage.
    try {
      await clearSnapshots(signedOutUserId);
    } catch (e) {
      if (__DEV__) console.warn('[AuthContext] clearSnapshots threw during sign-out:', e);
    }

    // 2. Chat outbox — unsent message bodies. Nobody can flush them after the
    //    session ends, so they are pure residue.
    try {
      await clearOutbox(signedOutUserId);
      // Signed URLs for private-bucket media are short-lived but still live
      // credentials — they must not survive into the next account's session.
      clearMediaUrlCache();
    } catch (e) {
      if (__DEV__) console.warn('[AuthContext] clearOutbox threw during sign-out:', e);
    }

    // 3. Analytics identity. Without this the Layers client keeps the previous
    //    user id and anonymous id, so the next account on a shared device has
    //    its events attributed to the person who signed out.
    try {
      layers.reset();
    } catch (e) {
      if (__DEV__) console.warn('[AuthContext] layers.reset threw during sign-out:', e);
    }

    try {
      // Onboarding flags are keyed per account now (lib/onboardingFlags.ts),
      // so signing out must NOT erase them — a different account on this
      // device reads different keys and correctly sees the wizard, while this
      // account keeps its completed setup. Only the old device-global keys are
      // cleared, so a legacy flag can never leak between accounts.
      await SecureStore.deleteItemAsync('fitlink_wizard_complete');
      await SecureStore.deleteItemAsync('fitlink_onboarded');
      await SecureStore.deleteItemAsync('fitlink_client_onboarded');
    } catch (e) {
      if (__DEV__) console.warn('[AuthContext] Legacy SecureStore flag cleanup failed:', e);
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [user?.id, session?.user?.id]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      userRole,
      isAuthenticated: !!session,
      signIn,
      signUp,
      signInWithPhone,
      verifyOtp,
      signUpAsClient,
      verifyOtpAsClient,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
