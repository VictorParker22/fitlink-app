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
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import TodayWorkoutCard from './TodayWorkoutCard';
import { useReducedMotion } from '../../../lib/useReducedMotion';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type HeroState = 'pre-workout' | 'post-workout' | 'rest' | 'evening-habits';

interface ContextHeroCardProps {
  todayWorkout: any;
  isCompleted: boolean;
  trainerName?: string;
  habitsDone: number;             // 0–5, lifted from HabitTracker via onHabitsChange
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
  const reducedMotion = useReducedMotion();

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
  // Reduce Motion: swap the card contents instantly — no spring scale.
  if (!reducedMotion && prevState.current !== null && prevState.current !== heroState) {
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
