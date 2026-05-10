import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppProvider, useApp } from '../context/AppContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from '../utils/registerForPushNotificationsAsync';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
      setHasWizard(wizard === 'true');
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      // Handle foreground push notification if needed
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      // Handle interaction
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  useEffect(() => {
    if (loading || hasOnboarded === null || hasWizard === null) return;

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

  // Re-check wizard flag when auth state changes (e.g. after wizard completes)
  useEffect(() => {
    if (isAuthenticated) {
      SecureStore.getItemAsync('fitlink_wizard_complete').then(val => setHasWizard(val === 'true'));
    }
  }, [isAuthenticated]);

  // Handle push token when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotificationsAsync().then(token => {
        if (token) updatePushToken(token);
      });
    }
  }, [isAuthenticated, updatePushToken]);

  // Keep splash visible — don't render Stack until we're ready to navigate
  if (loading || hasOnboarded === null || hasWizard === null) {
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
      <ThemeProvider>
        <AuthProvider>
          <AppProvider>
            <ThemedStatusBar />
            <AuthGuard />
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
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
