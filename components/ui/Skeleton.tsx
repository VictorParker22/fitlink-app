import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, ViewStyle } from 'react-native';
import { useReducedMotion } from '../../lib/useReducedMotion';

const SCREEN_W = Dimensions.get('window').width;

interface SkeletonProps {
  /** Width of the skeleton element */
  width?: number | string;
  /** Height of the skeleton element */
  height?: number;
  /** Border radius (default 8) */
  borderRadius?: number;
  /** Additional styles */
  style?: ViewStyle;
}

/**
 * Animated skeleton placeholder with a subtle shimmer effect.
 * Use while data is loading to prevent layout shift.
 *
 * Usage:
 *   <Skeleton width={200} height={16} />
 *   <Skeleton width="100%" height={200} borderRadius={16} />
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Reduce Motion: hold a steady mid-tone instead of looping the shimmer.
    if (reduceMotion) {
      shimmer.setValue(0.5);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer, reduceMotion]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.18],
  });

  return (
    <Animated.View
      accessible={false}
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: '#FFFFFF',
          opacity,
        },
        style,
      ]}
    />
  );
}

// ─── PRE-BUILT SKELETON LAYOUTS ──────────────────────────

/** Skeleton for a class/article card (thumbnail + 2 lines of text) */
export function CardSkeleton({ style }: { style?: ViewStyle }) {
  return (
    <View style={[sk.card, style]} accessible={false}>
      <Skeleton width={100} height={100} borderRadius={12} />
      <View style={sk.cardMeta}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width="30%" height={10} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

/** Skeleton for a horizontal scrolling row of items */
export function HorizontalRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={sk.hRow} accessible={false}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={sk.hCard}>
          <Skeleton width={140} height={180} borderRadius={12} />
          <Skeleton width={100} height={12} style={{ marginTop: 8 }} />
          <Skeleton width={70} height={10} style={{ marginTop: 4 }} />
        </View>
      ))}
    </View>
  );
}

/** Skeleton for a full-screen detail page (hero + title + paragraphs) */
export function DetailSkeleton() {
  return (
    <View style={sk.detail} accessible={false}>
      <Skeleton width="100%" height={280} borderRadius={0} />
      <View style={sk.detailBody}>
        <Skeleton width="80%" height={22} style={{ marginTop: 20 }} />
        <Skeleton width="40%" height={14} style={{ marginTop: 12 }} />
        <View style={sk.divider} />
        <Skeleton width="100%" height={12} style={{ marginTop: 16 }} />
        <Skeleton width="100%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width="60%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width="100%" height={12} style={{ marginTop: 16 }} />
        <Skeleton width="90%" height={12} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

/** Skeleton for a list of card items */
export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={sk.list} accessible={false}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} style={i > 0 ? { marginTop: 16 } : undefined} />
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  cardMeta: {
    flex: 1,
    marginLeft: 14,
  },
  hRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 14,
  },
  hCard: {
    width: 140,
  },
  detail: {
    flex: 1,
  },
  detailBody: {
    paddingHorizontal: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 20,
  },
  list: {
    paddingVertical: 8,
  },
});
