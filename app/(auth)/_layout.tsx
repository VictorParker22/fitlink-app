import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';

export default function AuthLayout() {
  // The editorial faces are loaded HERE, not at the root: a returning coach
  // never enters this group and should not pay for six font files on every
  // cold start (roast 2026-09-04, phase 3). A failed load falls through to
  // the system face rather than blocking the group.
  const [fontsReady, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  if (!fontsReady && !fontError) return <View style={{ flex: 1, backgroundColor: '#101210' }} />;
  return (
    <Stack
      initialRouteName="welcome"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}
    >
      <Stack.Screen name="welcome" options={{ animation: 'none', contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="login" options={{ animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#000' } }} />
      {/* Editorial onboarding (FitLink Arrival): role → intake → account. */}
      <Stack.Screen name="role" options={{ animation: 'fade', contentStyle: { backgroundColor: '#101210' } }} />
      <Stack.Screen name="intake" options={{ animation: 'fade', contentStyle: { backgroundColor: '#101210' } }} />
      <Stack.Screen name="coach-intake" options={{ animation: 'fade', contentStyle: { backgroundColor: '#101210' } }} />
      <Stack.Screen name="account" options={{ animation: 'fade', contentStyle: { backgroundColor: '#101210' } }} />
      <Stack.Screen name="onboarding" options={{ animation: 'none', contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="create-account" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#000' }, headerShown: false }} />
      <Stack.Screen name="coach-signup" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="client-signup" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="trainer-wizard" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
      <Stack.Screen name="client-onboarding" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#000' }, gestureEnabled: false }} />
      <Stack.Screen name="athlete-permissions" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="client-login" options={{ contentStyle: { backgroundColor: '#000' } }} />
    </Stack>
  );
}
