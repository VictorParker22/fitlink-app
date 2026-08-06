import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated as RNAnimated, Easing, Image, Modal, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { FontFamily, Spacing } from '../../../constants/theme';

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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            checkIn();
          }}
          style={st.gymCheckInBtn}
          accessibilityRole="button"
          accessibilityLabel="Check in to gym"
        >
          <LinearGradient
            colors={['#22C55E', '#16A34A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.gymGradientIcon}
          >
            <Ionicons name="flash" size={22} color="#FFFFFF" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={st.gymCheckInTitle}>START GYM SESSION</Text>
            <Text style={st.gymCheckInSub}>Check in · earn 50 XP · track your time</Text>
          </View>
          <View style={st.gymArrowCircle}>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const glowBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(34,197,94,0.3)', 'rgba(34,197,94,0.7)'],
  });

  return (
    <>
    <Animated.View entering={FadeInUp.delay(100)}>
      <RNAnimated.View style={[st.gymActiveContainer, { borderColor: isStale ? '#EF4444' : glowBorderColor }]}>
        <View style={st.gymActiveHeader}>
          <View style={st.gymLiveBadge}>
            <View style={st.gymLiveDot} />
            <Text style={st.gymLiveText}>LIVE SESSION</Text>
          </View>
          <RNAnimated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={st.gymTimerBig}>{elapsed}</Text>
          </RNAnimated.View>
        </View>

        <View style={st.gymStatsRow}>
          <View style={st.gymStatBox}>
            <Ionicons name="flame-outline" size={14} color="#FF6B35" />
            <Text style={st.gymStatValue}>{displayCals}</Text>
            <Text style={st.gymStatLabel}>CAL</Text>
          </View>
          <View style={st.gymStatDivider} />
          <View style={st.gymStatBox}>
            <Ionicons name="trophy-outline" size={14} color="#FFD700" />
            <Text style={st.gymStatValue}>+50</Text>
            <Text style={st.gymStatLabel}>XP</Text>
          </View>
          <View style={st.gymStatDivider} />
          <View style={st.gymStatBox}>
            <Ionicons name="time-outline" size={14} color="#22C55E" />
            <Text style={st.gymStatValue}>{elapsedMinutes}</Text>
            <Text style={st.gymStatLabel}>MIN</Text>
          </View>
        </View>

          <View style={st.gymMusicRow}>
            <Text style={st.gymMusicLabel}>CONNECT MUSIC</Text>
            <View style={st.gymMusicBtns}>
              <TouchableOpacity
                style={[st.gymMusicBtn, { backgroundColor: 'rgba(30,215,96,0.15)' }]}
                onPress={() => openMusic('spotify')}
                activeOpacity={0.8}
              >
                <Ionicons name="play-circle" size={16} color="#1ED760" />
                <Text style={[st.gymMusicBtnText, { color: '#1ED760' }]}>Connect Spotify</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.gymMusicBtn, { backgroundColor: 'rgba(252,60,68,0.15)' }]}
                onPress={() => openMusic('apple')}
                activeOpacity={0.8}
              >
                <Ionicons name="musical-notes" size={16} color="#FC3C44" />
                <Text style={[st.gymMusicBtnText, { color: '#FC3C44' }]}>Apple Music</Text>
              </TouchableOpacity>
            </View>
          </View>

        <TouchableOpacity
          onPress={handleEndSession}
          style={st.gymCheckOutBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="stop-circle" size={18} color="#EF4444" />
          <Text style={st.gymCheckOutText}>END SESSION</Text>
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
            <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
          </View>
          <Text style={st.summaryTitle}>SESSION COMPLETE</Text>
          <Text style={st.summarySubtitle}>Great work! Here's your recap.</Text>

          <View style={st.summaryStatsRow}>
            <View style={st.summaryStatItem}>
              <Text style={st.summaryStatValue}>{summaryData?.duration || '00:00'}</Text>
              <Text style={st.summaryStatLabel}>DURATION</Text>
            </View>
            <View style={st.summaryStatDivider} />
            <View style={st.summaryStatItem}>
              <Text style={st.summaryStatValue}>{summaryData?.cals || 0}</Text>
              <Text style={st.summaryStatLabel}>CALORIES</Text>
            </View>
            <View style={st.summaryStatDivider} />
            <View style={st.summaryStatItem}>
              <Text style={[st.summaryStatValue, { color: '#FFD700' }]}>+50</Text>
              <Text style={st.summaryStatLabel}>XP EARNED</Text>
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
            <Text style={st.summaryDoneBtnText}>DONE</Text>
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  gymGradientIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  gymCheckInTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  gymCheckInSub: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  gymArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymActiveContainer: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#0A120D',
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
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  gymLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  gymLiveText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: '#22C55E',
    letterSpacing: 1,
  },
  gymTimerBig: {
    fontFamily: FontFamily.mono,
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  gymStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  gymStatValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    marginTop: 6,
    marginBottom: 2,
  },
  gymStatLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
  },
  gymMusicRow: {
    marginBottom: 24,
  },
  gymMusicLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
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
  },
  gymMusicBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
  },
  nowPlayingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
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
    borderColor: 'rgba(255,255,255,0.1)',
  },
  nowPlayingInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nowPlayingTrack: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  nowPlayingArtist: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymCheckOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    gap: 8,
  },
  gymCheckOutText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#EF4444',
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
    backgroundColor: '#111',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  summaryIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(34,197,94,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  summaryTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summarySubtitle: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 32,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.03)',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  summaryStatValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  summaryStatLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
  summaryDoneBtn: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  summaryDoneBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#000000',
    letterSpacing: 0.5,
  },
});
