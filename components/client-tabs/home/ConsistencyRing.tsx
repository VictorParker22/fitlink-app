import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

interface ConsistencyRingProps {
  completedDays?: number[]; // e.g. [0, 1, 3] for Mon, Tue, Thu
  restDays?: number[];      // e.g. [2, 6] for Wed, Sun
  nextWorkoutTitle?: string;
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function ConsistencyRing({
  completedDays = [],
  restDays = [],
  nextWorkoutTitle,
}: ConsistencyRingProps) {
  const todayIdx = (new Date().getDay() + 6) % 7; // Monday = 0

  // Reduce Motion — stop the today-marker pulse when the user has motion sensitivity
  const reduced = useReducedMotion();

  // §15 "Alive" test — today's marker pulses
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  // §1 Hero stat — completedDays.length is the number, not a label
  const doneThisWeek = completedDays.length;
  const totalScheduled = 5; // sensible default
  const isGreatWeek = doneThisWeek >= totalScheduled;

  return (
    <View style={st.container}>
      {/* §1 Editorial hierarchy: micro → hero → context */}
      <View style={st.topRow}>
        {/* Left: hero number */}
        <View style={st.heroBlock}>
          <Text style={st.micro}>This week</Text>
          <Text style={st.hero}>
            {doneThisWeek}
            <Text style={st.heroUnit}>/{totalScheduled}</Text>
          </Text>
          <Text style={st.context}>
            {doneThisWeek === 0
              ? 'Start today'
              : isGreatWeek
                ? 'Perfect week'
                : nextWorkoutTitle
                  ? `Next: ${nextWorkoutTitle}`
                  : `${totalScheduled - doneThisWeek} left`}
          </Text>
        </View>

        {/* Right: 7-day squares */}
        <View style={st.daysRow}>
          {DAYS.map((dayLabel, idx) => {
            const isDone    = completedDays.includes(idx);
            const isRest    = restDays.includes(idx);
            const isToday   = idx === todayIdx;
            const isFuture  = idx > todayIdx && !isDone && !isRest;

            let bg     = CoachColors.bg;
            let border = CoachColors.borderMuted;

            if (isDone) {
              bg     = CoachColors.accentSofter;
              border = CoachColors.accent;
            } else if (isRest) {
              bg     = CoachColors.surface;
              border = CoachColors.border;
            }

            const square = (
              <View
                style={[
                  st.daySquare,
                  { backgroundColor: bg, borderColor: border },
                  isToday && !isDone && st.todayRing,
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={11} color={CoachColors.accent} />
                ) : isRest ? (
                  <Ionicons name="moon" size={9} color={CoachColors.textMuted} />
                ) : isFuture ? null : (
                  <View style={st.emptyDot} />
                )}
              </View>
            );

            return (
              <View key={idx} style={st.dayCol}>
                {/* §15 Pulse the today marker */}
                {isToday && !isDone ? (
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    {square}
                  </Animated.View>
                ) : square}
                <Text style={[st.dayLabel, isToday && st.todayLabel]}>
                  {dayLabel}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* §11 Accent line at bottom */}
      <View style={st.accentLine} />
    </View>
  );
}

const st = StyleSheet.create({
  // §2 Surface: card surface + 1px border
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: 18,
    paddingBottom: 14,
    overflow: 'hidden',
  },

  // §1 Top row: hero stat left, day squares right (asymmetric = not AI)
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  // §1 Hero block: micro → big number → context
  heroBlock: {
    gap: 2,
    minWidth: 60,
  },
  micro: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  // §1 Hero number: 48px, tight tracked
  hero: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 48,
    color: CoachColors.textPrimary,
    letterSpacing: -2,
    lineHeight: 50,
  },
  heroUnit: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textMuted,
    letterSpacing: 0,
  },
  context: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 11,
    color: CoachColors.textMuted,
    marginTop: 4,
  },

  // Day squares grid
  daysRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: 5,
  },
  // §14 Touch target 36×36 — not interactive, display only. Fine.
  daySquare: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  // Today: bright ring instead of filled
  todayRing: {
    borderColor: CoachColors.textPrimary,
    borderWidth: 1.5,
    backgroundColor: CoachColors.surfaceRaised,
  },
  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoachColors.textFaint,
  },
  dayLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.textFaint,
  },
  todayLabel: {
    color: CoachColors.textPrimary,
  },

  // §11 Accent line — progress
  accentLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: CoachColors.accent,
  },
});
