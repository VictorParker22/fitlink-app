import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      initialRouteName="login"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFBFC' } }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="onboarding" options={{ animation: 'none' }} />
      <Stack.Screen name="trainer-wizard" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
      <Stack.Screen name="client-login" />
    </Stack>
  );
}
