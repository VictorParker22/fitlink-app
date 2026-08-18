import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
// Silence Reanimated strict-mode warnings (not needed in production builds)
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });


import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Platform-aware wrapper: expo-secure-store has NO web implementation and
// throws on first call. See ../lib/secureStore.ts.
import * as SecureStore from '../lib/secureStore';
import { onboardedKey, clientOnboardedKey } from '../lib/onboardingFlags';
import { ClientRoute, AuthRoute, SharedRoute } from '../types/routes';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppProvider, useApp } from '../context/AppContext';
import { ClientProvider } from '../context/ClientContext';
import { HealthProvider } from '../context/HealthContext';
import { WorkoutProvider } from '../context/WorkoutContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AlertProvider } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { isBroadcastDndEnabled, loadBroadcastDnd } from '../lib/broadcastFocus';
import { ErrorBoundaryProps } from 'expo-router';
import Button from '../components/Button';
import SplashOverlay from '../components/SplashOverlay';

// Platform-specific: .native.ts re-exports @stripe/stripe-react-native,
// .web.tsx provides a passthrough wrapper
import { StripeProvider } from '../lib/stripe-provider';
import { NetworkProvider } from '../context/NetworkContext';
import OfflineBanner from '../components/OfflineBanner';
import { RevenueCatProvider } from '../context/RevenueCatContext';
import { LayersAnalyticsProvider } from '../context/LayersContext';

// react-native-bootsplash requires a native build (EAS dev client or production).
// Guard it so Expo Go / environments without the native module don't hard-crash.
let BootSplash: any = null;
try {
  BootSplash = require('react-native-bootsplash').default;
} catch {
  // Not available in Expo Go — BootSplash animations will be skipped.
  if (__DEV__) console.warn('[BootSplash] Native module not available. Use an EAS dev client build.');
}

let Notifications: any = null;
let registerForPushNotificationsAsync: (() => Promise<string | null>) | null = null;

try {
  Notifications = require('expo-notifications');
  registerForPushNotificationsAsync = require('../utils/registerForPushNotificationsAsync').registerForPushNotificationsAsync;

  Notifications.setNotificationHandler({
    handleNotification: async () => {
      // Studio's "Do not disturb" mutes FitLink's own sound/banner while
      // live — it can't silence real phone calls, only its own alerts.
      const quiet = isBroadcastDndEnabled();
      return {
        shouldShowAlert: !quiet,
        shouldPlaySound: !quiet,
        shouldSetBadge: false,
        shouldShowBanner: !quiet,
        shouldShowList: true,
      };
    },
  });
  loadBroadcastDnd();
} catch {
  // expo-notifications not available (e.g. Expo Go SDK 53+)
  console.warn('Push notifications not available in this environment');
}



/**
 * ── Push deep-link allowlist ────────────────────────────────────────────────
 *
 * `router.push(data.url)` used to run whatever string arrived in a push
 * payload. Push is not a trusted channel: the send path is reachable by anyone
 * who can call the notification edge function (see the open-relay finding in
 * .agents/SECURITY_FIX_PLAN.md, B3), so an attacker who can send a push could
 * route a victim straight to `/checkout` with attacker-chosen params — or into
 * any other screen that acts on its query string. A payload URL is data, not a
 * command, and gets validated like data.
 *
 * The in-app routes come from types/routes.ts so this list cannot drift from
 * the real ones. (There is no `CoachRoute` export in that file; the coach-side
 * paths below are the ones actually emitted in push payloads today — grep
 * `data: { url` — and each maps to a real file under app/(tabs)/.)
 */
const PUSH_ROUTE_VALUES: string[] = [
  ...Object.values(ClientRoute),
  ...Object.values(AuthRoute),
  ...Object.values(SharedRoute),
];

/** expo-router treats `(group)` segments as transparent, so both forms resolve. */
const stripGroups = (path: string) => path.replace(/\/\([^)]*\)/g, '') || '/';

const ALLOWED_PUSH_PATHS: Set<string> = new Set(
  PUSH_ROUTE_VALUES.flatMap((r) => [r, stripGroups(r)]).map((r) =>
    r.length > 1 && r.endsWith('/') ? r.slice(0, -1) : r
  )
);

/**
 * Coach-side paths pushed today that types/routes.ts does not declare.
 * `/messages` → app/(tabs)/messages.tsx.
 */
const ALLOWED_PUSH_PATHS_EXTRA = ['/messages'];
ALLOWED_PUSH_PATHS_EXTRA.forEach((p) => ALLOWED_PUSH_PATHS.add(p));

/**
 * Parameterised deep links actually emitted in push payloads. Prefix match,
 * and only these — a prefix list is a hole, so it stays this short.
 * `/client/<id>` → app/client/[id].tsx (ClientContext, strength-session,
 * ActiveWorkoutPlayer all push it).
 */
const ALLOWED_PUSH_PREFIXES = ['/client/'];

/**
 * Routes that are legitimate in-app destinations but are never sent in a push
 * payload (nothing in this repo emits them — grep `data: { url`). `/checkout`
 * is the named exploit: it reads its own query params, so allowing it would
 * let a push author choose what the victim is about to pay for. A route only
 * earns a place on the allowlist by actually being pushed.
 */
const DENIED_PUSH_PATHS = new Set(['/checkout']);

/**
 * True only for an in-app path we are willing to navigate to from a push.
 * Rejects anything with a scheme (http:, javascript:, file:, fitlink:, …),
 * anything not starting with '/', protocol-relative '//host', and any '..'.
 */
function isAllowedPushRoute(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const url = raw.trim();
  if (!url.startsWith('/')) return false;      // needs to be an in-app path
  if (url.startsWith('//')) return false;      // protocol-relative → external host
  if (url.includes('..')) return false;        // no traversal
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) return false; // any scheme at all
  // Only printable ASCII. Rejects whitespace, control characters, and
  // non-ASCII that could normalise into a different path.
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i);
    if (code <= 0x20 || code >= 0x7f) return false;
  }

  // Compare the PATH only; params are allowed to vary, the destination is not.
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (DENIED_PUSH_PATHS.has(path) || DENIED_PUSH_PATHS.has(stripGroups(path))) return false;
  if (ALLOWED_PUSH_PATHS.has(path)) return true;
  return ALLOWED_PUSH_PREFIXES.some((prefix) => path.startsWith(prefix) && path.length > prefix.length);
}

function AuthGuard({ onProgress }: { onProgress?: (value: number) => void }) {
  const { isAuthenticated, loading, userRole, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { updatePushToken } = useApp();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [hasClientOnboarded, setHasClientOnboarded] = useState<boolean | null>(null);
  /**
   * WHOSE flags the two states above currently hold. On sign-in there is a
   * window where hasOnboarded still carries the signed-out value (false)
   * while this account's SecureStore read is in flight — routing during that
   * window shoved every returning user into the wizard, and the "let them
   * stay on the wizard" rule then kept them there after the real flag (true)
   * arrived. The router now refuses to route an authenticated user until
   * flagsUserId matches the signed-in account.
   */
  const [flagsUserId, setFlagsUserId] = useState<string | null>(null);
  const hasNavigated = useRef(false);

  // Push notification listeners
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  // Onboarding flags are stored PER ACCOUNT, not per device.
  //
  // They used to be device-global, so signing out had to erase them or the next
  // person on the phone would inherit the previous one's completed setup. But
  // erasing them meant the same person re-logging in had to redo the wizard
  // whenever their account metadata was missing (which happens — see the
  // wizard's completion path). Keying by user id gets both: a different account
  // on this device has different keys and correctly sees the wizard, while the
  // same account never repeats it. Auth metadata remains a secondary source so
  // a fresh device still knows.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setHasOnboarded(false);
      setHasClientOnboarded(false);
      setFlagsUserId(null);
      return;
    }
    // The read is async: mark the flags stale for this account until it lands.
    setFlagsUserId((prev) => (prev === user.id ? prev : null));
    const readForUserId = user.id;
    const trainerKey = onboardedKey(user.id);
    const clientKey = clientOnboardedKey(user.id);
    Promise.all([
      SecureStore.getItemAsync(trainerKey),
      SecureStore.getItemAsync(clientKey),
    ]).then(([onboarded, clientOnboarded]) => {
      // Another account signed in while this read was in flight — its own
      // effect run owns the flags now; writing here would cross accounts.
      if (readForUserId !== user.id) return;
      const meta = (user.user_metadata ?? {}) as Record<string, any>;
      // Tolerate booleans and strings — metadata has been written both ways.
      const truthy = (v: any) => v === true || v === 'true';
      const trainerDone =
        onboarded === 'true' || truthy(meta.onboarded) || truthy(meta.wizard_complete);
      const clientDone = clientOnboarded === 'true' || truthy(meta.client_onboarded);
      setHasOnboarded(trainerDone);
      setHasClientOnboarded(clientDone);
      setFlagsUserId(readForUserId);
      // Re-seed this account's device flag so offline cold starts stay correct.
      if (trainerDone && onboarded !== 'true') {
        SecureStore.setItemAsync(trainerKey, 'true').catch(() => {});
      }
      if (clientDone && clientOnboarded !== 'true') {
        SecureStore.setItemAsync(clientKey, 'true').catch(() => {});
      }
    }).catch(() => {
      // SecureStore itself failed — without this, flagsUserId never lands and
      // the router waits on the splash forever. Fall back to auth metadata,
      // the same secondary source a brand-new device uses.
      if (readForUserId !== user.id) return;
      const meta = (user.user_metadata ?? {}) as Record<string, any>;
      const truthy = (v: any) => v === true || v === 'true';
      setHasOnboarded(truthy(meta.onboarded) || truthy(meta.wizard_complete));
      setHasClientOnboarded(truthy(meta.client_onboarded));
      setFlagsUserId(readForUserId);
    });
  }, [user, loading]);

  useEffect(() => {

    if (Notifications) {
      notificationListener.current = Notifications.addNotificationReceivedListener((notification: any) => {
        // Handle foreground push notification if needed
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
        // Handle interaction - navigate only to an allowlisted in-app route.
        // The payload is attacker-controllable (see isAllowedPushRoute above);
        // it is never passed straight to the router.
        const data = response.notification.request.content.data;
        if (data && data.url) {
          if (isAllowedPushRoute(data.url)) {
            router.push(data.url as any);
          } else if (__DEV__) {
            console.warn('[Push] Rejected deep link from notification payload:', data.url);
          }
        }
      });
    }

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  // Splash bar milestone: the Supabase session and the onboarding flags are in.
  useEffect(() => {
    if (!loading && hasOnboarded !== null) onProgress?.(0.66);
  }, [loading, hasOnboarded, onProgress]);

  useEffect(() => {
    if (loading || hasOnboarded === null) return;
    // Signed in, but the flags still belong to nobody / a previous account:
    // routing now would use the signed-out `false` and open the wizard for a
    // user who finished it long ago. Wait for this account's own answer.
    if (user && flagsUserId !== user.id) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inClientGroup = segments[0] === '(client-tabs)';
    const inTrainerGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (isAuthenticated && inAuthGroup) {
      // Allow clients to re-enter onboarding to update their profile
      const isOnboardingScreen = segments[1] === 'client-onboarding';
      const isWizardScreen = segments[1] === 'trainer-wizard';
      if (userRole === 'client') {
        if (!hasClientOnboarded && !isOnboardingScreen) {
          router.replace('/(auth)/client-onboarding' as any);
        } else if (hasClientOnboarded && !isOnboardingScreen) {
          router.replace('/(client-tabs)');
        }
        // If isOnboardingScreen, let them stay — they're updating their profile
      } else {
        // New trainers must complete the setup wizard before reaching the dashboard
        if (!hasOnboarded && !isWizardScreen) {
          router.replace('/(auth)/trainer-wizard' as any);
        } else if (hasOnboarded && !isWizardScreen) {
          router.replace('/(tabs)');
        }
        // If isWizardScreen, let them stay
      }
    } else if (isAuthenticated && userRole === 'client' && inTrainerGroup) {
      router.replace('/(client-tabs)');
    } else if (isAuthenticated && userRole === 'trainer' && inClientGroup) {
      router.replace('/(tabs)');
    }

    // Hide splash after initial navigation (or if already on correct screen)
    if (!hasNavigated.current) {
      hasNavigated.current = true;
      // Route is settled — the splash bar is honestly full now.
      onProgress?.(1);
      // Fade out the native splash screen (no-op if running in Expo Go)
      setTimeout(() => BootSplash?.hide({ fade: true }), 150);
    }
  }, [isAuthenticated, loading, segments, userRole, hasOnboarded, hasClientOnboarded, user, flagsUserId]);



  // Handle push token when authenticated
  useEffect(() => {
    if (isAuthenticated && registerForPushNotificationsAsync) {
      registerForPushNotificationsAsync().then(token => {
        if (token) updatePushToken(token);
      });
    }
  }, [isAuthenticated, updatePushToken]);

  // Keep splash visible — don't render Stack until we're ready to navigate
  if (loading || hasOnboarded === null) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: CoachColors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(client-tabs)" />
      <Stack.Screen name="client/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="add-client" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="create-plan" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="pass-track-editor" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="pass-holders" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="pass-versions" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="book-session" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="session/[id]" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
      <Stack.Screen name="session/complete" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="edit-client/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="certifications" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="specializations" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="subscriptions" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="referrals" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="analytics" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="org/index" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="org/billing" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ops/index" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="help-center" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="contact-support" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="terms-privacy" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="broadcast/setup" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="broadcast/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="create-live-class" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [bootSplashVisible, setBootSplashVisible] = useState(true);
  // Real startup milestones, fed to the splash's determinate bar:
  // fonts .33 → session + onboarding flags .66 → route settled 1.
  const [startupProgress, setStartupProgress] = useState(0.15);
  const [fontsLoaded] = useFonts({
    'Epilogue-Regular': require('../assets/fonts/Epilogue-Regular.ttf'),
    'Epilogue-Medium': require('../assets/fonts/Epilogue-Medium.ttf'),
    'Epilogue-SemiBold': require('../assets/fonts/Epilogue-SemiBold.ttf'),
    'Epilogue-Bold': require('../assets/fonts/Epilogue-Bold.ttf'),
    'Epilogue-ExtraBold': require('../assets/fonts/Epilogue-ExtraBold.ttf'),
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_500Medium,
  });

  // DON'T hide splash here — AuthGuard handles it after navigation.
  // Fonts aren't up yet: show the splash rather than a black frame.
  // fontsReady={false} keeps it off the missing font family.
  if (!fontsLoaded) {
    return <SplashOverlay progress={0.15} fontsReady={false} />;
  }

  const progress = Math.max(startupProgress, 0.33);

  return (
    <LayersAnalyticsProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider
        publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""}
        merchantIdentifier="merchant.com.fitlink.app"
        urlScheme="fitlink"
      >
        <NetworkProvider>
          <ThemeProvider>
            <AlertProvider>
              <AuthProvider>
                <RevenueCatProvider>
                  <AppProvider>
                    <ClientProvider>
                      <WorkoutProvider>
                        <HealthProvider>
                          <ThemedStatusBar />
                          <AuthGuard onProgress={setStartupProgress} />
                          <OfflineBanner />
                        </HealthProvider>
                      </WorkoutProvider>
                    </ClientProvider>
                  </AppProvider>
                </RevenueCatProvider>
              </AuthProvider>
            </AlertProvider>
          </ThemeProvider>
        </NetworkProvider>
      </StripeProvider>
      {bootSplashVisible && (
        <AnimatedBootSplash
          progress={progress}
          onAnimationEnd={() => setBootSplashVisible(false)}
        />
      )}
    </GestureHandlerRootView>
    </LayersAnalyticsProvider>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

type SplashPathProps = { progress: number; onAnimationEnd: () => void };

// Only picks a branch — the hooks live in the two leaf components so they stay
// unconditional.
function AnimatedBootSplash(props: SplashPathProps) {
  // Platform.OS check is NOT redundant with the null check. On web the
  // require() succeeds and `useHideAnimation` exists — so this took the NATIVE
  // path, whose hand-over `animate` callback never fires because there is no
  // native splash underneath to hand over FROM. `handedOver` stayed false, the
  // overlay never faded, and the app sat behind a splash it had already
  // finished loading behind. The JS path's own timer is the correct one here.
  return BootSplash?.useHideAnimation && Platform.OS !== 'web' ? (
    <NativeBootSplash {...props} />
  ) : (
    <JSBootSplash {...props} />
  );
}

// ── Native path (EAS dev client / production) ──────────────────────────────
function NativeBootSplash({ progress, onAnimationEnd }: SplashPathProps) {
  // The native splash sits underneath us until `animate` fires, so we can't
  // start fading before then or the old frame shows through.
  const [handedOver, setHandedOver] = useState(false);

  const { container } = BootSplash.useHideAnimation({
    manifest: require('../assets/bootsplash/manifest.json'),
    logo: require('../assets/bootsplash/logo.png'),
    animate: () => setHandedOver(true),
  });

  return (
    <View {...container} style={[container.style, { zIndex: 9999 }]}>
      <SplashOverlay
        progress={progress}
        done={handedOver && progress >= 1}
        onFadeComplete={onAnimationEnd}
      />
    </View>
  );
}

// ── JS path (Expo Go / no native module) ───────────────────────────────────
function JSBootSplash({ progress, onAnimationEnd }: SplashPathProps) {
  const [minHoldPassed, setMinHoldPassed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinHoldPassed(true), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <SplashOverlay
      progress={progress}
      done={minHoldPassed && progress >= 1}
      onFadeComplete={onAnimationEnd}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: CoachColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <View style={[styles.loadingContainer, { padding: 20 }]}>
      <Ionicons name="warning" size={54} color={CoachColors.warning} style={{ marginBottom: 10 }} />
      <Text style={{ fontFamily: CoachFonts.headingBold, fontSize: 29, color: CoachColors.textPrimary, marginBottom: 4 }}>Something went wrong</Text>
      <Text style={{ fontFamily: CoachFonts.body, fontSize: 17, color: CoachColors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
        {__DEV__ ? props.error.message : "We're sorry, an unexpected error occurred. Please try again."}
      </Text>
      <TouchableOpacity
        onPress={props.retry}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CoachColors.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 }}
        activeOpacity={0.85}
      >
        <Ionicons name="refresh" size={20} color={CoachColors.onAccent} />
        <Text style={{ fontFamily: CoachFonts.headingSemiBold, fontSize: 20, color: CoachColors.onAccent }}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}
