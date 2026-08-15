/**
 * SeasonHero — the headline of the Train tab when the athlete owns a pass.
 *
 * Pass name as the headline, a real "Week N of M" eyebrow (same week math as
 * every other surface — lib/passWeeks.ts upstream), the plan's own
 * description when the coach wrote one, and a thin accent progress bar over
 * the true track position. No invented stats; the energy is typographic.
 *
 * The bar animates to its value on mount unless Reduce Motion is on, in
 * which case it renders at the final width immediately.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

const C = CoachColors;
const F = CoachFonts;

type Props = {
  planName: string;
  description?: string | null;
  currentWeek: number;
  totalWeeks: number;
  /** Nodes completed (enrollment.track_position, clamped upstream). */
  position: number;
  trackLength: number;
  completed: boolean;
  reducedMotion: boolean;
};

export default function SeasonHero({
  planName,
  description,
  currentWeek,
  totalWeeks,
  position,
  trackLength,
  completed,
  reducedMotion,
}: Props) {
  const fraction = trackLength > 0 ? Math.min(position / trackLength, 1) : 0;
  const progress = useSharedValue(reducedMotion ? fraction : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = fraction;
    } else {
      progress.value = withTiming(fraction, { duration: 700, easing: Easing.out(Easing.cubic) });
    }
  }, [fraction, reducedMotion, progress]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const eyebrow = completed
    ? 'Your season · finished'
    : `Your season · week ${currentWeek} of ${totalWeeks}`;

  return (
    <View
      accessible={true}
      accessibilityLabel={
        completed
          ? `${planName}, season finished. All ${trackLength} steps done.`
          : `${planName}, week ${currentWeek} of ${totalWeeks}. ${position} of ${trackLength} steps done.`
      }
    >
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={s.title}>{planName}</Text>
      {description ? (
        <Text style={s.description} numberOfLines={2}>
          {description}
        </Text>
      ) : null}
      <View style={s.barTrack}>
        <Animated.View style={[s.barFill, barStyle]} />
      </View>
      <Text style={s.barCaption}>
        {position} of {trackLength} done
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  eyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: F.headingBold,
    fontSize: 28,
    lineHeight: 33,
    color: C.textPrimary,
    marginTop: 8,
  },
  description: {
    fontFamily: F.body,
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
    marginTop: 6,
  },
  barTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: C.borderMuted,
    marginTop: 16,
    overflow: 'hidden',
  },
  barFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  barCaption: {
    fontFamily: F.bodyMedium,
    fontSize: 11,
    color: C.textFaint,
    marginTop: 6,
  },
});
