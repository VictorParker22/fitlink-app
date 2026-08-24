/**
 * GymCheckInWidget — the athlete's gym session timer on Today.
 *
 * Writes real rows to public.gym_visits through ClientContext
 * (checkInGym / checkOutGym). Both of those throw on a Supabase error, so
 * every call here is wrapped and the failure is stated on screen — a timer
 * that starts against a row that was never inserted would be a lie.
 *
 * Calories come from HealthContext (active energy today) and are shown only
 * when Health actually reported a number. No XP is displayed: the +50 XP
 * checkOutGym writes to clients.xp has no surface anywhere in the app, so
 * claiming it here would promise a number the athlete can never see.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated as RNAnimated, Easing, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { useAlert } from '../../../context/AlertContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

interface GymCheckInWidgetProps {
  activeVisit: { id: string; check_in_time: string } | null;
  checkIn: () => Promise<void>;
  checkOut: () => Promise<void>;
  /** Active energy burned today, from HealthContext. 0 when unavailable. */
  activeCalories?: number;
}

export default function GymCheckInWidget({ activeVisit, checkIn, checkOut, activeCalories }: GymCheckInWidgetProps) {
  const reduced = useReducedMotion();
  const { showAlert } = useAlert();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pulseAnim] = useState(new RNAnimated.Value(1));
  const [glowAnim] = useState(new RNAnimated.Value(0));
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{ duration: string; mins: number; cals: number | null } | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const entering = reduced ? undefined : FadeInDown.delay(200).duration(320);

  const formatElapsed = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const elapsed = formatElapsed(elapsedSeconds);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  useEffect(() => {
    if (activeVisit && !isStale && !reduced) {
      const pulse = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnim, { toValue: 1.05, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          RNAnimated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      const glow = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
          RNAnimated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
        ])
      );
      pulse.start();
      glow.start();
      return () => { pulse.stop(); glow.stop(); };
    }
  }, [activeVisit, isStale, reduced]);

  useEffect(() => {
    if (!activeVisit) {
      setElapsedSeconds(0);
      setIsStale(false);
      return;
    }
    const update = () => {
      const ms = Date.now() - new Date(activeVisit.check_in_time).getTime();
      const totalSecs = Math.floor(ms / 1000);
      const hrs = Math.floor(totalSecs / 3600);
      setElapsedSeconds(totalSecs);

      if (hrs >= 4) {
        setIsStale(true);
        return;
      }
      setIsStale(false);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activeVisit]);

  // checkIn / checkOut throw when the Supabase write errors. Nothing here may
  // assume they succeeded.
  const runCheckOut = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      await checkOut();
      setFailure(null);
      return true;
    } catch {
      setFailure("Couldn't end that session — it's still running. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [checkOut]);

  useEffect(() => {
    if (isStale && activeVisit) {
      runCheckOut();
    }
  }, [isStale, activeVisit, runCheckOut]);

  // Real number or omitted — Health reports 0 when it has nothing to report.
  const displayCals = activeCalories && activeCalories > 0 ? activeCalories : null;

  const handleCheckIn = useCallback(() => {
    Haptics.selectionAsync();
    // Review before commit — checking in starts a running timer, so a bare tap
    // only asks; the session starts on the explicit confirm.
    showAlert({
      type: 'confirm',
      title: 'Start a gym session?',
      message: 'Checking in starts the session timer.',
      buttons: [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Check in',
          onPress: async () => {
            setBusy(true);
            try {
              await checkIn();
              setFailure(null);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              setFailure("Couldn't start that session — nothing was saved. Try again.");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    });
  }, [checkIn, showAlert]);

  const handleEndSession = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSummaryData({
      duration: elapsed,
      mins: elapsedMinutes,
      cals: displayCals,
    });
    setShowSummary(true);
  };

  if (!activeVisit && !showSummary) {
    return (
      <Animated.View entering={entering}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={busy}
          onPress={handleCheckIn}
          style={st.gymCheckInBtn}
          accessibilityRole="button"
          accessibilityLabel="Start gym session"
          accessibilityState={{ disabled: busy }}
          accessibilityHint="Asks you to confirm before the session timer starts"
        >
          <View style={st.gymCheckInIcon}>
            <Ionicons name="flash" size={25} color={CoachColors.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.gymCheckInTitle}>Start gym session</Text>
            <Text style={st.gymCheckInSub}>Check in and we'll time it for you</Text>
          </View>
          <View style={st.gymArrowCircle}>
            <Ionicons name="chevron-forward" size={18} color={CoachColors.textMuted} />
          </View>
        </TouchableOpacity>
        {!!failure && <Text style={st.gymFailure} accessibilityLiveRegion="polite">{failure}</Text>}
      </Animated.View>
    );
  }

  const glowBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(198,242,78,0.3)', 'rgba(198,242,78,0.7)'],
  });

  return (
    <>
    <Animated.View entering={entering}>
      <RNAnimated.View
        style={[st.gymActiveContainer, { borderColor: isStale ? CoachColors.danger : glowBorderColor }]}
        accessible={true}
        accessibilityLabel={
          `Live gym session, ${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'} elapsed` +
          (displayCals ? `, ${displayCals} active calories today` : '')
        }
      >
        <View style={st.gymActiveHeader}>
          <View style={st.gymLiveBadge}>
            <View style={st.gymLiveDot} />
            <Text style={st.gymLiveText}>Live session</Text>
          </View>
          <RNAnimated.View style={reduced ? undefined : { transform: [{ scale: pulseAnim }] }}>
            <Text style={st.gymTimerBig}>{elapsed}</Text>
          </RNAnimated.View>
        </View>

        <View style={st.gymStatsRow}>
          <View style={st.gymStatBox}>
            <Ionicons name="time-outline" size={16} color={CoachColors.accent} />
            <Text style={st.gymStatValue}>{elapsedMinutes}</Text>
            <Text style={st.gymStatLabel}>Min</Text>
          </View>
          {displayCals !== null && (
            <>
              <View style={st.gymStatDivider} />
              <View style={st.gymStatBox}>
                <Ionicons name="flame-outline" size={16} color={CoachColors.accent} />
                <Text style={st.gymStatValue}>{displayCals}</Text>
                <Text style={st.gymStatLabel}>Cal today</Text>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          onPress={handleEndSession}
          disabled={busy}
          style={st.gymCheckOutBtn}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="End gym session"
          accessibilityState={{ disabled: busy }}
        >
          <Ionicons name="stop-circle" size={20} color={CoachColors.accent} />
          <Text style={st.gymCheckOutText}>End session</Text>
        </TouchableOpacity>

        {!!failure && <Text style={st.gymFailure} accessibilityLiveRegion="polite">{failure}</Text>}
      </RNAnimated.View>
    </Animated.View>

    <Modal
      visible={showSummary}
      transparent
      animationType="fade"
      onRequestClose={() => setShowSummary(false)}
    >
      <View style={st.summaryOverlay}>
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(300)} style={st.summaryCard}>
          <View style={st.summaryIconCircle}>
            <Ionicons name="checkmark-circle" size={54} color={CoachColors.accent} />
          </View>
          <Text style={st.summaryTitle} accessibilityRole="header">Session complete</Text>
          <Text style={st.summarySubtitle}>Here's what you logged.</Text>

          <View style={st.summaryStatsRow}>
            <View style={st.summaryStatItem}>
              <Text style={st.summaryStatValue}>{summaryData?.duration || '00:00'}</Text>
              <Text style={st.summaryStatLabel}>Duration</Text>
            </View>
            {summaryData?.cals != null && (
              <>
                <View style={st.summaryStatDivider} />
                <View style={st.summaryStatItem}>
                  <Text style={st.summaryStatValue}>{summaryData.cals}</Text>
                  <Text style={st.summaryStatLabel}>Cal today</Text>
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            style={st.summaryDoneBtn}
            disabled={busy}
            onPress={async () => {
              const ok = await runCheckOut();
              if (ok) setShowSummary(false);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Done"
            accessibilityState={{ disabled: busy }}
          >
            <Text style={st.summaryDoneBtnText}>Done</Text>
          </TouchableOpacity>
          {!!failure && <Text style={st.gymFailure} accessibilityLiveRegion="polite">{failure}</Text>}
        </Animated.View>
      </View>
    </Modal>
    </>
  );
}

const st = StyleSheet.create({
  // Matches the Today card system: surface / borderMuted / radius 18 /
  // padding 15 / marginTop 14. The screen owns the horizontal inset.
  gymCheckInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    marginTop: 14,
    padding: 15,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  gymFailure: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12.5,
    color: CoachColors.danger,
    marginTop: 9,
    lineHeight: 17,
  },
  gymCheckInIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  gymCheckInTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
    letterSpacing: 0.5,
  },
  gymCheckInSub: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13.5,
    color: CoachColors.textMuted,
    marginTop: 2,
  },
  gymArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymActiveContainer: {
    marginTop: 14,
    padding: 18,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
  },
  gymActiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  gymLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderCurve: 'continuous',
    gap: 6,
  },
  gymLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  gymLiveText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.accent,
    letterSpacing: 1,
  },
  gymTimerBig: {
    fontFamily: CoachFonts.mono,
    fontSize: 36,
    color: CoachColors.textPrimary,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  gymStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CoachColors.bg,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 16,
    marginBottom: 20,
  },
  gymStatBox: {
    alignItems: 'center',
    flex: 1,
  },
  gymStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: CoachColors.borderMuted,
  },
  gymStatValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
    marginTop: 6,
    marginBottom: 2,
    fontVariant: ['tabular-nums'],
  },
  gymStatLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textFaint,
    letterSpacing: 0.5,
  },
  gymCheckOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: CoachColors.accentSoft,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.3)',
    gap: 8,
  },
  gymCheckOutText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.accent,
    letterSpacing: 0.5,
  },
  summaryOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: CoachColors.surface,
    borderRadius: 24,
    borderCurve: 'continuous',
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  summaryIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSofter,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  summaryTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 27,
    color: CoachColors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summarySubtitle: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 15.5,
    color: CoachColors.textMuted,
    marginBottom: 32,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: CoachColors.bg,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 20,
    marginBottom: 32,
  },
  summaryStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: CoachColors.borderMuted,
  },
  summaryStatValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 27,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  summaryStatLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textFaint,
    letterSpacing: 1,
  },
  summaryDoneBtn: {
    width: '100%',
    backgroundColor: CoachColors.accent,
    paddingVertical: 18,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  summaryDoneBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
});
