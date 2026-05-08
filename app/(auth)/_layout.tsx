import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      initialRouteName="login"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#111114' } }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="onboarding" options={{ animation: 'none' }} />
      <Stack.Screen name="client-login" />
    </Stack>
  );
}
