/**
 * My Sessions — Client Booking Management
 *
 * The screen the client sees after sending a booking request.
 * Shows: upcoming confirmed sessions and past sessions.
 * Design: Editorial precision — week calendar strip + session cards.
 *
 * Sessions are scheduled by the coach — there is no athlete-initiated
 * booking path, so this screen only ever reads.
 *
 * Data source:
 *   - `sessions` table: trainer-confirmed sessions (client_id match)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import BoltEmptyState from '../../components/mascot/BoltEmptyState';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { ClientRoute } from '../../types/routes';

const { width: SW } = Dimensions.get('window');
const DAY_W = (SW - 32 - 48) / 7;

// ─── Types ─────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  date: string;
  duration: number;
  type: '1-on-1' | 'Group' | 'Virtual';
  status: 'upcoming' | 'completed' | 'cancelled';
  notes?: string;
  trainer?: {
    name: string;
    avatar_url: string;
    role?: string;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_COLORS: Record<string, string> = {
  '1-on-1':    CoachColors.textSecondary,
  'Group':     CoachColors.textSecondary,
  'Virtual':   CoachColors.textSecondary,
  'Assessment': CoachColors.textSecondary,
};

const STATUS_CONFIG = {
  upcoming:  { label: 'UPCOMING',  color: CoachColors.accent,        bg: CoachColors.accentSoft  },
  completed: { label: 'DONE',      color: CoachColors.textSecondary, bg: CoachColors.borderMuted },
  cancelled: { label: 'CANCELLED', color: CoachColors.danger,        bg: CoachColors.dangerSoft  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeek(anchor: Date): Date[] {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day;
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Session Card ────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: Session }) {
  const typeColor = TYPE_COLORS[session.type] || CoachColors.textSecondary;
  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.upcoming;
  const dt = new Date(session.date);
  const endDt = new Date(dt.getTime() + session.duration * 60000);

  return (
    <View style={s.sessionCard}>
      {/* Left accent bar */}
      <View style={s.accentBar} />

      {/* Time column */}
      <View style={s.timeCol}>
        <Text style={s.timeStart}>{formatTime(session.date)}</Text>
        <Text style={s.timeEnd}>
          {endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </Text>
      </View>

      <View style={s.timeDivider} />

      {/* Main body */}
      <View style={s.cardBody}>
        {/* Top row: type badge + status */}
        <View style={s.cardTopRow}>
          <View style={[s.typeBadge, { borderColor: typeColor }]}>
            <Text style={[s.typeBadgeText, { color: typeColor }]}>
              {session.type.toUpperCase()}
            </Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[s.statusBadgeText, { color: statusCfg.color }]}>
              {statusCfg.label}
            </Text>
          </View>
        </View>

        {/* Coach row */}
        <View style={s.coachRow}>
          {session.trainer?.avatar_url ? (
            <Image
              source={{ uri: session.trainer.avatar_url }}
              style={s.coachAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={s.coachAvatarPlaceholder}>
              <Ionicons name="person" size={16} color={CoachColors.textMuted} />
            </View>
          )}
          <View style={s.coachInfo}>
            <Text style={s.coachName}>
              {session.trainer?.name || 'Your Coach'}
            </Text>
            <Text style={s.sessionMeta}>
              {session.duration} min · {formatDate(session.date)}
            </Text>
          </View>
        </View>

        {/* Notes preview */}
        {!!session.notes && (
          <Text style={s.notesPreview} numberOfLines={1}>
            "{session.notes}"
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({
  coachName,
  onFindCoach,
  onMessageCoach,
}: {
  coachName: string | null;
  onFindCoach: () => void;
  onMessageCoach: () => void;
}) {
  // With a coach: sessions exist, they are just not on the calendar yet.
  // Booking happens on the coach's side, so the only real next step is a message.
  if (coachName) {
    return (
      <BoltEmptyState
        pose="welcome"
        title="No sessions on the calendar"
        subtitle={`Sessions are scheduled by ${coachName}. A message is how one gets on the calendar.`}
        actionLabel={`Message ${coachName}`}
        onAction={onMessageCoach}
      />
    );
  }
  return (
    <BoltEmptyState
      pose="welcome"
      title="No sessions yet"
      subtitle="Sessions land here once a coach takes you on."
      actionLabel="Find a coach"
      onAction={onFindCoach}
    />
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function MySessionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clientData, trainer } = useClient();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [selectedDate, setSelectedDate] = useState(new Date());

  // First name only — matches the copy SessionsCard uses on Today.
  const coachFirst = (trainer?.name || '').split(' ')[0] || null;

  const weekDays = useMemo(() => getWeek(selectedDate), [selectedDate]);
  const today = new Date();

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!clientData?.id) return;

    try {
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('*, trainers:trainer_id(name, avatar_url)')
        .eq('client_id', clientData.id)
        .order('date', { ascending: false });

      if (sessionData) {
        setSessions(
          sessionData.map((s: any) => ({
            ...s,
            trainer: s.trainers || trainer,
          }))
        );
      }
    } catch (err) {
      // The table may be unreadable — show the empty state gracefully
      console.log('[MySessionsScreen] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientData?.id, trainer]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const shiftWeek = (dir: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir * 7);
    setSelectedDate(d);
  };

  // ── Filtered data ──────────────────────────────────────────────────────────
  const upcomingSessions = sessions.filter((s) => s.status === 'upcoming');
  const pastSessions = sessions.filter((s) => s.status !== 'upcoming');

  // Sessions on selected day (for calendar view)
  const daySessions = useMemo(
    () =>
      sessions.filter((s) => isSameDay(new Date(s.date), selectedDate)),
    [sessions, selectedDate]
  );

  // Count sessions per week day for dots
  const sessionCountByDay = useMemo(() => {
    const map: Record<string, number> = {};
    weekDays.forEach((d) => {
      const key = d.toDateString();
      map[key] = sessions.filter((s) => isSameDay(new Date(s.date), d)).length;
    });
    return map;
  }, [weekDays, sessions]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // Only gate on the spinner when there is truly nothing to show yet — once
  // data (fresh or cached) exists, render it and refresh silently.
  if (loading && sessions.length === 0) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={CoachColors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const hasAnyData = sessions.length > 0;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={25} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.headerTag}>COACHING</Text>
          <Text style={s.headerTitle}>My Sessions</Text>
        </View>
      </View>

      {/* ── Calendar strip ──────────────────────────────────────────────── */}
      <View style={s.calendarWrap}>
        {/* Week nav */}
        <View style={s.weekNav}>
          <TouchableOpacity hitSlop={6} onPress={() => shiftWeek(-1)} style={s.weekArrow}>
            <Ionicons name="chevron-back" size={18} color={CoachColors.textMuted} />
          </TouchableOpacity>
          <Text style={s.weekLabel}>
            {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' – '}
            {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
          <TouchableOpacity hitSlop={6} onPress={() => shiftWeek(1)} style={s.weekArrow}>
            <Ionicons name="chevron-forward" size={18} color={CoachColors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Day cells */}
        <View style={s.weekRow}>
          {weekDays.map((d, i) => {
            const isSelected = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);
            const count = sessionCountByDay[d.toDateString()] || 0;
            return (
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }}
                key={i}
                style={[s.dayCell, isSelected && s.dayCellSelected]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedDate(d);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${DAY_NAMES[d.getDay()]}, ${d.getDate()}`}
              >
                <Text
                  style={[
                    s.dayName,
                    isSelected && s.dayNameActive,
                    isToday && !isSelected && s.dayNameToday,
                  ]}
                >
                  {DAY_NAMES[d.getDay()]}
                </Text>
                <View
                  style={[
                    s.dayNumWrap,
                    isSelected && s.dayNumWrapActive,
                    isToday && !isSelected && s.dayNumWrapToday,
                  ]}
                >
                  <Text
                    style={[
                      s.dayNum,
                      isSelected && s.dayNumActive,
                      isToday && !isSelected && s.dayNumToday,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                {/* Session dots */}
                <View style={s.dotsRow}>
                  {count > 0 && (
                    <View style={[s.dot, isSelected && s.dotActive]} />
                  )}
                  {count > 1 && (
                    <View style={[s.dot, isSelected && s.dotActive]} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Day session count */}
        {daySessions.length > 0 && (
          <Text style={s.daySessionCount}>
            {daySessions.length} session{daySessions.length !== 1 ? 's' : ''} on{' '}
            {isSameDay(selectedDate, today) ? 'today' : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        )}
      </View>

      {/* ── Segment tabs ────────────────────────────────────────────────── */}
      <View style={s.tabRow}>
        {(
          [
            { key: 'upcoming', label: 'Upcoming', count: upcomingSessions.length },
            { key: 'history',  label: 'History',  count: pastSessions.length      },
          ] as const
        ).map(({ key, label, count }) => (
          <TouchableOpacity hitSlop={4}
            key={key}
            style={[s.tab, activeTab === key && s.tabActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab(key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === key }}
            accessibilityLabel={`${label} tab`}
          >
            <Text style={[s.tabText, activeTab === key && s.tabTextActive]}>
              {label}
            </Text>
            {count > 0 && (
              <View style={[s.tabBadge, activeTab === key && s.tabBadgeActive]}>
                <Text style={[s.tabBadgeText, activeTab === key && s.tabBadgeTextActive]}>
                  {count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 130 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={CoachColors.accent}
          />
        }
      >
        {!hasAnyData ? (
          <EmptyState
              coachName={coachFirst}
              onFindCoach={() => router.push(ClientRoute.findCoach)}
              onMessageCoach={() => router.push(ClientRoute.myMessages)}
            />
        ) : (
          <>
            {/* Upcoming tab */}
            {activeTab === 'upcoming' && (
              <>
                {/* Selected day sessions first */}
                {daySessions.filter(s => s.status === 'upcoming').length > 0 && (
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionTag}>SELECTED DAY</Text>
                  </View>
                )}
                {daySessions
                  .filter((s) => s.status === 'upcoming')
                  .map((session) => (
                    <SessionCard key={session.id} session={session} />
                  ))}

                {/* All upcoming */}
                {upcomingSessions.length > 0 && (
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionTag}>ALL UPCOMING</Text>
                  </View>
                )}
                {upcomingSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}

                {upcomingSessions.length === 0 && (
                  <EmptyState
              coachName={coachFirst}
              onFindCoach={() => router.push(ClientRoute.findCoach)}
              onMessageCoach={() => router.push(ClientRoute.myMessages)}
            />
                )}
              </>
            )}

            {/* History tab */}
            {activeTab === 'history' && (
              <>
                {pastSessions.length === 0 ? (
                  <View style={s.emptyWrap}>
                    <Text style={s.emptyTitle}>No history yet</Text>
                    <Text style={s.emptySub}>Completed sessions will appear here.</Text>
                  </View>
                ) : (
                  <>
                    <View style={s.sectionHeader}>
                      <Text style={s.sectionTag}>PAST SESSIONS</Text>
                    </View>
                    {pastSessions.map((session) => (
                      <SessionCard key={session.id} session={session} />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1 },
  headerTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2.5,
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 29,
    color: CoachColors.textPrimary,
    letterSpacing: -0.6,
  },

  // Calendar
  calendarWrap: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekArrow: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    letterSpacing: 0.5,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayCell: {
    width: DAY_W,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  dayCellSelected: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  dayName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 0.5,
  },
  dayNameActive: { color: CoachColors.textPrimary },
  dayNameToday: { color: CoachColors.accent },
  dayNumWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumWrapActive: { backgroundColor: CoachColors.accent },
  dayNumWrapToday: { borderWidth: 1, borderColor: CoachColors.accent },
  dayNum: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
  },
  dayNumActive: { color: CoachColors.onAccent },
  dayNumToday: { color: CoachColors.accent },
  dotsRow: { flexDirection: 'row', gap: 2, height: 5 },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoachColors.textFaint,
  },
  dotActive: { backgroundColor: CoachColors.accent },
  daySessionCount: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },

  // Segment tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: 10,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  tabActive: {
    backgroundColor: CoachColors.surface,
    borderColor: CoachColors.accent,
  },
  tabText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 0.5,
  },
  tabTextActive: { color: CoachColors.textPrimary },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CoachColors.borderMuted,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: CoachColors.accent },
  tabBadgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 10,
    color: CoachColors.textSecondary,
  },
  tabBadgeTextActive: { color: CoachColors.onAccent },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 20 },

  // Section
  sectionHeader: { marginBottom: 8, marginTop: 4 },
  sectionTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2.5,
  },

  // Session card
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: CoachColors.border,
  },
  timeCol: {
    width: 58,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  timeStart: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12.5,
    color: CoachColors.textPrimary,
    letterSpacing: 0.3,
  },
  timeEnd: {
    fontFamily: CoachFonts.body,
    fontSize: 10,
    color: CoachColors.textMuted,
  },
  timeDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.border,
    marginVertical: 12,
  },
  cardBody: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  typeBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  coachAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachInfo: { flex: 1, gap: 2 },
  coachName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
    letterSpacing: -0.2,
  },
  sessionMeta: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textMuted,
  },
  notesPreview: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    fontStyle: 'italic',
  },

  // Empty
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 27,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },
  emptySub: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
    textAlign: 'center',
    lineHeight: 22.5,
    maxWidth: 260,
  },
  emptyBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    backgroundColor: CoachColors.accent,
  },
  emptyBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14.5,
    color: CoachColors.onAccent,
    letterSpacing: 0.2,
  },
});
