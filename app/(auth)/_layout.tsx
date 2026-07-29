import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      initialRouteName="login"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFBFC' } }}
    >
      <Stack.Screen name="login" options={{ contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="onboarding" options={{ animation: 'none', contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="create-account" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#000' }, headerShown: false }} />
      <Stack.Screen name="coach-signup" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="client-signup" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="trainer-wizard" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
      <Stack.Screen name="client-onboarding" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#000' }, gestureEnabled: false }} />
      <Stack.Screen name="client-login" options={{ contentStyle: { backgroundColor: '#000' } }} />
    </Stack>
  );
}
