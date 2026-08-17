/**
 * HydrationCell — Daily Water Intake Tracker
 *
 * This widget replaces the redundant GYM cell that lived in the stat grid.
 * The full GymCheckInWidget (timer, Spotify, summary) now appears directly
 * below TodayWorkoutCard where the context is right.
 *
 * Design decisions:
 * - Tap to add 8oz instantly (1 glass — zero friction, ≤1 tap rule)
 * - Hero number = oz consumed today
 * - Progress micro-bar under hero = visual % of goal
 * - Accent line ramps up in intensity as the goal approaches
 * - Data stored in AsyncStorage with daily reset (date key)
 * - No backend dependency — this is a personal glanceable widget
 *
 * HIG §17 compliance:
 * - All informational text ≥ 11pt
 * - 44pt minimum touch target (cell is 130pt tall)
 * - accessibilityLabel + accessibilityHint
 * - 9px "Hydration" label is decorative — "48 oz" (52pt) is primary info carrier
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAILY_GOAL_OZ  = 96;   // 2.8L — standard 8×8 guideline for active adults
const INCREMENT_OZ   = 8;    // One glass / one cup — the most common "one sip" unit
const STORAGE_PREFIX = 'fitlink_hydration_';

function getTodayKey(): string {
  return STORAGE_PREFIX + new Date().toDateString();
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface HydrationCellProps {
  style?: any;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HydrationCell({ style }: HydrationCellProps) {
  const reduced = useReducedMotion();
  const [oz, setOz] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Flash animation — visual confirm when +8oz is tapped
  const flashAnim = useRef(new Animated.Value(1)).current;

  // Load today's intake on mount
  useEffect(() => {
    AsyncStorage.getItem(getTodayKey())
      .then(val => { if (val) setOz(parseInt(val, 10) || 0); })
      .catch(() => { /* nothing logged we can trust — stay at 0 */ });
    return () => clearTimeout(toastTimer.current);
  }, []);

  const progress    = Math.min(oz / DAILY_GOAL_OZ, 1);
  const isGoalMet   = oz >= DAILY_GOAL_OZ;
  const ozRemaining = Math.max(DAILY_GOAL_OZ - oz, 0);

  // Accent colour ramps up in intensity — full accent at 100%
  const accentColor = isGoalMet
    ? CoachColors.accent
    : progress >= 0.66
      ? 'rgba(198,242,78,0.7)'
      : progress >= 0.33
        ? 'rgba(198,242,78,0.45)'
        : CoachColors.borderMuted; // neutral below 33%

  const handleAdd = useCallback(async () => {
    // Instant haptic feedback — feels like a satisfying physical action
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const next = oz + INCREMENT_OZ;
    setOz(next);

    // The store write can reject. If it does, the number on screen would be a
    // figure that survives nothing — roll it back and say so.
    try {
      await AsyncStorage.setItem(getTodayKey(), String(next));
    } catch {
      setOz(oz);
      clearTimeout(toastTimer.current);
      setToastMsg("Couldn't save that glass");
      toastTimer.current = setTimeout(() => setToastMsg(''), 1800);
      return;
    }

    // Show inline feedback toast
    const remaining = Math.max(DAILY_GOAL_OZ - next, 0);
    const msg = isGoalMet || next >= DAILY_GOAL_OZ
      ? 'Daily goal reached'
      : `+8oz logged · ${remaining}oz to go`;
    clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(''), 1800);

    // Hero number flash — confirms the log registered
    if (!reduced) {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.5, duration: 70, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 1,   duration: 200, useNativeDriver: true }),
      ]).start();
    }

    // Success haptic when goal is first reached
    if (!isGoalMet && next >= DAILY_GOAL_OZ) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [oz, flashAnim, isGoalMet, reduced]);

  return (
    <TouchableOpacity
      style={[st.cell, style]}
      onPress={handleAdd}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Hydration: ${oz} of ${DAILY_GOAL_OZ} ounces logged today`}
      accessibilityHint="Tap to log one glass of water (8 oz)"
    >
      {/* 9px — decorative; "48 oz" (52pt) is the primary info carrier */}
      <Text style={st.micro}>Hydration</Text>

      {/* Hero number — flashes on tap for instant feedback */}
      <Animated.Text style={[st.hero, { opacity: flashAnim, color: isGoalMet ? CoachColors.accent : CoachColors.textPrimary }]}>
        {oz}<Text style={st.unit}> oz</Text>
      </Animated.Text>

      {/* Progress micro-bar — visual at-a-glance completion */}
      <View style={st.bar}>
        <View
          style={[
            st.barFill,
            { width: `${Math.round(progress * 100)}%`, backgroundColor: accentColor },
          ]}
        />
      </View>

      {/* Sub label — 11pt minimum (sole info carrier for remaining amount) */}
      {toastMsg ? (
        <Text style={st.toast} accessibilityLiveRegion="polite">{toastMsg}</Text>
      ) : (
        <Text style={st.sub}>
          {isGoalMet
            ? 'Daily goal hit'
            : `${ozRemaining}oz left · tap +8oz`}
        </Text>
      )}

      {/* Bottom accent line — colour = progress state */}
      <View style={[st.accentLine, { backgroundColor: accentColor }]} />
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  // Today card system: surface / borderMuted / radius 18 / marginTop 14.
  // No flex — this is a full-width card in a column, not a grid cell. Pass a
  // `style` override (flex: 1) if it is ever dropped back into a 2×2 grid.
  cell: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 18,
    marginTop: 14,
    padding: 15,
    paddingBottom: 14,
    minHeight: 130,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },

  // 9px — decorative (52pt hero is the primary). HIG §17 Intentional Deviation.
  micro: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  // 52pt hero — matches the editorial stat grid system
  hero: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 58,
    letterSpacing: -2,
    lineHeight: 60.5,
  },
  unit: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textMuted,
    letterSpacing: 0,
  },

  // 3pt micro progress bar — lives between hero and sub label
  bar: {
    height: 3,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 6,
  },
  barFill: {
    height: '100%',
    borderRadius: 1.5,
  },

  // 11pt — HIG minimum. Shows remaining oz — this IS the info carrier.
  sub: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    marginBottom: 10,
  },
  toast: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.accent,
    marginBottom: 10,
    letterSpacing: 0.2,
  },

  // Bottom accent line — same pattern as all stat cells
  accentLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
});
