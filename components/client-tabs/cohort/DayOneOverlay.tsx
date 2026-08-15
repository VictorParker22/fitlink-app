/**
 * DayOneOverlay — the one-time launch moment when a cohort's real start date
 * arrives.
 *
 * The waiting room has been counting down to a date the coach set; when that
 * date lands, the athlete should be told, once, before the season appears.
 * Same pattern as components/coach/PassPublishedOverlay: an absolutely
 * positioned overlay INSIDE the screen, never a native Modal, so dismissing
 * and navigating can never wedge each other.
 *
 * The caller owns the "exactly once" logic (an AsyncStorage flag keyed by
 * enrollment id in the Train tab) and the gate that this is a cohort at all —
 * an evergreen pass has no day one and never renders this.
 *
 * Reduce Motion: no confetti, card appears without the spring. The chime
 * respects the global sound switch inside lib/sounds.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { playChime } from '../../../lib/sounds';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import ConfettiBurst from '../../coach/ConfettiBurst';

const C = CoachColors;
const F = CoachFonts;

export default function DayOneOverlay({
  planName,
  firstSessionName,
  onStart,
}: {
  planName: string;
  /** The season's first session, resolved from the real track. Null ⇒ omitted. */
  firstSessionName: string | null;
  onStart: () => void;
}) {
  const reduced = useReducedMotion();
  const cardScale = useRef(new Animated.Value(0.82)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playChime();
    if (reduced) {
      cardScale.setValue(1);
      cardOpacity.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 9 }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={[StyleSheet.absoluteFill, s.root]}
      pointerEvents="auto"
      accessible={false}
      accessibilityViewIsModal={true}
    >
      {!reduced && <ConfettiBurst />}

      <Animated.View style={[s.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
        <View
          accessible={true}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Day one. ${planName} starts today.${firstSessionName ? ` First session: ${firstSessionName}.` : ''}`}
        >
          <Text style={s.eyebrow}>Day one</Text>
          <Text style={s.title} numberOfLines={3}>
            {planName} starts today.
          </Text>
          {firstSessionName ? (
            <Text style={s.sub} numberOfLines={2}>
              First up: {firstSessionName}
            </Text>
          ) : null}
        </View>

        <Pressable
          style={s.cta}
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel="Start week 1"
          accessibilityHint={
            firstSessionName
              ? `Opens the preview for ${firstSessionName}. Nothing starts until you tap start there`
              : 'Opens your season'
          }
        >
          <Text style={s.ctaText}>Start week 1</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    backgroundColor: 'rgba(16,18,16,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 100,
    paddingHorizontal: 32,
  },
  card: { alignItems: 'center', width: '100%' },
  eyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 12,
    color: C.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontFamily: F.headingBold,
    fontSize: 26,
    lineHeight: 32,
    color: C.textPrimary,
    textAlign: 'center',
  },
  sub: {
    fontFamily: F.body,
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 12,
  },
  cta: {
    backgroundColor: C.accent,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 44,
    marginTop: 28,
  },
  ctaText: { fontFamily: F.bodyBold, fontSize: 15, color: C.onAccent },
});
