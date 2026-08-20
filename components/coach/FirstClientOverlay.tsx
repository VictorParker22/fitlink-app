import React, { useEffect, useRef, useCallback } from 'react';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { playChime } from '../../lib/sounds';
import { useReducedMotion } from '../../lib/useReducedMotion';
import ConfettiBurst from './ConfettiBurst';
import { Bolt } from '../mascot/Bolt';

/**
 * One-time celebration when a coach's very first athlete lands on the
 * roster. Same overlay pattern as PassPublishedOverlay: absolutely
 * positioned (never a native Modal), lime confetti, chime, spring-in card.
 *
 * The caller owns the "only once" logic (AsyncStorage flag on the
 * dashboard). Reduce Motion: no confetti, card appears without the spring.
 */

export default function FirstClientOverlay({
  clientName,
  onDone,
}: {
  clientName: string;
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

      <Animated.View style={[s.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
        <View style={s.mascotWrap}>
          <Bolt pose="Celebrate" size={88} color={CoachColors.accent} />
        </View>
        <Text style={s.eyebrow}>First athlete in</Text>
        <Text style={s.name} numberOfLines={2}>{clientName}</Text>
        <Text style={s.sub}>
          Your roster is live. Their sessions, check-ins and progress start
          landing on your dashboard from here.
        </Text>
        <TouchableOpacity
          style={s.doneBtn}
          onPress={onDone}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Dismiss celebration"
        >
          <Text style={s.doneBtnText}>Let's go</Text>
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
  mascotWrap: {
    width: 104, height: 104, borderRadius: 52, borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1, borderColor: CoachColors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  eyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.accent,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8,
  },
  name: {
    fontFamily: CoachFonts.headingBold, fontSize: 29, color: CoachColors.textPrimary,
    textAlign: 'center', lineHeight: 36,
  },
  sub: {
    fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textSecondary,
    textAlign: 'center', lineHeight: 23.5, marginTop: 12, maxWidth: 300,
  },
  doneBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 15, paddingHorizontal: 48, marginTop: 28,
  },
  doneBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },
});
