import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useClient } from '../../context/ClientContext';
import { supabase } from '../../lib/supabase';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { calculateLevel, calculateProgressToNextLevel } from '../../utils/xp';
import { ClientRoute } from '../../types/routes';
import type { TrackNode } from '../../context/AppContext';

// Pass section components
import { PassMembershipCard } from '../../components/client-tabs/pass/PassMembershipCard';
import { PassQuickStats } from '../../components/client-tabs/pass/PassQuickStats';
import PassStreakCalendar from '../../components/client-tabs/pass/PassStreakCalendar';
import PassDailyQuests from '../../components/client-tabs/pass/PassDailyQuests';
import { PassSeasonBanner } from '../../components/client-tabs/pass/PassSeasonBanner';
import PassJourneyTrack from '../../components/client-tabs/pass/PassJourneyTrack';
import { PassTrophyCabinet } from '../../components/client-tabs/pass/PassTrophyCabinet';
import PassHowItWorks from '../../components/client-tabs/pass/PassHowItWorks';

export default function MyPassScreen() {
  const router = useRouter();
  const {
    clientData,
    plans,
    workouts,
    diets,
    trainer,
    todayWorkout,
    mealLogs,
    activeGymVisit,
  } = useClient();
  const [claiming, setClaiming] = useState<string | null>(null);

  // ──── Derived data ────
  const activePlan = useMemo(() => {
    if (!clientData || !clientData.plan_id) return null;
    return plans.find((p: any) => p.id === clientData.plan_id) || null;
  }, [clientData, plans]);

  const currentXp = clientData?.xp || 0;
  const currentLevel = calculateLevel(currentXp);
  const progressPct = calculateProgressToNextLevel(currentXp);
  const currentStreak = clientData?.progress?.streak || 0;
  const workoutsThisMonth = clientData?.progress?.workoutsThisMonth || 0;
  const totalWorkouts = clientData?.completed_workouts || 0;

  // Days since member
  const memberSinceDays = useMemo(() => {
    if (!clientData?.created_at) return 0;
    const created = new Date(clientData.created_at);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  }, [clientData]);

  // Demo fallback plan if no active plan
  const effectivePlan = useMemo(() => {
    return activePlan || {
      id: 'demo-plan',
      name: 'Pro Athletic Pass (Demo)',
      track: [
        { order: 1, type: 'workout', label: 'Foundation Strength Lifts' },
        { order: 2, type: 'diet', label: 'High-Protein Recovery Plan' },
        { order: 3, type: 'milestone', label: 'Milestone: Level 3 Mastery' },
        { order: 4, type: 'class', label: 'Somatic Yoga Flow' },
      ],
    };
  }, [activePlan]);

  const isDemo = !activePlan;

  const trackNodes = useMemo(() => {
    if (!effectivePlan || !effectivePlan.track) return [] as TrackNode[];
    return [...effectivePlan.track].sort((a: TrackNode, b: TrackNode) => a.order - b.order);
  }, [effectivePlan]);

  // Track progress
  const unlockedNodes = useMemo(() => {
    return trackNodes.filter((_: TrackNode, i: number) => currentLevel >= i + 2).length;
  }, [trackNodes, currentLevel]);

  const trackProgress = trackNodes.length > 0 ? unlockedNodes / trackNodes.length : 0;

  // Today's meal log count
  const mealLogsCount = useMemo(() => {
    return Object.keys(mealLogs).length;
  }, [mealLogs]);

  // Claim Reward Modal State
  const [claimedReward, setClaimedReward] = useState<{ title: string; type: string } | null>(null);

  // ──── Handlers ────
  const handleClaim = async (node: TrackNode) => {
    if (!clientData || claiming) return;
    setClaiming(`${node.type}-${node.id}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const today = new Date().toISOString().split('T')[0];

      if (node.type === 'workout' && node.id) {
        const { error } = await supabase.from('client_workouts').insert({
          client_id: clientData.id,
          workout_id: node.id,
          assigned_date: today,
          status: 'assigned',
        });
        if (error) throw error;
      } else if (node.type === 'diet' && node.id) {
        const { error } = await supabase.from('client_diets').insert({
          client_id: clientData.id,
          diet_plan_id: node.id,
          assigned_date: today,
          status: 'assigned',
        });
        if (error) throw error;
      }

      setClaimedReward({
        title: node.label || (node.type === 'workout' ? 'Workout Routine' : 'Diet Plan'),
        type: node.type.toUpperCase(),
        nodeId: node.id,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to claim reward');
    } finally {
      setClaiming(null);
    }
  };

  const handleSelectNode = (node: TrackNode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (node.type === 'workout') {
      router.push({
        pathname: ClientRoute.strengthSession,
        params: { sessionId: node.id || 'posterior-pump' },
      });
    } else if (node.type === 'diet') {
      router.push(ClientRoute.myDiet);
    }
  };

  if (!clientData) return null;

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <View>
          <Text style={st.tagHeader}>FITLINK // SEASON PASS</Text>
          <Text style={st.title}>Pass</Text>
        </View>
        <View style={st.headerRight}>
          {currentStreak > 0 && (
            <View style={st.streakPill}>
              <Text style={st.streakPillText}>{currentStreak}🔥</Text>
            </View>
          )}
          <View style={st.xpPill}>
            <Ionicons name="flash" size={12} color="#FFD700" />
            <Text style={st.xpPillText}>{currentXp} XP</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.scrollContent}
      >
        {/* Demo Mode Banner */}
        {isDemo && (
          <TouchableOpacity
            style={st.demoBanner}
            onPress={() => router.push(ClientRoute.workouts)}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={16} color="#FFD700" />
            <View style={{ flex: 1 }}>
              <Text style={st.demoTitle}>DEMO PASS PREVIEW</Text>
              <Text style={st.demoSub}>Subscribe to a coach plan to unlock your custom track.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FFD700" />
          </TouchableOpacity>
        )}

        {/* § 1 — Membership Card */}
        <PassMembershipCard
          clientName={clientData.name}
          avatarUrl={clientData.avatar_url}
          memberSince={clientData.created_at}
          totalWorkouts={totalWorkouts}
          totalXp={currentXp}
          currentStreak={currentStreak}
          currentLevel={currentLevel}
          planName={effectivePlan.name}
          coachName={trainer?.name}
        />

        {/* § 2 — Quick Stats Bar */}
        <View style={st.section}>
          <PassQuickStats
            level={currentLevel}
            streak={currentStreak}
            workoutsThisMonth={workoutsThisMonth}
            totalXp={currentXp}
            progressToNextLevel={progressPct}
          />
        </View>

        {/* § 3 — Streak & Activity Calendar */}
        <View style={st.section}>
          <PassStreakCalendar
            currentStreak={currentStreak}
            workouts={workouts}
            mealLogs={mealLogs}
          />
        </View>

        {/* § 4 — Daily Quests */}
        <View style={st.section}>
          <PassDailyQuests
            todayWorkout={todayWorkout}
            mealLogsCount={mealLogsCount}
            hasGymVisit={!!activeGymVisit}
          />
        </View>

        {/* § 5 — Season Banner */}
        <View style={st.section}>
          <PassSeasonBanner
            trackProgress={trackProgress}
            totalNodes={trackNodes.length}
            unlockedNodes={unlockedNodes}
            currentLevel={currentLevel}
          />
        </View>

        {/* § 6 — Journey Track */}
        {trackNodes.length > 0 && (
          <View style={st.section}>
            <PassJourneyTrack
              trackNodes={trackNodes}
              currentLevel={currentLevel}
              workouts={workouts}
              diets={diets}
              onClaim={handleClaim}
              onSelectNode={handleSelectNode}
              claiming={claiming}
            />
          </View>
        )}

        {/* § 7 — Trophy Cabinet */}
        <View style={st.section}>
          <PassTrophyCabinet
            totalWorkouts={totalWorkouts}
            currentStreak={currentStreak}
            bestStreak={currentStreak}
            totalXp={currentXp}
            currentLevel={currentLevel}
            memberSinceDays={memberSinceDays}
            gymVisits={totalWorkouts}
          />
        </View>

        {/* § 8 — How It Works (collapsible) */}
        <View style={st.section}>
          <PassHowItWorks />
        </View>

        {/* Bottom spacer */}
        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>

      {/* Reward Claim Celebration Modal */}
      <Modal
        visible={!!claimedReward}
        transparent
        animationType="fade"
        onRequestClose={() => setClaimedReward(null)}
      >
        {claimedReward && (
          <View style={st.claimOverlay}>
            <View style={st.claimCard}>
              <View style={st.claimIconCircle}>
                <Ionicons name="trophy" size={44} color="#FFD700" />
              </View>
              <Text style={st.claimTag}>{claimedReward.type} REWARD UNLOCKED</Text>
              <Text style={st.claimTitle}>{claimedReward.title}</Text>
              <Text style={st.claimSub}>
                This reward has been added to your active daily queue.
              </Text>

              {claimedReward.type === 'WORKOUT' && (
                <TouchableOpacity
                  style={[st.claimDoneBtn, { backgroundColor: '#FFD700', marginBottom: 10 }]}
                  onPress={() => {
                    setClaimedReward(null);
                    router.push({ pathname: ClientRoute.strengthSession, params: { sessionId: (claimedReward as any).nodeId || 'posterior-pump' } });
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[st.claimDoneText, { color: '#000000' }]}>VIEW ROUTINE NOW</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={st.claimDoneBtn}
                onPress={() => setClaimedReward(null)}
                activeOpacity={0.85}
              >
                <Text style={st.claimDoneText}>CONTINUE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
  },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize['2xl'],
    color: '#FFFFFF',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  streakPill: {
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  streakPillText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#FF6B35',
  },
  xpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  xpPillText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#FFD700',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  section: {
    marginTop: Spacing.lg,
  },
  // ──── Empty state ────
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.xl,
    color: '#FFFFFF',
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 22,
  },
  // Demo mode banner
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',
    borderRadius: Radius.xs,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  demoTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFD700',
    letterSpacing: 1.5,
  },
  demoSub: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  // Claim modal
  claimOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  claimCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
    paddingVertical: 32,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  claimIconCircle: {
    marginBottom: 12,
  },
  claimTag: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: '#FFD700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  claimTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  claimSub: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  claimDoneBtn: {
    backgroundColor: '#FFD700',
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  claimDoneText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
    letterSpacing: 1.5,
  },
});
