import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated as RNAnimated, Easing, Image, Modal, Linking, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { Spacing } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

export default function GymCheckInWidget({ activeVisit, checkIn, checkOut, activeCalories }: any) {
  const reduced = useReducedMotion();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pulseAnim] = useState(new RNAnimated.Value(1));
  const [glowAnim] = useState(new RNAnimated.Value(0));
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{ duration: string; mins: number; cals: number } | null>(null);
  const [isStale, setIsStale] = useState(false);

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

  useEffect(() => {
    if (isStale && activeVisit) {
      checkOut();
    }
  }, [isStale, activeVisit, checkOut]);

  const openMusic = (platform: 'spotify' | 'apple') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = platform === 'spotify'
      ? 'spotify:playlist:37i9dQZF1DX76Wlfdnj7AP'
      : 'music://';
    Linking.openURL(url).catch(() => {
      const webUrl = platform === 'spotify'
        ? 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP'
        : 'https://music.apple.com';
      Linking.openURL(webUrl);
    });
  };

  const displayCals = activeCalories;

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
      <Animated.View entering={FadeInUp.delay(100)}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            Haptics.selectionAsync();
            // Review before commit — checking in starts a running timer, so a
            // bare tap only asks; the session starts on the explicit confirm.
            Alert.alert('Start a gym session?', 'Checking in starts the session timer.', [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Check in',
                onPress: () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  checkIn();
                },
              },
            ]);
          }}
          style={st.gymCheckInBtn}
          accessibilityRole="button"
          accessibilityLabel="Check in to gym"
          accessibilityHint="Asks to confirm before the session timer starts"
        >
          <View style={st.gymCheckInIcon}>
            <Ionicons name="flash" size={22} color={CoachColors.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.gymCheckInTitle}>Start gym session</Text>
            <Text style={st.gymCheckInSub}>Check in · earn 50 XP · track your time</Text>
          </View>
          <View style={st.gymArrowCircle}>
            <Ionicons name="chevron-forward" size={16} color={CoachColors.textMuted} />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const glowBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(198,242,78,0.3)', 'rgba(198,242,78,0.7)'],
  });

  return (
    <>
    <Animated.View entering={FadeInUp.delay(100)}>
      <RNAnimated.View style={[st.gymActiveContainer, { borderColor: isStale ? CoachColors.danger : glowBorderColor }]}>
        <View style={st.gymActiveHeader}>
          <View style={st.gymLiveBadge}>
            <View style={st.gymLiveDot} />
            <Text style={st.gymLiveText}>Live session</Text>
          </View>
          <RNAnimated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={st.gymTimerBig}>{elapsed}</Text>
          </RNAnimated.View>
        </View>

        <View style={st.gymStatsRow}>
          <View style={st.gymStatBox}>
            <Ionicons name="flame-outline" size={14} color={CoachColors.accent} />
            <Text style={st.gymStatValue}>{displayCals}</Text>
            <Text style={st.gymStatLabel}>Cal</Text>
          </View>
          <View style={st.gymStatDivider} />
          <View style={st.gymStatBox}>
            <Ionicons name="trophy-outline" size={14} color={CoachColors.accent} />
            <Text style={st.gymStatValue}>+50</Text>
            <Text style={st.gymStatLabel}>XP</Text>
          </View>
          <View style={st.gymStatDivider} />
          <View style={st.gymStatBox}>
            <Ionicons name="time-outline" size={14} color={CoachColors.accent} />
            <Text style={st.gymStatValue}>{elapsedMinutes}</Text>
            <Text style={st.gymStatLabel}>Min</Text>
          </View>
        </View>

          <View style={st.gymMusicRow}>
            <Text style={st.gymMusicLabel}>Connect music</Text>
            <View style={st.gymMusicBtns}>
              <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                style={st.gymMusicBtn}
                onPress={() => openMusic('spotify')}
                activeOpacity={0.8}
              >
                <Ionicons name="play-circle" size={16} color={CoachColors.textSecondary} />
                <Text style={st.gymMusicBtnText}>Connect Spotify</Text>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                style={st.gymMusicBtn}
                onPress={() => openMusic('apple')}
                activeOpacity={0.8}
              >
                <Ionicons name="musical-notes" size={16} color={CoachColors.textSecondary} />
                <Text style={st.gymMusicBtnText}>Apple Music</Text>
              </TouchableOpacity>
            </View>
          </View>

        <TouchableOpacity
          onPress={handleEndSession}
          style={st.gymCheckOutBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="stop-circle" size={18} color={CoachColors.accent} />
          <Text style={st.gymCheckOutText}>End session</Text>
        </TouchableOpacity>
      </RNAnimated.View>
    </Animated.View>

    <Modal
      visible={showSummary}
      transparent
      animationType="fade"
      onRequestClose={() => setShowSummary(false)}
    >
      <View style={st.summaryOverlay}>
        <Animated.View entering={FadeInUp.duration(400)} style={st.summaryCard}>
          <View style={st.summaryIconCircle}>
            <Ionicons name="checkmark-circle" size={48} color={CoachColors.accent} />
          </View>
          <Text style={st.summaryTitle}>Session complete</Text>
          <Text style={st.summarySubtitle}>Great work! Here's your recap.</Text>

          <View style={st.summaryStatsRow}>
            <View style={st.summaryStatItem}>
              <Text style={st.summaryStatValue}>{summaryData?.duration || '00:00'}</Text>
              <Text style={st.summaryStatLabel}>Duration</Text>
            </View>
            <View style={st.summaryStatDivider} />
            <View style={st.summaryStatItem}>
              <Text style={st.summaryStatValue}>{summaryData?.cals || 0}</Text>
              <Text style={st.summaryStatLabel}>Calories</Text>
            </View>
            <View style={st.summaryStatDivider} />
            <View style={st.summaryStatItem}>
              <Text style={[st.summaryStatValue, { color: CoachColors.accent }]}>+50</Text>
              <Text style={st.summaryStatLabel}>XP earned</Text>
            </View>
          </View>

          <TouchableOpacity
            style={st.summaryDoneBtn}
            onPress={() => {
              setShowSummary(false);
              checkOut();
            }}
            activeOpacity={0.85}
          >
            <Text style={st.summaryDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
    </>
  );
}

const st = StyleSheet.create({
  gymCheckInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  gymCheckInIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  gymCheckInTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    letterSpacing: 0.5,
  },
  gymCheckInSub: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12,
    color: CoachColors.textMuted,
    marginTop: 2,
  },
  gymArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymActiveContainer: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    padding: 20,
    borderRadius: 20,
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
    gap: 6,
  },
  gymLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CoachColors.accent,
  },
  gymLiveText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.accent,
    letterSpacing: 1,
  },
  gymTimerBig: {
    fontFamily: CoachFonts.mono,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -1,
  },
  gymStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CoachColors.bg,
    borderRadius: 12,
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
    fontSize: 20,
    color: CoachColors.textPrimary,
    marginTop: 6,
    marginBottom: 2,
  },
  gymStatLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 0.5,
  },
  gymMusicRow: {
    marginBottom: 24,
  },
  gymMusicLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 1,
    marginBottom: 8,
  },
  gymMusicBtns: {
    flexDirection: 'row',
    gap: 12,
  },
  gymMusicBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  gymMusicBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    color: CoachColors.textSecondary,
  },
  nowPlayingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.bg,
    borderRadius: 12,
    padding: 10,
    marginBottom: 24,
    gap: 12,
  },
  nowPlayingArt: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  nowPlayingPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  nowPlayingInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nowPlayingTrack: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    marginBottom: 2,
  },
  nowPlayingArtist: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12,
    color: CoachColors.textMuted,
  },
  nowPlayingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 4,
  },
  playPauseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymCheckOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: CoachColors.accentSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.3)',
    gap: 8,
  },
  gymCheckOutText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
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
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  summaryIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: CoachColors.accentSofter,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  summaryTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24,
    color: CoachColors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summarySubtitle: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14,
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
    fontSize: 24,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  summaryStatLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 1,
  },
  summaryDoneBtn: {
    width: '100%',
    backgroundColor: CoachColors.accent,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  summaryDoneBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
});
