import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useReducedMotion } from '../lib/useReducedMotion';
import { Motion, Ease } from '../constants/motion';
import ConfettiBurst from './coach/ConfettiBurst';

/**
 * CelebrationOverlay — the one celebration card, five kinds.
 *
 * Consolidates DayOneOverlay, PRCelebration/PRCelebrationModal,
 * SeasonComplete, FirstClientOverlay and PassPublishedOverlay, which had
 * independently drifted into five near-identical (and in two cases much
 * richer) implementations of "confetti + spring-in card + one haptic".
 *
 * Scope note: the two data-rich originals (PRCelebration.tsx —
 * inline message composer, weekly-best bar chart, squad-share checkbox —
 * and SeasonComplete.tsx — per-lift progress table, other-plans browser)
 * do not fit a single reusable card. Per the consolidation brief, this
 * component preserves the real number each one is built on (the PR
 * weight; the season's sessions-done count) via `stat`, and their
 * secondary actions ("tell the coach", "see other plans") became a single
 * `secondary` action wired by the caller — the inline composer, chart and
 * squad toggle were cut so every celebration in the app shares one visual
 * and interaction pattern. Callers that still want to message the coach
 * fire that send from `secondary.onPress` (see strength-session.tsx /
 * workouts.tsx), just without the in-card text box.
 *
 * Rendered as an absolutely-positioned overlay inside the screen — never a
 * native Modal — so dismissing and navigating can never wedge each other.
 * Reduce Motion: no confetti, the card appears in place (Motion.reduced
 * crossfade) instead of springing in.
 */

const C = CoachColors;
const F = CoachFonts;

export type CelebrationKind = 'day-one' | 'pr' | 'season-complete' | 'first-client' | 'pass-published';

export interface CelebrationAction {
  label: string;
  onPress: () => void;
}

export interface CelebrationStat {
  value: string;
  label: string;
}

export interface CelebrationOverlayProps {
  visible: boolean;
  kind: CelebrationKind;
  title: string;
  subtitle?: string;
  stat?: CelebrationStat;
  primary: CelebrationAction;
  secondary?: CelebrationAction;
  onDismiss: () => void;
}

const EYEBROW: Record<CelebrationKind, string> = {
  'day-one': 'Day one',
  pr: 'New best',
  'season-complete': 'Season complete',
  'first-client': 'First athlete in',
  'pass-published': "It's live",
};

export default function CelebrationOverlay({
  visible,
  kind,
  title,
  subtitle,
  stat,
  primary,
  secondary,
  onDismiss,
}: CelebrationOverlayProps) {
  // absoluteFill View, not a native Modal — Android back would otherwise pop
  // the screen underneath while this was still covering it.
  useAndroidBack(useCallback(() => { onDismiss(); return true; }, [onDismiss]), visible);

  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0.96);
  const opacity = useSharedValue(0);
  const firedHaptic = useRef(false);

  useEffect(() => {
    if (!visible) {
      firedHaptic.current = false;
      opacity.value = 0;
      scale.value = reduced ? 1 : 0.96;
      return;
    }
    // One success notification per appearance, never a burst.
    if (!firedHaptic.current) {
      firedHaptic.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (reduced) {
      // Reduce Motion: appear in place, plain crossfade only.
      scale.value = 1;
      opacity.value = withTiming(1, { duration: Motion.reduced });
    } else {
      scale.value = withTiming(1, { duration: Motion.moment, easing: Ease.out });
      opacity.value = withTiming(1, { duration: Motion.moment, easing: Ease.out });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, s.root]}
      pointerEvents="auto"
      accessible={false}
      accessibilityViewIsModal
    >
      {!reduced && <ConfettiBurst />}

      <Animated.View style={[s.card, cardStyle]}>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          accessibilityLabel={[title, stat ? `${stat.value} ${stat.label}` : null, subtitle].filter(Boolean).join('. ')}
        >
          <Text style={s.eyebrow}>{EYEBROW[kind]}</Text>
          <Text style={s.title} numberOfLines={3}>{title}</Text>

          {stat ? (
            <View style={s.statBlock}>
              <Text style={s.statValue} numberOfLines={1} maxFontSizeMultiplier={1.2}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ) : null}

          {subtitle ? <Text style={s.sub} numberOfLines={4}>{subtitle}</Text> : null}
        </View>

        <Pressable
          style={({ pressed }) => [s.primaryBtn, pressed && s.primaryBtnPressed]}
          onPress={primary.onPress}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
        >
          <Text style={s.primaryText}>{primary.label}</Text>
        </Pressable>

        {secondary ? (
          <Pressable
            style={({ pressed }) => [s.secondaryBtn, pressed && { opacity: 0.6 }]}
            onPress={secondary.onPress}
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
            hitSlop={8}
          >
            <Text style={s.secondaryText}>{secondary.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    // Sanctioned scrim (CoachColors.bg at alpha) — the one raw color allowed
    // outside constants/coachDesign.ts.
    backgroundColor: 'rgba(16,18,16,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 100,
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 24,
    borderCurve: 'continuous',
    paddingVertical: 32,
    paddingHorizontal: 28,
  },
  eyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 13.5,
    color: C.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontFamily: F.headingBold,
    fontSize: 27,
    lineHeight: 33,
    color: C.textPrimary,
    textAlign: 'center',
  },
  statBlock: { alignItems: 'center', marginTop: 18 },
  statValue: {
    fontFamily: F.headingBold,
    fontSize: 64,
    lineHeight: 68,
    color: C.textPrimary,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: F.body,
    fontSize: 14,
    color: C.textMuted,
    marginTop: 2,
  },
  sub: {
    fontFamily: F.body,
    fontSize: 15,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 14,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 16,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 28,
  },
  primaryBtnPressed: { opacity: 0.85 },
  primaryText: { fontFamily: F.bodyBold, fontSize: 17, color: C.onAccent },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryText: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textSecondary },
});
