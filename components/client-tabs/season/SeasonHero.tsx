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
 *
 * COHORTS (lib/cohort.ts): when the enrolled plan has a real starts_on, the
 * pass runs on a calendar, so two honest additions appear — the run line
 * ("Sep 8 – Sep 29") under the pass name, and, before it begins, a pre-start
 * eyebrow ("Starts Tuesday · 3 days to go") in place of "week 1 of 8". An
 * evergreen pass has neither, and renders exactly as before.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { isCohort, formatRun, type CohortFields } from '../../../lib/cohort';
import { preStartLine } from '../../../lib/cohortPreStart';

const C = CoachColors;
const F = CoachFonts;

type Props = {
  planName: string;
  description?: string | null;
  /** The enrolled plan — only read for its cohort fields (starts_on et al). */
  plan?: CohortFields | null;
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
  plan,
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

  // Cohort extras — real dates only, nothing for evergreen passes.
  const cohort = isCohort(plan);
  const runLine = cohort ? formatRun(plan) : null;
  const preStart = cohort && !completed ? preStartLine(plan) : null;

  const eyebrow = completed
    ? 'Your season · finished'
    : preStart
      ? preStart
      : `Your season · week ${currentWeek} of ${totalWeeks}`;

  return (
    <View
      accessible={true}
      accessibilityLabel={
        completed
          ? `${planName}, season finished. All ${trackLength} steps done.`
          : preStart
            ? `${planName}. ${preStart}.${runLine ? ` Runs ${runLine}.` : ''}`
            : `${planName}, week ${currentWeek} of ${totalWeeks}. ${position} of ${trackLength} steps done.${runLine ? ` Runs ${runLine}.` : ''}`
      }
    >
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={s.title}>{planName}</Text>
      {runLine ? <Text style={s.runLine}>{runLine}</Text> : null}
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
    fontSize: 12.5,
    color: C.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: F.headingBold,
    fontSize: 31.5,
    lineHeight: 37,
    color: C.textPrimary,
    marginTop: 8,
  },
  // Cohort run — the real calendar window, under the pass name.
  runLine: {
    fontFamily: F.bodyMedium,
    fontSize: 14,
    color: C.textMuted,
    marginTop: 5,
  },
  description: {
    fontFamily: F.body,
    fontSize: 14.5,
    color: C.textSecondary,
    lineHeight: 21.5,
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
    fontSize: 12.5,
    color: C.textFaint,
    marginTop: 6,
  },
});
