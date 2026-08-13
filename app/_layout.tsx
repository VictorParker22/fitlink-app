import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
// Silence Reanimated strict-mode warnings (not needed in production builds)
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });


import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppProvider, useApp } from '../context/AppContext';
import { ClientProvider } from '../context/ClientContext';
import { HealthProvider } from '../context/HealthContext';
import { WorkoutProvider } from '../context/WorkoutContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { Colors, Spacing, Radius, FontFamily, FontSize } from '../constants/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AlertProvider } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { isBroadcastDndEnabled, loadBroadcastDnd } from '../lib/broadcastFocus';
import { ErrorBoundaryProps } from 'expo-router';
import Button from '../components/Button';
import SplashOverlay from '../components/SplashOverlay';
import LottieView from 'lottie-react-native';

// Platform-specific: .native.ts re-exports @stripe/stripe-react-native,
// .web.tsx provides a passthrough wrapper
import { StripeProvider } from '../lib/stripe-provider';
import { NetworkProvider } from '../context/NetworkContext';
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



function AuthGuard({ onProgress }: { onProgress?: (value: number) => void }) {
  const { isAuthenticated, loading, userRole } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { updatePushToken } = useApp();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [hasClientOnboarded, setHasClientOnboarded] = useState<boolean | null>(null);
  const hasNavigated = useRef(false);

  // Push notification listeners
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  // Check onboarding flags once on mount
  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync('fitlink_onboarded'),
      SecureStore.getItemAsync('fitlink_client_onboarded'),
    ]).then(([onboarded, clientOnboarded]) => {
      setHasOnboarded(onboarded === 'true');
      setHasClientOnboarded(clientOnboarded === 'true');
    });

    if (Notifications) {
      notificationListener.current = Notifications.addNotificationReceivedListener((notification: any) => {
        // Handle foreground push notification if needed
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
        // Handle interaction - navigate if URL is provided
        const data = response.notification.request.content.data;
        if (data && data.url) {
          router.push(data.url);
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
  }, [isAuthenticated, loading, segments, userRole, hasOnboarded, hasClientOnboarded]);



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
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bgPrimary } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(client-tabs)" />
      <Stack.Screen name="client/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="add-client" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="create-plan" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="pass-track-editor" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="pass-holders" options={{ animation: 'slide_from_right' }} />
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
  return BootSplash?.useHideAnimation ? (
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
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <View style={[styles.loadingContainer, { padding: Spacing.xl }]}>
      <Ionicons name="warning" size={48} color={Colors.yellow} style={{ marginBottom: Spacing.md }} />
      <Text style={{ fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: Colors.textPrimary, marginBottom: Spacing.xs }}>Something went wrong</Text>
      <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl }}>
        {__DEV__ ? props.error.message : "We're sorry, an unexpected error occurred. Please try again."}
      </Text>
      <TouchableOpacity
        onPress={props.retry}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 }}
        activeOpacity={0.85}
      >
        <Ionicons name="refresh" size={18} color={Colors.white} />
        <Text style={{ fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.white }}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}
