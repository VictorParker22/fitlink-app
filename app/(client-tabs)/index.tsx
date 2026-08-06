import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import GreetingHeader from '../../components/client-tabs/home/GreetingHeader';
import CoachPulse from '../../components/client-tabs/home/CoachPulse';
import ContextHeroCard from '../../components/client-tabs/home/ContextHeroCard';
import DashboardSummaryCard from '../../components/client-tabs/home/DashboardSummaryCard';
import { Spacing } from '../../constants/theme';

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
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
    skipTrackWorkout,
  } = useClient();

  const [refreshing, setRefreshing] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const scrollY = useSharedValue(0);
  const scrollViewRef = useRef<any>(null);

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

  return (
    <View style={st.container}>
      {/* Loading overlay */}
      {loading && (
        <View style={st.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}

      {/* Sticky Blur Header */}
      <Animated.View style={[st.header, { paddingTop: insets.top }]}>
        <Animated.View style={[StyleSheet.absoluteFill, headerBgStyle]}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollViewRef}
        style={st.scrollView}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 160,
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
        {/* ① TOP BAR */}
        <GreetingHeader
          clientName={clientName}
          timeOfDay={timeOfDay}
          unreadCount={0}
        />

        {/* ② SUMMARY CARD (Rings + Streak) */}
        <DashboardSummaryCard
          completedDays={completedDays}
          todayIdx={new Date().getDay() === 0 ? 6 : new Date().getDay() - 1}
        />

        {/* ③ TODAY'S WORKOUT HERO */}
        <ContextHeroCard
          todayWorkout={todayWorkout}
          isCompleted={isWorkoutCompletedToday}
          trainerName={trainer?.name}
          habitsDone={0}
          onSkip={skipTrackWorkout}
        />

        {/* ④ COACH PULSE */}
        <CoachPulse trainer={trainer} isOnline={!!trainer?.is_online} />
      </Animated.ScrollView>
    </View>
  );
}


const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
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
});

