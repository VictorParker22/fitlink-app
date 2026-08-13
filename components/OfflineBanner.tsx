/**
 * Offline pill — slides in under the safe area when NetInfo reports no
 * connection, out when it comes back. Deliberately calm: cached data is still
 * real data, so this is informational (surface/borderMuted/textSecondary),
 * not an alarm. Mounted once in app/_layout.tsx so it covers both the coach
 * and athlete sides.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../context/NetworkContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const SLIDE_DISTANCE = 72;

export default function OfflineBanner() {
  const { isConnected } = useNetwork();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const slide = useRef(new Animated.Value(-SLIDE_DISTANCE)).current;

  useEffect(() => {
    if (!isConnected) {
      setMounted(true);
      Animated.spring(slide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 70,
        friction: 11,
      }).start();
    } else if (mounted) {
      Animated.timing(slide, {
        toValue: -SLIDE_DISTANCE,
        duration: 260,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [isConnected, mounted, slide]);

  if (!mounted) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <Animated.View style={[styles.pill, { transform: [{ translateY: slide }] }]}>
        <Ionicons name="cloud-offline-outline" size={13} color={CoachColors.textSecondary} />
        <Text style={styles.text}>Offline — showing saved data</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9998,
    elevation: 9998,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11.5,
    color: CoachColors.textSecondary,
  },
});
