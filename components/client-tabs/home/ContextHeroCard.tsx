/**
 * ContextHeroCard — Context-aware hero card orchestrator
 *
 * 4 states, in priority order:
 * 1. pre-workout  — workout scheduled, not completed
 * 2. evening-habits — hoursLeft <= 4 AND habits incomplete (any day)
 * 3. post-workout — workout completed
 * 4. rest         — no workout today
 *
 * LayoutAnimation.configureNext is called SYNCHRONOUSLY before any
 * state change so height transitions animate rather than snap.
 *
 * Haptics per state CTA:
 * - START WORKOUT → Heavy impact
 * - LOG SESSION   → Medium impact (already in TodayWorkoutCard)
 * - Evening CTA   → Warning notification
 * - Explore       → Light impact (already in TodayWorkoutCard)
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import TodayWorkoutCard from './TodayWorkoutCard';
import { FontFamily } from '../../../constants/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type HeroState = 'pre-workout' | 'post-workout' | 'rest' | 'evening-habits';

interface ContextHeroCardProps {
  todayWorkout: any;
  isCompleted: boolean;
  trainerName?: string;
  habitsDone: number;             // 0–5, lifted from HabitTracker via onCompletionChange
  topIncompleteHabit?: string;    // label of highest-priority unchecked habit (excl. sleep)
  onSkip?: () => void;
}

export default function ContextHeroCard({
  todayWorkout,
  isCompleted,
  trainerName,
  habitsDone,
  topIncompleteHabit,
  onSkip,
}: ContextHeroCardProps) {
  const prevState = useRef<HeroState | null>(null);

  // Determine current state — pure computation, no side effects
  const heroState: HeroState = (() => {
    // P1: active workout takes highest priority
    if (todayWorkout && !isCompleted) return 'pre-workout';
    // P2: workout done
    if (todayWorkout && isCompleted) return 'post-workout';
    // P3: rest day
    return 'rest';
  })();

  // LayoutAnimation must be called SYNCHRONOUSLY before the render that
  // causes a state change. We detect the transition here during render
  // (safe — we're not calling setState, just configuring animation).
  if (prevState.current !== null && prevState.current !== heroState) {
    LayoutAnimation.configureNext({
      duration: 320,
      create: { type: LayoutAnimation.Types.spring, property: LayoutAnimation.Properties.scaleXY, springDamping: 0.75 },
      update: { type: LayoutAnimation.Types.spring, springDamping: 0.75 },
      delete: { type: LayoutAnimation.Types.spring, property: LayoutAnimation.Properties.scaleXY, springDamping: 0.75 },
    });
  }
  prevState.current = heroState;


  // All other states delegate to TodayWorkoutCard
  return (
    <TodayWorkoutCard
      workout={todayWorkout}
      trainerName={trainerName}
      isCompleted={isCompleted}
      onSkip={onSkip}
    />
  );
}

const st = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',  // gold tint border on evening state
    padding: 20,
    paddingBottom: 14,
    overflow: 'hidden',
    minHeight: 160,
  },
  tag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#FFD700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  hero: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 6,
    lineHeight: 36,
  },
  sub: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 19,
    marginBottom: 20,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFD700',
    letterSpacing: 1.5,
  },
  accentLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
});
