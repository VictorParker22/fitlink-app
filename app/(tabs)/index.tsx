import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import CheckInInbox from '../../components/dashboard/CheckInInbox';
import NewCoachSetupCards from '../../components/dashboard/NewCoachSetupCards';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

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
  const { trainer, clients, sessions, notifications, plans, workouts } = useApp();
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
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
            <Text style={emptyStyles.sectionTitle}>Needs attention</Text>
            <View style={emptyStyles.placeholderCard}>
              <Text style={emptyStyles.placeholderTitle}>This is where the app nudges you.</Text>
              <Text style={emptyStyles.placeholderBody}>
                Athletes going quiet, trials about to end, check-ins waiting on a reply.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={emptyStyles.libraryLink}
            activeOpacity={0.7}
            onPress={() => router.push('/(tabs)/programs?tab=workouts' as any)}
          >
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
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ──────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View>
            <Text style={styles.weekday}>{weekday}</Text>
            <Text style={styles.monthDay}>{monthDay}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/notifications')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={unreadNotifs > 0 ? `Notifications, ${unreadNotifs} unread` : 'Notifications'}
            >
              <Ionicons name="notifications-outline" size={19} color={CoachColors.textSecondary} />
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
              <TouchableOpacity
                style={styles.joinBtn}
                activeOpacity={0.85}
                onPress={() => router.push(`/session/${nextSession.id}` as any)}
              >
                <Text style={styles.joinBtnText}>Join session</Text>
              </TouchableOpacity>
              {nextSession.client_id && (
                <TouchableOpacity
                  style={styles.planBtn}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/client/${nextSession.client_id}` as any)}
                >
                  <Text style={styles.planBtnText}>Plan</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.noSessionCard}>
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
          >
            <View>
              <Text style={styles.revenueMonth}>{monthLabel}</Text>
              <Text style={styles.revenueValue}>
                ${monthlyEarnings.toFixed(0)} · {activeClients.length} active
              </Text>
            </View>
            <Text style={styles.revenueLink}>Revenue →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.revenueCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/programs' as any)}
          >
            <View>
              <Text style={styles.revenueMonth}>{plans.length} pass{plans.length === 1 ? '' : 'es'}</Text>
              <Text style={styles.revenueValue}>
                {activeClients.filter(c => c.plan_id).length} athlete{activeClients.filter(c => c.plan_id).length === 1 ? '' : 's'} holding one
              </Text>
            </View>
            <Text style={styles.revenueLink}>Manage →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.revenueCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/programs?tab=workouts' as any)}
          >
            <View>
              <Text style={styles.revenueMonth}>Library</Text>
              <Text style={styles.revenueValue}>
                {workouts.length} workout{workouts.length === 1 ? '' : 's'} on file
              </Text>
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
    fontSize: 30,
    color: CoachColors.textPrimary,
    lineHeight: 34,
  },
  monthDay: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 30,
    color: CoachColors.textFaint,
    lineHeight: 34,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3, right: -3,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: CoachColors.bg,
  },
  badgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.onAccent,
  },
  avatarCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14,
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
    fontSize: 13,
    color: CoachColors.textMuted,
  },
  subtitleDanger: {
    color: CoachColors.danger,
    fontFamily: CoachFonts.bodySemiBold,
  },
  subtitleDot: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
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
    padding: 18,
  },
  nextHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: CoachColors.accent,
  },
  nextLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.accent,
  },
  nextTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 19,
    color: CoachColors.textPrimary,
    marginTop: 8,
  },
  nextSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  nextActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  joinBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  joinBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    color: CoachColors.onAccent,
  },
  planBtn: {
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  planBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },

  noSessionCard: {
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 20,
  },
  noSessionText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
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
    width: 8, height: 8, borderRadius: 4,
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
    fontSize: 12.5,
    color: CoachColors.textSecondary,
  },
  timelineTitle: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
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
    fontSize: 11.5,
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
    fontSize: 14,
    color: CoachColors.textPrimary,
    flex: 1,
    marginRight: 12,
  },
  betweenCta: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    color: CoachColors.accent,
  },
  betweenEmpty: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
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
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  revenueMonth: {
    fontFamily: CoachFonts.body,
    fontSize: 11.5,
    color: CoachColors.textFaint,
  },
  revenueValue: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    marginTop: 2,
  },
  revenueLink: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
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
    fontSize: 13,
    color: CoachColors.textMuted,
  },
  welcomeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24,
    color: CoachColors.textPrimary,
    marginTop: 2,
  },
  avatarCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 16,
    color: CoachColors.onAccent,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 22,
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    marginBottom: 11,
  },
  placeholderCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 18,
  },
  placeholderTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },
  placeholderBody: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  libraryLink: {
    paddingHorizontal: 20,
    marginTop: 22,
  },
  libraryLinkText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    color: CoachColors.accent,
  },
});
