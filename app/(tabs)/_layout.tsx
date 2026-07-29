import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { FontFamily } from '../../constants/theme';

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom > 0 ? insets.bottom : 8;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? '#FFFFFF' : colors.textPrimary,
        tabBarInactiveTintColor: isDark ? '#707070' : colors.textTertiary,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: FontFamily.bodyMedium,
          fontSize: 10,
          marginTop: 2,
          marginBottom: 4,
        },
        tabBarStyle: {
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 56 + bottomPadding,
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: isDark ? '#1C1C1E' : '#E5E7EB',
          paddingBottom: bottomPadding,
          paddingTop: 6,
          paddingHorizontal: 8,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarAccessibilityLabel: 'Dashboard tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarAccessibilityLabel: 'Clients tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: 'Library',
          tabBarAccessibilityLabel: 'Library tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'barbell' : 'barbell-outline'} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: 'Studio',
          tabBarAccessibilityLabel: 'Studio tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'radio' : 'radio-outline'} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarAccessibilityLabel: 'Messages tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="diets"
        options={{
          title: 'Diets',
          tabBarAccessibilityLabel: 'Diets tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'nutrition' : 'nutrition-outline'} size={20} color={color} />
          ),
        }}
      />
      {/* Hidden from tab bar, accessible via navigation */}
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
    </Tabs>
  );
}
