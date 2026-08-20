import React, { useEffect, useRef, useCallback } from 'react';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { playChime } from '../../lib/sounds';
import { useReducedMotion } from '../../lib/useReducedMotion';
import ConfettiBurst from './ConfettiBurst';

/**
 * Shown once, right after a coach publishes a pass — a lime confetti burst
 * over a spring-in "It's live" card. Kept in the coach design language: one
 * accent, no emoji, and copy that states what actually happened (how many
 * athletes were told, where the pass lives now).
 *
 * Rendered as an absolutely-positioned overlay inside the screen — NOT a
 * native Modal — so dismissing and navigating can never wedge each other.
 *
 * Reduce Motion: no confetti, card appears without the spring.
 */

export default function PassPublishedOverlay({
  planName,
  offersSent,
  onDone,
}: {
  planName: string;
  offersSent: number;
  onDone: () => void;
}) {
  // absoluteFill View, not a native Modal — Android back would otherwise pop
  // the screen underneath while this was still covering it.
  useAndroidBack(useCallback(() => { onDone(); return true; }, [onDone]));

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
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, s.root]} pointerEvents="auto">
      {!reduced && <ConfettiBurst />}

      {/* Card */}
      <Animated.View style={[s.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
        <View style={s.checkCircle}>
          <Ionicons name="checkmark" size={34} color={CoachColors.onAccent} />
        </View>
        <Text style={s.eyebrow}>It's live</Text>
        <Text style={s.planName} numberOfLines={2}>{planName}</Text>
        <Text style={s.sub}>
          {offersSent > 0
            ? `${offersSent} athlete${offersSent === 1 ? '' : 's'} just got a message from you — watch your inbox for replies.`
            : 'Athletes can take it from your Passes tab whenever you offer it.'}
        </Text>
        <TouchableOpacity style={s.doneBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
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
  card: {
    alignItems: 'center',
    width: '100%',
  },
  checkCircle: {
    width: 68, height: 68, borderRadius: 34, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 22,
  },
  eyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.accent,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8,
  },
  planName: {
    fontFamily: CoachFonts.headingBold, fontSize: 29, color: CoachColors.textPrimary,
    textAlign: 'center', lineHeight: 36,
  },
  sub: {
    fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textSecondary,
    textAlign: 'center', lineHeight: 23.5, marginTop: 12,
  },
  doneBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 15, paddingHorizontal: 48, marginTop: 28,
  },
  doneBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },
});
