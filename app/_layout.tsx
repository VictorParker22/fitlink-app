import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppProvider, useApp } from '../context/AppContext';
import { ClientProvider } from '../context/ClientContext';
import { HealthProvider } from '../context/HealthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { Colors, Spacing, Radius, FontFamily, FontSize } from '../constants/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AlertProvider } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { ErrorBoundaryProps } from 'expo-router';
import Button from '../components/Button';
import { StripeProvider } from '@stripe/stripe-react-native';

let Notifications: any = null;
let registerForPushNotificationsAsync: (() => Promise<string | null>) | null = null;

try {
  Notifications = require('expo-notifications');
  registerForPushNotificationsAsync = require('../utils/registerForPushNotificationsAsync').registerForPushNotificationsAsync;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // expo-notifications not available (e.g. Expo Go SDK 53+)
  console.warn('Push notifications not available in this environment');
}


// Keep splash visible until we know exactly where to go
SplashScreen.preventAutoHideAsync();

function AuthGuard() {
  const { isAuthenticated, loading, userRole } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { updatePushToken } = useApp();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [hasWizard, setHasWizard] = useState<boolean | null>(null);
  const hasNavigated = useRef(false);

  // Push notification listeners
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  // Check onboarding + wizard flags once on mount
  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync('fitlink_onboarded'),
      SecureStore.getItemAsync('fitlink_wizard_complete'),
    ]).then(([onboarded, wizard]) => {
      setHasOnboarded(onboarded === 'true');
      // Only set hasWizard to true if SecureStore says so.
      // If it's null/false, keep hasWizard as null and let the
      // auth-based DB check (below) make the final determination.
      if (wizard === 'true') {
        setHasWizard(true);
      }
      // If wizard is not 'true', don't set hasWizard yet —
      // the isAuthenticated effect will handle it after checking the DB
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

  useEffect(() => {
    if (loading || hasOnboarded === null) return;
    // For unauthenticated users, hasWizard doesn't matter — route to login.
    // For authenticated users, wait until hasWizard is determined.
    if (isAuthenticated && hasWizard === null) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inClientGroup = segments[0] === '(client-tabs)';
    const inTrainerGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && !inAuthGroup) {
      if (!hasOnboarded) {
        router.replace('/(auth)/onboarding');
      } else {
        router.replace('/(auth)/login');
      }
    } else if (isAuthenticated && inAuthGroup) {
      if (userRole === 'client') {
        router.replace('/(client-tabs)');
      } else if (!hasWizard) {
        // First-time trainer → send to wizard
        router.replace('/(auth)/trainer-wizard' as any);
      } else {
        router.replace('/(tabs)');
      }
    } else if (isAuthenticated && userRole === 'client' && inTrainerGroup) {
      router.replace('/(client-tabs)');
    } else if (isAuthenticated && userRole === 'trainer' && inClientGroup) {
      router.replace('/(tabs)');
    }

    // Hide splash after initial navigation (or if already on correct screen)
    if (!hasNavigated.current) {
      hasNavigated.current = true;
      // Small delay to let the target screen mount before hiding splash
      setTimeout(() => SplashScreen.hideAsync(), 150);
    }
  }, [isAuthenticated, loading, segments, userRole, hasOnboarded, hasWizard]);

  // Re-check wizard flag when auth state changes
  // Priority: 1) trainers table exists → returning coach, skip wizard
  //           2) user_metadata.wizard_complete → skip wizard
  //           3) SecureStore fallback
  useEffect(() => {
    if (isAuthenticated) {
      (async () => {
        try {
          // PRIORITY 1: Check if a trainer record exists in the database
          // This is the definitive source of truth — if the row exists, they're not new
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: trainerRow } = await supabase
              .from('trainers')
              .select('id')
              .eq('id', user.id)
              .maybeSingle();

            if (trainerRow) {
              // Returning coach — sync wizard flag everywhere and skip wizard
              await SecureStore.setItemAsync('fitlink_wizard_complete', 'true');
              if (!user.user_metadata?.wizard_complete) {
                await supabase.auth.updateUser({ data: { wizard_complete: true } });
              }
              setHasWizard(true);
              return;
            }
          }

          // PRIORITY 2: Check Supabase user_metadata (survives cache clears)
          const metaWizard = user?.user_metadata?.wizard_complete === true;
          if (metaWizard) {
            await SecureStore.setItemAsync('fitlink_wizard_complete', 'true');
            setHasWizard(true);
          } else {
            // PRIORITY 3: Fallback to SecureStore
            const val = await SecureStore.getItemAsync('fitlink_wizard_complete');
            setHasWizard(val === 'true');
          }
        } catch (err) {
          if (__DEV__) console.warn('Wizard check error:', err);
          // Fallback to SecureStore on error
          const val = await SecureStore.getItemAsync('fitlink_wizard_complete');
          setHasWizard(val === 'true');
        }
      })();
    }
  }, [isAuthenticated]);

  // Handle push token when authenticated
  useEffect(() => {
    if (isAuthenticated && registerForPushNotificationsAsync) {
      registerForPushNotificationsAsync().then(token => {
        if (token) updatePushToken(token);
      });
    }
  }, [isAuthenticated, updatePushToken]);

  // Keep splash visible — don't render Stack until we're ready to navigate
  if (loading || hasOnboarded === null || (isAuthenticated && hasWizard === null)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bgPrimary } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(client-tabs)" />
      <Stack.Screen name="client/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="add-client" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="create-plan" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="book-session" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
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
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Epilogue-Regular': require('../assets/fonts/Epilogue-Regular.ttf'),
    'Epilogue-Medium': require('../assets/fonts/Epilogue-Medium.ttf'),
    'Epilogue-SemiBold': require('../assets/fonts/Epilogue-SemiBold.ttf'),
    'Epilogue-Bold': require('../assets/fonts/Epilogue-Bold.ttf'),
    'Epilogue-ExtraBold': require('../assets/fonts/Epilogue-ExtraBold.ttf'),
  });

  // DON'T hide splash here — AuthGuard handles it after navigation
  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider
        publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_51Ta21qFfIwmgc6dvqTcBLdA9Tvxo9pvMXnC0KL5Gi4oNJ4wWAcwLolF2OnBefPxrAx6kJuU581bOWihpZThv13VA00lxaE9PFO"}
        merchantIdentifier="merchant.com.fitlink.app"
        urlScheme="fitlink"
      >
        <ThemeProvider>
          <AlertProvider>
            <AuthProvider>
              <AppProvider>
                <ClientProvider>
                  <HealthProvider>
                    <ThemedStatusBar />
                    <AuthGuard />
                  </HealthProvider>
                </ClientProvider>
              </AppProvider>
            </AuthProvider>
          </AlertProvider>
        </ThemeProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
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
