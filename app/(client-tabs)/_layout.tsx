import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ClientProvider } from '../../context/ClientContext';
import { Colors, FontFamily, FontSize } from '../../constants/theme';

export default function ClientTabsLayout() {
  return (
    <ClientProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.bgSecondary,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
            height: 80,
            paddingTop: 8,
            paddingBottom: 22,
          },
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textTertiary,
          tabBarLabelStyle: { fontFamily: FontFamily.bodyMedium, fontSize: 10, marginTop: 2 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="workouts"
          options={{ title: 'Workouts', tabBarIcon: ({ color, size }) => <Ionicons name="barbell" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="my-messages"
          options={{ title: 'Messages', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="my-profile"
          options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }}
        />
      </Tabs>
    </ClientProvider>
  );
}
