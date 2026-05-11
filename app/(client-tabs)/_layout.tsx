import { Tabs } from 'expo-router';
import { View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClientProvider } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import { FontFamily } from '../../constants/theme';

export default function ClientTabsLayout() {
  const { colors, isDark } = useTheme();

  return (
    <ClientProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarShowLabel: false,
          tabBarStyle: {
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            height: Platform.OS === 'ios' ? 88 : 72,
            backgroundColor: colors.tabBarBg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTopWidth: isDark ? 1 : 0,
            borderTopColor: colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: isDark ? 0.3 : 0.08,
            shadowRadius: 16,
            elevation: 12,
            paddingBottom: Platform.OS === 'ios' ? 24 : 8,
            paddingTop: 6,
            paddingHorizontal: 8,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 4 }}>
                <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="workouts"
          options={{
            title: 'Workouts',
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 4 }}>
                <Ionicons name={focused ? 'barbell' : 'barbell-outline'} size={22} color={color} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="my-diet"
          options={{
            title: 'Diet',
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 4 }}>
                <Ionicons name={focused ? 'nutrition' : 'nutrition-outline'} size={22} color={color} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="my-messages"
          options={{
            title: 'Messages',
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 4 }}>
                <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={22} color={color} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="my-profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 4 }}>
                <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />}
              </View>
            ),
          }}
        />
        {/* Progress hidden from tab bar — accessible via Home screen */}
        <Tabs.Screen name="my-progress" options={{ href: null }} />
      </Tabs>
    </ClientProvider>
  );
}
