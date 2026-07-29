import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Animated as RNAnimated,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeInUp,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import { useHealth } from '../../context/HealthContext';
import GreetingHeader from '../../components/client-tabs/home/GreetingHeader';
import CoachPulse from '../../components/client-tabs/home/CoachPulse';
import TodayWorkoutCard from '../../components/client-tabs/home/TodayWorkoutCard';
import QuickWeightLog from '../../components/client-tabs/home/QuickWeightLog';
import DaySummaryCard from '../../components/client-tabs/home/DaySummaryCard';
import TomorrowPreview from '../../components/client-tabs/home/TomorrowPreview';
import ConsistencyRing from '../../components/client-tabs/home/ConsistencyRing';
import WelcomeGuide from '../../components/client-tabs/home/WelcomeGuide';
import NutritionWidget from '../../components/NutritionWidget';
import ClientFAB from '../../components/ClientFAB';
import CelebrationOverlay from '../../components/CelebrationOverlay';
import { useCelebrations } from '../../hooks/useCelebrations';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { calculateXp, calculateLevel } from '../../utils/xp';
import { ClientRoute } from '../../types/routes';
import {
  loginWithSpotify,
  getNowPlaying,
  getStoredToken,
  spotifyPlay,
  spotifyPause,
  spotifyNext,
  spotifyPrevious,
  type NowPlayingTrack,
} from '../../lib/spotify';

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

function GymCheckInWidget({
  activeVisit,
  checkIn,
  checkOut,
  activeCalories,
}: {
  activeVisit: any;
  checkIn: () => void;
  checkOut: () => void;
  activeCalories: number;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isStale, setIsStale] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{ duration: string; mins: number; cals: number } | null>(null);

  // Format seconds to HH:MM:SS
  const formatTime = (totalSec: number): string => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  };

  const elapsed = formatTime(elapsedSeconds);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  // Spotify state
  const [nowPlaying, setNowPlaying] = useState<NowPlayingTrack | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState(false);

  // Check if Spotify is already connected on mount
  useEffect(() => {
    getStoredToken().then(token => setSpotifyConnected(!!token));
  }, []);

  // Poll now playing every 10s when active + connected
  useEffect(() => {
    if (!activeVisit || !spotifyConnected) {
      setNowPlaying(null);
      return;
    }
    const poll = () => getNowPlaying().then(setNowPlaying);
    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, [activeVisit, spotifyConnected]);

  const connectSpotify = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const success = await loginWithSpotify();
    if (success) setSpotifyConnected(true);
  };

  // Pulsing animation for the active state
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  const glowAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (activeVisit && !isStale) {
      const pulse = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
          RNAnimated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
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
  }, [activeVisit, isStale]);

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
    const id = setInterval(update, 1000); // Update every second
    return () => clearInterval(id);
  }, [activeVisit]);

  // Auto-checkout stale visits
  useEffect(() => {
    if (isStale && activeVisit) {
      checkOut();
    }
  }, [isStale, activeVisit, checkOut]);

  // Music launcher helper
  const openMusic = (platform: 'spotify' | 'apple') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = platform === 'spotify'
      ? 'spotify:playlist:37i9dQZF1DX76Wlfdnj7AP' // Beast Mode playlist
      : 'music://'; // Opens Apple Music
    Linking.openURL(url).catch(() => {
      // Fallback to web
      const webUrl = platform === 'spotify'
        ? 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP'
        : 'https://music.apple.com';
      Linking.openURL(webUrl);
    });
  };

  // Real calories from health device, or 0 if not connected
  const displayCals = activeCalories;

  // Handle end session with summary
  const handleEndSession = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSummaryData({
      duration: elapsed,
      mins: elapsedMinutes,
      cals: displayCals,
    });
    setShowSummary(true);
    // Don't checkOut yet — wait for user to dismiss the summary
  };

  // ─── IDLE STATE: Bold check-in button ───
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

  // ─── ACTIVE STATE: Live session card with Korean-style energy ───
  const glowBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(34,197,94,0.3)', 'rgba(34,197,94,0.7)'],
  });

  return (
    <>
    <Animated.View entering={FadeInUp.delay(100)}>
      <RNAnimated.View style={[st.gymActiveContainer, { borderColor: isStale ? '#EF4444' : glowBorderColor }]}>
        {/* Top bar: Status + Timer */}
        <View style={st.gymActiveHeader}>
          <View style={st.gymLiveBadge}>
            <View style={st.gymLiveDot} />
            <Text style={st.gymLiveText}>LIVE SESSION</Text>
          </View>
          <RNAnimated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={st.gymTimerBig}>{elapsed}</Text>
          </RNAnimated.View>
        </View>

        {/* Stats Row */}
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
        {/* Music Section */}
        {!spotifyConnected ? (
          <View style={st.gymMusicRow}>
            <Text style={st.gymMusicLabel}>CONNECT MUSIC</Text>
            <View style={st.gymMusicBtns}>
              <TouchableOpacity
                style={[st.gymMusicBtn, { backgroundColor: 'rgba(30,215,96,0.15)' }]}
                onPress={connectSpotify}
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
        ) : (
          <View style={st.nowPlayingContainer}>
            {/* Album Art or Spotify icon placeholder */}
            {nowPlaying?.albumArt ? (
              <Image source={{ uri: nowPlaying.albumArt }} style={st.nowPlayingArt} />
            ) : (
              <View style={[st.nowPlayingArt, st.nowPlayingPlaceholder]}>
                <Ionicons name="play-circle" size={24} color="#1ED760" />
              </View>
            )}

            {/* Track info or placeholder */}
            <View style={st.nowPlayingInfo}>
              <Text style={st.nowPlayingTrack} numberOfLines={1}>
                {nowPlaying?.trackName || 'Spotify Connected'}
              </Text>
              <Text style={st.nowPlayingArtist} numberOfLines={1}>
                {nowPlaying?.artistName || 'Play something to see it here'}
              </Text>
            </View>

            {/* Always-visible controls */}
            <View style={st.nowPlayingControls}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  spotifyPrevious().then(() => setTimeout(() => getNowPlaying().then(setNowPlaying), 500));
                }}
                hitSlop={8}
              >
                <Ionicons name="play-skip-back" size={14} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const action = nowPlaying?.isPlaying ? spotifyPause() : spotifyPlay();
                  action.then(() => setTimeout(() => getNowPlaying().then(setNowPlaying), 300));
                }}
                style={st.playPauseBtn}
              >
                <Ionicons name={nowPlaying?.isPlaying ? 'pause' : 'play'} size={14} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  spotifyNext().then(() => setTimeout(() => getNowPlaying().then(setNowPlaying), 500));
                }}
                hitSlop={8}
              >
                <Ionicons name="play-skip-forward" size={14} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Check Out Button */}
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

    {/* Session Complete Summary Modal */}
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

export default function ClientHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    clientData,
    trainer,
    todayWorkout,
    workouts,
    loading,
    refreshData,
    activeGymVisit,
    checkInGym,
    checkOutGym,
    progressLogs,
    completeTrackWorkout,
    skipTrackWorkout,
  } = useClient();

  const { healthData } = useHealth();

  // Derive latest weight from progress logs (most recent entry with a weight value)
  const latestWeight = useMemo(() => {
    if (!progressLogs || progressLogs.length === 0) return undefined;
    const withWeight = progressLogs
      .filter((log: any) => log.weight != null)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return withWeight.length > 0 ? Number(withWeight[0].weight) : undefined;
  }, [progressLogs]);

  const [refreshing, setRefreshing] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const scrollY = useSharedValue(0);

  const { activeCelebration, dismissCelebration } = useCelebrations();

  const timeOfDay = useMemo(() => getTimeOfDay(), []);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setAuthUser(user);
    })();
  }, []);

  const clientName = clientData?.name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Athlete';
  const avatarUrl = clientData?.avatar_url;
  const isWorkoutCompletedToday = todayWorkout?.status === 'completed';

  const tomorrowWorkout = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toDateString();
    return workouts.find((w: any) => new Date(w.assigned_date).toDateString() === tomorrowStr && w.status === 'assigned');
  }, [workouts]);

  const completedDays = useMemo(() => {
    const set = new Set<number>();
    workouts.forEach((w: any) => {
      if (w.status === 'completed') {
        const d = new Date(w.assigned_date).getDay();
        set.add(d === 0 ? 6 : d - 1);
      }
    });
    return Array.from(set);
  }, [workouts]);

  const headerBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [40, 120], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  if (loading) {
    return (
      <View style={st.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={st.container}>
      {/* Celebration Overlay */}
      <CelebrationOverlay celebration={activeCelebration} onDismiss={dismissCelebration} />

      {/* Sticky Blur Header */}
      <Animated.View style={[st.header, { paddingTop: insets.top }]}>
        <Animated.View style={[StyleSheet.absoluteFill, headerBgStyle]}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        style={st.scrollView}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 100,
        }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
            colors={['#5B7FFF']}
          />
        }
      >
        {/* 1. Greeting Header */}
        <GreetingHeader
          clientName={clientName}
          avatarUrl={avatarUrl}
          timeOfDay={timeOfDay}
          trainerName={trainer?.name}
        />

        {/* 2. Gym Check-In Widget */}
        <GymCheckInWidget
          activeVisit={activeGymVisit}
          checkIn={checkInGym}
          checkOut={checkOutGym}
          activeCalories={healthData?.activeCaloriesToday || 0}
        />

        {/* 3. Coach Pulse Card (Surfaces coach presence) */}
        <CoachPulse trainer={trainer} isOnline={!!trainer?.is_online} />

        {/* Explore Widget */}
        <TouchableOpacity 
          style={st.exploreWidget} 
          onPress={() => router.push('/workouts' as any)}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={st.exploreTitle}>EXPLORE ROUTINES</Text>
            <Text style={st.exploreSubtitle}>Discover new workouts and plans to add to your journey.</Text>
          </View>
          <View style={st.exploreIconWrap}>
            <Ionicons name="compass" size={24} color="#5B7FFF" />
          </View>
        </TouchableOpacity>

        {/* Welcome Guide for Day 1 Clients */}
        <WelcomeGuide visible={!todayWorkout} />

        {/* 4. Today's Prescription / Workout Card */}
        <TodayWorkoutCard
          workout={todayWorkout}
          trainerName={trainer?.name}
          isCompleted={isWorkoutCompletedToday}
          onSkip={skipTrackWorkout}
        />

        {/* 5. Quick Weight Log (Always Visible) */}
        <QuickWeightLog latestWeight={latestWeight} unit="lbs" onLogComplete={refreshData} />

        {/* 6. Context-Aware Layout Blocks */}
        {timeOfDay === 'morning' || timeOfDay === 'afternoon' ? (
          <>
            {/* Morning/Afternoon focus: Nutrition & Consistency */}
            <NutritionWidget />
            <ConsistencyRing completedDays={completedDays} />
          </>
        ) : (
          <>
            {/* Evening/Post-Workout focus: Day Summary, Tomorrow's Plan & Rhythm */}
            <DaySummaryCard
              workoutCompleted={isWorkoutCompletedToday}
              mealsLoggedCount={(clientData?.progress as any)?.mealsLoggedToday || 0}
              totalMealsGoal={(clientData?.progress as any)?.totalMealsGoal || 4}
              streakDays={clientData?.progress?.streak || 0}
            />
            <TomorrowPreview tomorrowWorkout={tomorrowWorkout} />
            <NutritionWidget />
          </>
        )}
      </Animated.ScrollView>

      {/* Intelligent Contextual FAB */}
      <ClientFAB />
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreWidget: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    backgroundColor: '#1C1C1E',
    borderRadius: Radius.sm,
    padding: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#333333',
  },
  exploreTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  exploreSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  exploreIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A2A2C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  scrollView: {
    flex: 1,
  },
  gymCheckInBtn: {
    backgroundColor: '#0C0C0E',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  gymGradientIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymCheckInTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  gymCheckInSub: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  gymArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Active session card ──
  gymActiveContainer: {
    backgroundColor: '#0C0C0E',
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  gymActiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  gymLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  gymLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  gymLiveText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: '#22C55E',
    letterSpacing: 2,
  },
  gymTimerBig: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  // ── Stats row ──
  gymStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  gymStatBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  gymStatValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  gymStatLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
  },
  gymStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  // ── Music row ──
  gymMusicRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  gymMusicLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 2,
  },
  gymMusicBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gymMusicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  gymMusicBtnText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 10,
  },
  // ── Check out ──
  gymCheckOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 14,
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  gymCheckOutText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#EF4444',
    letterSpacing: 1.5,
  },
  // ── Now Playing ──
  nowPlayingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  nowPlayingArt: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  nowPlayingPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingInfo: {
    flexShrink: 1,
    marginRight: 'auto',
  },
  nowPlayingTrack: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  nowPlayingArtist: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
  nowPlayingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    marginLeft: 4,
  },
  playPauseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1ED760',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Session Summary Modal ──
  summaryOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  summaryCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    paddingVertical: 32,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  summaryIconCircle: {
    marginBottom: 12,
  },
  summaryTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: 4,
  },
  summarySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 24,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 24,
  },
  summaryStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryStatValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
  },
  summaryStatLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
  },
  summaryStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  summaryDoneBtn: {
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  summaryDoneBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#000000',
    letterSpacing: 1.5,
  },
});

