import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import CheckInInbox from '../../components/dashboard/CheckInInbox';
import AccountabilityQueue from '../../components/dashboard/AccountabilityQueue';
import NewCoachSetupCards from '../../components/dashboard/NewCoachSetupCards';
import ExampleAtRiskCard from '../../components/dashboard/ExampleAtRiskCard';
import CardImage from '../../components/ui/CardImage';
import FirstClientOverlay from '../../components/coach/FirstClientOverlay';
import RollingNumber from '../../components/RollingNumber';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

// First-run flags (golden path for a brand-new coach).
const EXAMPLE_DISMISSED_KEY = 'coach_example_atrisk_dismissed';
const FIRST_CLIENT_CELEBRATED_KEY = 'coach_first_client_celebrated';

/**
 * Coach Home — design #1c "Calm timeline".
 *
 * Most restrained of the three directions: big date typography, the next
 * session called out, the rest of today as a light dot-and-line timeline,
 * a short "between sessions" action list built from real signals (quiet
 * athletes, unreplied check-ins, unread messages), and revenue tucked into
 * one line at the bottom. No launcher grid — the tab bar already covers
 * navigation. One accent (lime). Red/amber only for real status.
 */

export default function CoachHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trainer, clients, sessions, notifications, plans, workouts, loading } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const checkInsY = useRef(0);

  const activeClients = clients.filter(c => c.status !== 'inactive');
  const firstName = trainer?.name?.split(' ')[0] || 'Coach';
  const unreadNotifs = notifications.filter(n => !n.is_read).length;

  // ── Today's sessions, chronological ──────────────────────────────────────
  const todaysSessions = useMemo(() => {
    const now = new Date();
    return sessions
      .filter(s => {
        const d = new Date(s.date);
        return s.status !== 'cancelled' &&
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate();
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [sessions]);

  const nextSession = useMemo(() => {
    const now = Date.now();
    return (
      todaysSessions.find(s => s.status === 'upcoming' && new Date(s.date).getTime() >= now) ||
      todaysSessions.find(s => s.status === 'upcoming') ||
      null
    );
  }, [todaysSessions]);

  const restOfDay = useMemo(
    () => todaysSessions.filter(s => s.id !== nextSession?.id),
    [todaysSessions, nextSession]
  );

  // Monthly earnings (net, 90% after platform fee) — same calc as Earnings.
  const monthlyEarnings = useMemo(() => {
    let total = 0;
    plans.forEach(p => {
      const subs = activeClients.filter(c => c.plan_id === p.id).length;
      total += Number(p.price || 0) * subs * 0.9;
    });
    return total;
  }, [clients, plans]);

  // At-risk: no completed session (or no session at all since joining) in 7+ days.
  const atRiskClients = useMemo(() => {
    const AT_RISK_DAYS = 7;
    const now = Date.now();
    return activeClients
      .map(client => {
        const cs = sessions.filter(s => s.client_id === client.id && s.status === 'completed');
        const lastMs = cs.length === 0
          ? new Date(client.created_at).getTime()
          : Math.max(...cs.map(s => new Date(s.date).getTime()));
        return { client, daysSince: Math.floor((now - lastMs) / 86400000) };
      })
      .filter(({ daysSince }) => daysSince >= AT_RISK_DAYS);
  }, [activeClients, sessions]);

  // Unread message notifications — proxy for "waiting on a reply" until Home
  // has its own conversation-level query (Messages tab has the real one).
  const unreadMessages = useMemo(
    () => notifications.filter(n => n.type === 'message' && !n.is_read),
    [notifications]
  );

  // Check-ins waiting on a reply — lightweight count, mirrors CheckInInbox's query.
  const [pendingCheckIns, setPendingCheckIns] = useState(0);
  useEffect(() => {
    if (!trainer?.id) return;
    let cancelled = false;
    (async () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const { count } = await supabase
        .from('client_checkins')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', trainer.id)
        .not('submitted_at', 'is', null)
        .is('coach_replied_at', null)
        .gte('week_start', twoWeeksAgo.toISOString().split('T')[0]);
      if (!cancelled) setPendingCheckIns(count || 0);
    })();
    return () => { cancelled = true; };
  }, [trainer?.id]);

  const scrollToCheckIns = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(checkInsY.current - 20, 0), animated: true });
  }, []);

  // ── Golden path: example card dismissal (first-run only) ─────────────────
  // Hidden until the persisted flag is read so it never flashes for coaches
  // who already dismissed it.
  const [exampleDismissed, setExampleDismissed] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(EXAMPLE_DISMISSED_KEY)
      .then(v => setExampleDismissed(v === '1'))
      .catch(() => { /* keep hidden on read failure */ });
  }, []);
  const dismissExample = useCallback(() => {
    setExampleDismissed(true);
    AsyncStorage.setItem(EXAMPLE_DISMISSED_KEY, '1').catch(() => {});
  }, []);

  // ── Golden path: one-time celebration when the roster goes 0 → 1 ─────────
  // Only tracked after the initial fetch settles (`loading` false), so the
  // empty-array-then-populated hydration of an existing roster never fires it.
  const [celebratedName, setCelebratedName] = useState<string | null>(null);
  const prevClientCount = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    const count = clients.length;
    const prev = prevClientCount.current;
    prevClientCount.current = count;
    if (prev === 0 && count === 1) {
      const name = clients[0]?.name || 'Your first athlete';
      AsyncStorage.getItem(FIRST_CLIENT_CELEBRATED_KEY)
        .then(v => {
          if (v) return;
          AsyncStorage.setItem(FIRST_CLIENT_CELEBRATED_KEY, '1').catch(() => {});
          setCelebratedName(name);
        })
        .catch(() => {});
    }
  }, [loading, clients.length]);

  // ── Day-one empty state ──────────────────────────────────────────────────
  // No athletes, no sessions, no notifications yet — nothing to build a real
  // dashboard from. Show the setup checklist instead of empty charts.
  const isDayOne = activeClients.length === 0 && sessions.length === 0 && notifications.length === 0;

  if (isDayOne) {
    const dateLabel = new Date().toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric',
    });

    return (
      <View style={[emptyStyles.root, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={emptyStyles.header}>
            <View>
              <Text style={emptyStyles.dateText}>{dateLabel}</Text>
              <Text style={emptyStyles.welcomeText}>Welcome, {firstName}</Text>
            </View>
            <TouchableOpacity
              style={emptyStyles.avatarCircle}
              onPress={() => router.push('/(tabs)/profile')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Your profile"
            >
              <Text style={emptyStyles.avatarInitial}>{firstName[0]?.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>

          <View style={emptyStyles.section}>
            <TouchableOpacity
              style={emptyStyles.primaryCta}
              onPress={() => router.push('/add-client' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add your first client"
            >
              <CardImage source={require('../../assets/images/card-add-client.jpg')} />
              <View style={emptyStyles.primaryCtaPill}>
                <Text style={emptyStyles.primaryCtaText}>Add your first client</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={emptyStyles.section}>
            <NewCoachSetupCards />
          </View>

          <View style={emptyStyles.section}>
            <Text style={emptyStyles.sectionTitle}>Today</Text>
            <View style={emptyStyles.placeholderCard}>
              <Text style={emptyStyles.placeholderTitle}>Nothing booked yet.</Text>
              <Text style={emptyStyles.placeholderBody}>
                Once you have athletes, your sessions for the day show here with a join button.
              </Text>
            </View>
          </View>

          <View style={emptyStyles.section}>
            {!exampleDismissed ? (
              <ExampleAtRiskCard onDismiss={dismissExample} />
            ) : (
              <>
                <Text style={emptyStyles.sectionTitle}>Needs attention</Text>
                <View style={emptyStyles.placeholderCard}>
                  <Text style={emptyStyles.placeholderTitle}>This is where the app nudges you.</Text>
                  <Text style={emptyStyles.placeholderBody}>
                    Athletes going quiet, trials about to end, check-ins waiting on a reply.
                  </Text>
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            style={emptyStyles.libraryCard}
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/programs?tab=workouts' as any)}
            accessibilityRole="button"
            accessibilityLabel="Browse your workout and pass library"
          >
            <CardImage source={require('../../assets/images/card-new-workout.jpg')} />
            <Text style={emptyStyles.libraryLinkText}>Browse your workout and pass library →</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Populated dashboard — calm timeline ──────────────────────────────────
  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const monthDay = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long' });

  const subtitleParts: { text: string; danger?: boolean }[] = [
    { text: `${todaysSessions.length} session${todaysSessions.length === 1 ? '' : 's'}` },
  ];
  if (pendingCheckIns > 0) {
    subtitleParts.push({ text: `${pendingCheckIns} check-in${pendingCheckIns === 1 ? '' : 's'} waiting` });
  }
  if (atRiskClients.length > 0) {
    subtitleParts.push({ text: `${atRiskClients.length} athlete${atRiskClients.length === 1 ? '' : 's'} quiet`, danger: true });
  }

  type BetweenItem = { label: string; cta: string; onPress: () => void };
  const betweenItems: BetweenItem[] = [];
  if (atRiskClients.length > 0) {
    betweenItems.push({
      label: `Nudge ${atRiskClients.length} quiet athlete${atRiskClients.length === 1 ? '' : 's'}`,
      cta: 'Start',
      onPress: () => router.push('/(tabs)/clients'),
    });
  }
  if (pendingCheckIns > 0) {
    betweenItems.push({
      label: `Review ${pendingCheckIns} check-in${pendingCheckIns === 1 ? '' : 's'}`,
      cta: 'Open',
      onPress: scrollToCheckIns,
    });
  }
  if (unreadMessages.length > 0) {
    const label = unreadMessages.length === 1 && unreadMessages[0].title
      ? `Reply to ${unreadMessages[0].title.replace(/^New message from\s*/i, '')}`
      : `Reply to ${unreadMessages.length} conversations`;
    betweenItems.push({ label, cta: 'Reply', onPress: () => router.push('/(tabs)/messages') });
  }

  return (
    <View style={styles.root}>
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
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View>
            {/* Dynamic Type: the date is a tight single line sharing the header
                row with the icon buttons — shrink to fit rather than wrap. */}
            <Text style={styles.weekday} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{weekday}</Text>
            <Text style={styles.monthDay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{monthDay}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/notifications')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={unreadNotifs > 0 ? `Notifications, ${unreadNotifs} unread` : 'Notifications'}
            >
              <Ionicons name="notifications-outline" size={21} color={CoachColors.textSecondary} />
              {unreadNotifs > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatarCircle}
              onPress={() => router.push('/(tabs)/profile')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Your profile"
            >
              <Text style={styles.avatarInitial}>{firstName[0]?.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.subtitleRow}>
          {subtitleParts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Text style={styles.subtitleDot}> · </Text>}
              <Text style={[styles.subtitleText, part.danger && styles.subtitleDanger]}>{part.text}</Text>
            </React.Fragment>
          ))}
        </View>

        {/* ── NEXT SESSION ────────────────────────────────────────── */}
        {nextSession ? (
          <View style={styles.nextCard}>
            <View style={styles.nextHeaderRow}>
              <View style={styles.liveDot} />
              <Text style={styles.nextLabel}>
                {new Date(nextSession.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — up next
              </Text>
            </View>
            <Text style={styles.nextTitle}>
              {nextSession.group_name || clientName(clients, nextSession.client_id)} · {nextSession.type}
            </Text>
            {nextSession.notes ? <Text style={styles.nextSub}>{nextSession.notes}</Text> : null}
            <View style={styles.nextActions}>
              <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
                style={styles.joinBtn}
                activeOpacity={0.85}
                onPress={() => router.push(`/session/${nextSession.id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`Join session with ${nextSession.group_name || clientName(clients, nextSession.client_id)}`}
              >
                <Text style={styles.joinBtnText}>Join session</Text>
              </TouchableOpacity>
              {nextSession.client_id && (
                <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
                  style={styles.planBtn}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/client/${nextSession.client_id}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open plan for ${clientName(clients, nextSession.client_id)}`}
                >
                  <Text style={styles.planBtnText}>Plan</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.noSessionCard}>
            <CardImage
              source={require('../../assets/images/card-book-session.jpg')}
              extraShade={0.15}
            />
            <Text style={styles.noSessionText}>Nothing on the books today.</Text>
          </View>
        )}

        {/* ── REST OF TODAY — timeline ────────────────────────────── */}
        {restOfDay.length > 0 && (
          <View style={styles.timeline}>
            {restOfDay.map((s, i) => (
              <TouchableOpacity
                key={s.id}
                style={styles.timelineRow}
                activeOpacity={0.7}
                onPress={() => router.push(`/session/${s.id}` as any)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`${s.group_name || clientName(clients, s.client_id)}, ${new Date(s.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, ${s.type}. Double tap to open session`}
              >
                <View style={styles.timelineRail}>
                  <View style={styles.timelineDot} />
                  {i < restOfDay.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineBody}>
                  <Text style={styles.timelineTime}>
                    {new Date(s.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.timelineTitle}>
                    {s.group_name || clientName(clients, s.client_id)} · {s.type}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.divider} />

        {/* ── ACCOUNTABILITY QUEUE — today's slips, silences, wins ── */}
        <AccountabilityQueue />

        {/* ── BETWEEN SESSIONS ────────────────────────────────────── */}
        <Text style={styles.betweenLabel}>Between sessions</Text>
        {betweenItems.length > 0 ? (
          <View style={styles.betweenList}>
            {betweenItems.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.betweenRow}
                activeOpacity={0.7}
                onPress={item.onPress}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}. Double tap to ${item.cta.toLowerCase()}`}
              >
                <Text style={styles.betweenText}>{item.label}</Text>
                <Text style={styles.betweenCta}>{item.cta} →</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.betweenEmpty}>Nothing waiting on you right now.</Text>
        )}

        {/* ── REVENUE + PASSES — one line each, demoted ───────────── */}
        <View style={styles.footerCards}>
          <TouchableOpacity
            style={styles.revenueCard}
            activeOpacity={0.8}
            onPress={() => router.push('/earnings')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${monthLabel} revenue, $${monthlyEarnings.toFixed(0)}, ${activeClients.length} active athletes. Double tap to open earnings`}
          >
            <View>
              <Text style={styles.revenueMonth}>{monthLabel}</Text>
              <View style={styles.revenueValueRow}>
                <RollingNumber
                  text={`$${monthlyEarnings.toFixed(0)}`}
                  style={styles.revenueValue}
                />
                <Text style={styles.revenueValue} numberOfLines={1}> · {activeClients.length} active</Text>
              </View>
            </View>
            <Text style={styles.revenueLink}>Revenue →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.revenueCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/programs' as any)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${plans.length} pass${plans.length === 1 ? '' : 'es'}, ${activeClients.filter(c => c.plan_id).length} athlete${activeClients.filter(c => c.plan_id).length === 1 ? '' : 's'} holding one. Double tap to manage passes`}
          >
            <View style={styles.footerLeft}>
              <View style={styles.footerThumb}>
                <CardImage
                  source={require('../../assets/images/card-season-pass.jpg')}
                  scrim="none"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.revenueMonth}>{plans.length} pass{plans.length === 1 ? '' : 'es'}</Text>
                <Text style={styles.revenueValue}>
                  {activeClients.filter(c => c.plan_id).length} athlete{activeClients.filter(c => c.plan_id).length === 1 ? '' : 's'} holding one
                </Text>
              </View>
            </View>
            <Text style={styles.revenueLink}>Manage →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.revenueCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/programs?tab=workouts' as any)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Library, ${workouts.length} workout${workouts.length === 1 ? '' : 's'} on file. Double tap to browse`}
          >
            <View style={styles.footerLeft}>
              <View style={styles.footerThumb}>
                <CardImage
                  source={require('../../assets/images/card-new-workout.jpg')}
                  scrim="none"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.revenueMonth}>Library</Text>
                <Text style={styles.revenueValue}>
                  {workouts.length} workout{workouts.length === 1 ? '' : 's'} on file
                </Text>
              </View>
            </View>
            <Text style={styles.revenueLink}>Browse →</Text>
          </TouchableOpacity>
        </View>

        {/* ── CHECK-IN INBOX — full detail, scrolled to from above ────── */}
        {trainer?.id && (
          <View onLayout={e => { checkInsY.current = e.nativeEvent.layout.y; }}>
            <CheckInInbox trainerId={trainer.id} />
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* One-time first-client celebration (flag set before this renders). */}
      {celebratedName !== null && (
        <FirstClientOverlay
          clientName={celebratedName}
          onDone={() => setCelebratedName(null)}
        />
      )}
    </View>
  );
}

function clientName(clients: { id: string; name: string }[], clientId?: string): string {
  if (!clientId) return 'Athlete';
  return clients.find(c => c.id === clientId)?.name || 'Athlete';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  weekday: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 33.5,
    color: CoachColors.textPrimary,
    lineHeight: 38,
  },
  monthDay: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 33.5,
    color: CoachColors.textFaint,
    lineHeight: 38,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3, right: -3,
    // minHeight, not height: the count inside scales with Dynamic Type and
    // would be clipped by a hard 16pt box at large text sizes.
    minWidth: 16, minHeight: 16, borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: CoachColors.bg,
  },
  badgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.onAccent,
  },
  avatarCircle: {
    width: 38, height: 38, borderRadius: 19, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15.5,
    color: CoachColors.onAccent,
  },

  subtitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  subtitleText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
  },
  subtitleDanger: {
    color: CoachColors.danger,
    fontFamily: CoachFonts.bodySemiBold,
  },
  subtitleDot: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textFaint,
  },

  // Next session
  nextCard: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 18,
  },
  nextHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: {
    width: 7, height: 7, borderRadius: 3.5, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  nextLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.accent,
  },
  nextTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 21.5,
    color: CoachColors.textPrimary,
    marginTop: 8,
  },
  nextSub: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    marginTop: 4,
    lineHeight: 20,
  },
  nextActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  joinBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  joinBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15,
    color: CoachColors.onAccent,
  },
  planBtn: {
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  planBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },

  // Image-backed quiet state (CardImage fills; text sits on the bottom scrim).
  noSessionCard: {
    marginHorizontal: 20,
    marginTop: 24,
    height: 120,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 16,
  },
  noSessionText: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    // Primary (not muted) because it sits over imagery — keeps ≥4.5:1 on the scrim.
    color: CoachColors.textPrimary,
  },

  // Timeline
  timeline: {
    marginHorizontal: 20,
    marginTop: 18,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineRail: {
    alignItems: 'center',
    width: 10,
  },
  timelineDot: {
    width: 8, height: 8, borderRadius: 4, borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: CoachColors.textFaint,
    marginTop: 5,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: CoachColors.borderMuted,
    marginTop: 4,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: 16,
  },
  timelineTime: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },
  timelineTitle: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textPrimary,
    marginTop: 2,
  },

  divider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 18,
  },

  // Between sessions
  betweenLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    color: CoachColors.textFaint,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  betweenList: {
    paddingHorizontal: 20,
    gap: 14,
  },
  betweenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  betweenText: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
    flex: 1,
    marginRight: 12,
  },
  betweenCta: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
  betweenEmpty: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textFaint,
    paddingHorizontal: 20,
  },

  // Revenue + Passes
  footerCards: {
    marginHorizontal: 20,
    marginTop: 24,
    gap: 10,
  },
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    // 14 was off the radius scale — migrated to the 16 card stop while touching.
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  footerThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  revenueMonth: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textFaint,
  },
  revenueValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  revenueValue: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  revenueLink: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
});

// ── Day-one empty state styles ──────────────────────────────────────────────
const emptyStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  dateText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
  },
  welcomeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 27,
    color: CoachColors.textPrimary,
    marginTop: 2,
  },
  avatarCircle: {
    width: 38, height: 38, borderRadius: 19, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 18,
    color: CoachColors.onAccent,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 22,
  },
  // Image-backed hero CTA: CardImage fills the rounded clip; the lime pill
  // rides on top so the call to action keeps its accent punch.
  primaryCta: {
    height: 150,
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    padding: 16,
  },
  primaryCtaPill: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 17,
    color: CoachColors.onAccent,
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginBottom: 11,
  },
  placeholderCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderStyle: 'dashed',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 18,
  },
  placeholderTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  placeholderBody: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    marginTop: 4,
    lineHeight: 20,
  },
  // Image-backed library shortcut; label sits on the bottom scrim.
  libraryCard: {
    marginHorizontal: 20,
    marginTop: 22,
    height: 96,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 16,
  },
  libraryLinkText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
});
