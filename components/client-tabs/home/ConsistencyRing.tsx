import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily } from '../../../constants/theme';
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
          <Text style={st.micro}>THIS WEEK</Text>
          <Text style={st.hero}>
            {doneThisWeek}
            <Text style={st.heroUnit}>/{totalScheduled}</Text>
          </Text>
          <Text style={st.context}>
            {doneThisWeek === 0
              ? 'Start today'
              : isGreatWeek
                ? 'Perfect week 🏆'
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

            let bg     = '#111113'; // §11 Layer 2 surface tint
            let border = '#1C1C1E';

            if (isDone) {
              bg     = '#051a0a';   // §3 green at 5% opacity
              border = '#22C55E';
            } else if (isRest) {
              bg     = '#0a0f1a';
              border = '#5B7FFF';
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
                  <Ionicons name="checkmark" size={11} color="#22C55E" />
                ) : isRest ? (
                  <Ionicons name="moon" size={9} color="#5B7FFF" />
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

      {/* §11 Accent line at bottom — client blue = progress category */}
      <View style={st.accentLine} />
    </View>
  );
}

const st = StyleSheet.create({
  // §2 Surface: Layer 1 (#0C0C0E) + 1px #1C1C1E border
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  // §1 Hero number: 48px, tight tracked
  hero: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 48,
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 50,
  },
  heroUnit: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0,
  },
  context: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
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
  // Today: white ring instead of filled
  todayRing: {
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dayLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
  },
  todayLabel: {
    color: '#FFFFFF',
  },

  // §11 Accent line — client blue = progress
  accentLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#5B7FFF',
  },
});
