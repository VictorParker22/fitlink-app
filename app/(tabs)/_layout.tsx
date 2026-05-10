import { Tabs } from 'expo-router';
import { View, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { FontFamily, Radius } from '../../constants/theme';

function CenterFAB() {
  const { colors } = useTheme();
  return (
    <View style={{
      width: 56, height: 56, borderRadius: 16,
      backgroundColor: colors.accent,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 28,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    }}>
      <Ionicons name="barbell" size={26} color="#FFFFFF" />
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
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
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 4 }}>
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
              {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 4 }}>
              <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
              {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: 'Programs',
          tabBarIcon: () => <CenterFAB />,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              activeOpacity={1}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
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
        name="diets"
        options={{
          title: 'Diets',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 4 }}>
              <Ionicons name={focused ? 'nutrition' : 'nutrition-outline'} size={22} color={color} />
              {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />}
            </View>
          ),
        }}
      />
      {/* Hidden from tab bar, accessible via navigation */}
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
    </Tabs>
  );
}
