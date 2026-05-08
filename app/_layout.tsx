import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppProvider } from '../context/AppContext';
import { Colors } from '../constants/theme';

// Keep splash visible until we know exactly where to go
SplashScreen.preventAutoHideAsync();

function AuthGuard() {
  const { isAuthenticated, loading, userRole } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const hasNavigated = useRef(false);

  // Check onboarding flag once on mount
  useEffect(() => {
    SecureStore.getItemAsync('fitlink_onboarded').then((value) => {
      setHasOnboarded(value === 'true');
    });
  }, []);

  useEffect(() => {
    if (loading || hasOnboarded === null) return;

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
  }, [isAuthenticated, loading, segments, userRole, hasOnboarded]);

  // Keep splash visible — don't render Stack until we're ready to navigate
  if (loading || hasOnboarded === null) {
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
    <AuthProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <AuthGuard />
      </AppProvider>
    </AuthProvider>
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
