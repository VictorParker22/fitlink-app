import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRenderCount } from '../../lib/devRenderCount';
import { StatusBar } from 'expo-status-bar';
import AccountabilityQueue from '../../components/dashboard/AccountabilityQueue';
import GlobalSearchModal from '../../components/dashboard/GlobalSearchModal';
import AICoachModal from '../../components/dashboard/AICoachModal';
import CoachElitePaywall from '../../components/paywalls/CoachElitePaywall';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { RosterHeatmap } from '../../components/coach/RosterHeatmap';
import HomeModeGate from '../../components/dashboard/home/HomeModeGate';
import DayOneHome from '../../components/dashboard/home/DayOneHome';
import HomeHeader from '../../components/dashboard/home/HomeHeader';
import HomeSubtitle from '../../components/dashboard/home/HomeSubtitle';
import TodaySessions from '../../components/dashboard/home/TodaySessions';
import BetweenSessions from '../../components/dashboard/home/BetweenSessions';
import FooterCards from '../../components/dashboard/home/FooterCards';
import CheckInInboxSection from '../../components/dashboard/home/CheckInInboxSection';
import PendingCheckInsSync from '../../components/dashboard/home/PendingCheckInsSync';
import FirstClientCelebration from '../../components/dashboard/home/FirstClientCelebration';
import { CoachColors } from '../../constants/coachDesign';

/**
 * Coach Home — design #1c "Calm timeline".
 *
 * Most restrained of the three directions: big date typography, the next
 * session called out, the rest of today as a light dot-and-line timeline,
 * a short "between sessions" action list built from real signals (quiet
 * athletes, unreplied check-ins, unread messages), and revenue tucked into
 * one line at the bottom. No launcher grid — the tab bar already covers
 * navigation. One accent (lime). Red/amber only for real status.
 *
 * The shell reads NO AppContext slice. It owns navigation, the scroller,
 * modal state and layout; every section under components/dashboard/home is
 * a React.memo that subscribes to just the slice(s) it renders from, so a
 * realtime notification redraws the header badge and not the timeline.
 */

export default function CoachHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useRenderCount('CoachHomeScreen');
  const scrollRef = useRef<ScrollView>(null);
  const checkInsY = useRef(0);
  const [showSearch, setShowSearch] = useState(false);
  const [showAICoach, setShowAICoach] = useState(false);
  const [showElitePaywall, setShowElitePaywall] = useState(false);
  // AI assistant is Elite (paid inference; also enforced server-side with a
  // 402 in coach-assistant). Non-elite taps route to the paywall instead.
  const { isCoachElite } = useRevenueCat();

  // Check-ins waiting on a reply — fetched once by PendingCheckInsSync and
  // shared with the subtitle and "Between sessions" rows as a number.
  const [pendingCheckIns, setPendingCheckIns] = useState(0);

  const scrollToCheckIns = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(checkInsY.current - 20, 0), animated: true });
  }, []);
  const onCheckInsLayout = useCallback((e: LayoutChangeEvent) => {
    checkInsY.current = e.nativeEvent.layout.y;
  }, []);

  // Stable handlers so the memoised sections never re-render for the shell.
  const openSearch = useCallback(() => setShowSearch(true), []);
  const openAssistant = useCallback(
    () => (isCoachElite ? setShowAICoach(true) : setShowElitePaywall(true)),
    [isCoachElite]
  );
  const openNotifications = useCallback(() => router.push('/notifications'), [router]);
  const openProfile = useCallback(() => router.push('/(tabs)/profile'), [router]);
  const openAddClient = useCallback(() => router.push('/add-client' as any), [router]);
  const openLibrary = useCallback(() => router.push('/(tabs)/programs?tab=workouts' as any), [router]);

  return (
    <View style={styles.root}>
      <HomeModeGate
        // ── Day-one empty state ──────────────────────────────────────────
        dayOne={
          <DayOneHome
            paddingTop={insets.top}
            paddingBottom={insets.bottom + 130}
            onOpenProfile={openProfile}
            onAddClient={openAddClient}
            onBrowseLibrary={openLibrary}
          />
        }
        // ── Populated dashboard — calm timeline ──────────────────────────
        populated={
          <>
            <StatusBar style="light" />
            {/* CheckInInbox renders a multiline reply field + Send button inside this
                scroller, so the whole dashboard needs the keyboard treatment:
                - KAV lifts the focused reply field clear of the keyboard,
                - keyboardShouldPersistTaps lets the Send button fire on the first tap
                  instead of being swallowed by the keyboard dismissal. */}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── HEADER ──────────────────────────────────────────────── */}
              <HomeHeader
                paddingTop={insets.top + 12}
                onSearch={openSearch}
                onAssistant={openAssistant}
                onNotifications={openNotifications}
                onProfile={openProfile}
              />
              <HomeSubtitle pendingCheckIns={pendingCheckIns} />

              {/* ── NEXT SESSION + REST OF TODAY ────────────────────────── */}
              <TodaySessions />

              <View style={styles.divider} />

              {/* ── ACCOUNTABILITY QUEUE — today's slips, silences, wins ── */}
              <AccountabilityQueue />

              {/* ── ROSTER HEATMAP — week-at-a-glance activity per athlete ── */}
              <RosterHeatmap />

              {/* ── BETWEEN SESSIONS ────────────────────────────────────── */}
              <BetweenSessions pendingCheckIns={pendingCheckIns} onReviewCheckIns={scrollToCheckIns} />

              {/* ── REVENUE + PASSES — one line each, demoted ───────────── */}
              <FooterCards />

              {/* ── CHECK-IN INBOX — full detail, scrolled to from above ────── */}
              <CheckInInboxSection onLayout={onCheckInsLayout} />
            </ScrollView>
            </KeyboardAvoidingView>

            <GlobalSearchModal visible={showSearch} onClose={() => setShowSearch(false)} />
            <AICoachModal visible={showAICoach} onClose={() => setShowAICoach(false)} />
            <CoachElitePaywall
              visible={showElitePaywall}
              onClose={() => setShowElitePaywall(false)}
              onSuccess={() => { setShowElitePaywall(false); setShowAICoach(true); }}
            />
          </>
        }
      />

      {/* Mounted in both modes, like the effects they replaced: the check-in
          count is fetched as soon as the trainer id lands, and the 0 → 1
          roster transition is watched while the day-one checklist is up. */}
      <PendingCheckInsSync onCount={setPendingCheckIns} />
      <FirstClientCelebration />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },

  divider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 18,
  },
});
