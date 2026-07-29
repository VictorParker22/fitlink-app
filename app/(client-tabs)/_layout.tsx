import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { FontFamily } from '../../constants/theme';
import WorkoutMiniPlayer from '../../components/WorkoutMiniPlayer';
import OfflineBanner from '../../components/OfflineBanner';

// Only these 5 route names get a button in the tab bar
const VISIBLE_TABS = ['index', 'studio', 'my-progress', 'my-pass', 'my-profile'];

export default function ClientTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <>
      <OfflineBanner />
      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: FontFamily.body,
          fontSize: 10,
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
      tabBar={(props) => <ClientTabBar {...props} bottomInset={insets.bottom} />}
    >
      {/* ── 5 VISIBLE TABS ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: 'Studio',
          tabBarAccessibilityLabel: 'Studio tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'radio' : 'radio-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-progress"
        options={{
          title: 'Activity',
          tabBarAccessibilityLabel: 'Activity tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-pass"
        options={{
          title: 'Pass',
          tabBarAccessibilityLabel: 'Pass tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'ticket' : 'ticket-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
          ),
        }}
      />

      {/* ── HIDDEN SCREENS (accessible via navigation, not tab bar) ── */}
      <Tabs.Screen name="workouts" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="my-diet" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="health-insights" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="my-messages" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="my-subscription" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="connected-tech" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="explore-classes" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="class-detail" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="class-player" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="collections" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="collection-detail" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="articles" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="article-detail" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="programs" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="program-detail" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="strength-session" options={{ tabBarButton: () => null }} />
    </Tabs>
    </>
  );
}

/**
 * Fully custom tab bar — does NOT use BottomTabBar from @react-navigation.
 * Renders only the 5 visible tabs, the WorkoutMiniPlayer, and handles
 * Android edge-to-edge safe area insets.
 */
function ClientTabBar({ state, descriptors, navigation, bottomInset }: BottomTabBarProps & { bottomInset: number }) {
  const paddingBottom = bottomInset > 0 ? bottomInset : (Platform.OS === 'android' ? 16 : 8);

  // Pick only the routes that should be visible
  const visibleRoutes = state.routes.filter((r) => VISIBLE_TABS.includes(r.name));

  return (
    <View style={styles.wrapper}>
      <WorkoutMiniPlayer />
      <View style={[styles.bar, { paddingBottom }]}>
        {visibleRoutes.map((route) => {
          const descriptor = descriptors[route.key];
          if (!descriptor) return null;

          const { options } = descriptor;
          const isFocused = state.routes[state.index]?.key === route.key;
          const color = isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.4)';
          const label = options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              activeOpacity={0.7}
              style={styles.tab}
            >
              {options.tabBarIcon?.({ color, focused: isFocused, size: 24 })}
              <Text style={[styles.label, { color }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#000000',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  label: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    marginTop: 2,
  },
});
