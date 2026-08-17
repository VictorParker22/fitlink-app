/**
 * ClientFAB — iOS-native quick actions sheet
 *
 * Replaces the Material Design overlay FAB with an iOS-native bottom sheet.
 * A small, unobtrusive trigger button (bottom-right, above the tab bar) opens
 * a pageSheet modal containing 3 contextual action rows.
 *
 * Why: Apple HIG doesn't use FABs. Sheet presentations are the idiomatic
 * iOS pattern for contextual quick-actions. This also removes the
 * "two bottom anchors" visual tension with the tab bar.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../types/routes';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import * as Haptics from 'expo-haptics';
import { useClient } from '../context/ClientContext';
import { useWorkout } from '../context/WorkoutContext';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useReducedMotion } from '../lib/useReducedMotion';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuickAction {
  label: string;
  sub: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  route: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientFAB() {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Reduce Motion: the quick-actions sheet appears/disappears without the
  // spring slide — a plain fade keeps the state change legible.
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { todayWorkout, trainer } = useClient();
  const { activeSession } = useWorkout();

  // Hide during active workout — WorkoutMiniPlayer takes center stage
  const isWorkoutActive = activeSession?.isActive && activeSession.setupComplete;

  const tabBarHeight = 80 + (insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? 16 : 8) + 16;
  const fabBottom = tabBarHeight + 12;

  const actions: QuickAction[] = useMemo(() => {
    const hour = new Date().getHours();
    return [
      todayWorkout
        ? {
            label: `Start: ${todayWorkout.title || 'Today\'s workout'}`,
            sub: 'Your coach\'s prescription for today',
            icon: 'play-circle-outline',
            color: CoachColors.accent,
            route: ClientRoute.workouts,
          }
        : {
            label: 'Workout catalog',
            sub: 'Browse and start a workout',
            icon: 'barbell-outline',
            color: CoachColors.accent,
            route: ClientRoute.workouts,
          },
      {
        label: hour >= 18 ? 'Log dinner' : 'Nutrition plan',
        sub: 'Track your meals and macros',
        icon: 'restaurant-outline',
        color: CoachColors.accent,
        route: ClientRoute.myDiet,
      },
      trainer
        ? {
            label: `Message ${trainer.name?.split(' ')[0] || 'Coach'}`,
            sub: 'Send your coach a message',
            icon: 'chatbubble-ellipses-outline',
            color: CoachColors.accent,
            route: ClientRoute.myMessages,
          }
        : {
            label: 'Performance log',
            sub: 'Record your progress',
            icon: 'stats-chart-outline',
            color: CoachColors.accent,
            route: ClientRoute.myProgress,
          },
    ];
  }, [todayWorkout, trainer]);

  const handleAction = useCallback((route: string) => {
    setSheetOpen(false);
    setTimeout(() => router.push(route as any), 300);
  }, [router]);

  const openSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetOpen(false);
  }, []);

  if (isWorkoutActive) return null;

  return (
    <>
      {/* ── Trigger button ── */}
      <View style={[s.trigger, { bottom: fabBottom }]} pointerEvents="box-none">
        <TouchableOpacity
          style={s.triggerBtn}
          onPress={openSheet}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Quick actions"
          accessibilityHint="Opens a menu with quick actions for workouts, nutrition, and messaging"
        >
          <Ionicons name="add" size={25} color={CoachColors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Sheet modal ── */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeSheet}
      >
        {/* Scrim */}
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(200)}
          exiting={reduceMotion ? undefined : FadeOut.duration(200)}
          style={s.scrim}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSheet} activeOpacity={1} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(120) : SlideInDown.springify().damping(24).stiffness(260)}
          exiting={reduceMotion ? FadeOut.duration(120) : SlideOutDown.duration(220)}
          style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}
        >
          {/* Handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Quick actions</Text>
            <TouchableOpacity hitSlop={8} style={s.closeBtn} onPress={closeSheet}>
              <Ionicons name="close" size={20} color={CoachColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Action rows */}
          {actions.map((action, i) => (
            <TouchableOpacity
              key={action.label}
              style={[s.actionRow, i < actions.length - 1 && s.actionRowBorder]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleAction(action.route);
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={[s.actionIcon, { backgroundColor: `${action.color}18` }]}>
                <Ionicons name={action.icon} size={25} color={action.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionLabel}>{action.label}</Text>
                <Text style={s.actionSub}>{action.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>
          ))}
        </Animated.View>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Trigger
  trigger: {
    position: 'absolute',
    right: 20,
    zIndex: 100,
  },
  triggerBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  // Scrim
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },

  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: CoachColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoachColors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sheetTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 19,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Action rows
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 68,
  },
  actionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionLabel: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  actionSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textMuted,
  },
});
