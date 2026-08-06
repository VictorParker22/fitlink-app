/**
 * My Sessions — Client Booking Management
 *
 * The screen the client sees after sending a booking request.
 * Shows: upcoming confirmed sessions, pending requests, past sessions.
 * Design: Editorial precision — week calendar strip + session cards.
 *
 * Data sources:
 *   - `sessions` table: trainer-confirmed sessions (client_id match)
 *   - `session_requests` table: client-initiated requests (pending review)
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
  Alert,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { FontFamily } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';

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

interface SessionRequest {
  id: string;
  created_at: string;
  session_type: string;
  duration_minutes: number;
  notes?: string;
  status: 'pending' | 'accepted' | 'declined';
  trainer?: {
    name: string;
    avatar_url: string;
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_COLORS: Record<string, string> = {
  '1-on-1':    '#FF6B35',
  'Group':     '#A855F7',
  'Virtual':   '#5B7FFF',
  'Assessment': '#22C55E',
};

const STATUS_CONFIG = {
  upcoming:  { label: 'UPCOMING',  color: '#5B7FFF',  bg: 'rgba(91,127,255,0.12)'  },
  completed: { label: 'DONE',      color: '#22C55E',  bg: 'rgba(34,197,94,0.12)'   },
  cancelled: { label: 'CANCELLED', color: '#EF4444',  bg: 'rgba(239,68,68,0.12)'   },
};

const REQ_STATUS_CONFIG = {
  pending:  { label: 'PENDING',  color: '#FFD700', bg: 'rgba(255,215,0,0.10)'  },
  accepted: { label: 'ACCEPTED', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  declined: { label: 'DECLINED', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  const typeColor = TYPE_COLORS[session.type] || '#FF6B35';
  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.upcoming;
  const dt = new Date(session.date);
  const endDt = new Date(dt.getTime() + session.duration * 60000);

  return (
    <View style={s.sessionCard}>
      {/* Left accent bar */}
      <View style={[s.accentBar, { backgroundColor: typeColor }]} />

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
              <Ionicons name="person" size={14} color="rgba(255,255,255,0.4)" />
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

// ─── Request Card ────────────────────────────────────────────────────────────

function RequestCard({
  req,
  onCancel,
}: {
  req: SessionRequest;
  onCancel: (id: string) => void;
}) {
  const statusCfg = REQ_STATUS_CONFIG[req.status] || REQ_STATUS_CONFIG.pending;
  const typeColor = TYPE_COLORS[req.session_type] || '#FF6B35';

  return (
    <View style={s.requestCard}>
      <View style={[s.accentBar, { backgroundColor: '#FFD700' }]} />
      <View style={s.cardBody}>
        {/* Header */}
        <View style={s.cardTopRow}>
          <View style={[s.typeBadge, { borderColor: typeColor }]}>
            <Text style={[s.typeBadgeText, { color: typeColor }]}>
              {(req.session_type || '1-ON-1').toUpperCase()}
            </Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Ionicons
              name={req.status === 'pending' ? 'time-outline' : req.status === 'accepted' ? 'checkmark-circle' : 'close-circle'}
              size={9}
              color={statusCfg.color}
              style={{ marginRight: 3 }}
            />
            <Text style={[s.statusBadgeText, { color: statusCfg.color }]}>
              {statusCfg.label}
            </Text>
          </View>
        </View>

        {/* Coach row */}
        <View style={s.coachRow}>
          {req.trainer?.avatar_url ? (
            <Image
              source={{ uri: req.trainer.avatar_url }}
              style={s.coachAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={s.coachAvatarPlaceholder}>
              <Ionicons name="person" size={14} color="rgba(255,255,255,0.4)" />
            </View>
          )}
          <View style={s.coachInfo}>
            <Text style={s.coachName}>
              {req.trainer?.name || 'Your Coach'}
            </Text>
            <Text style={s.sessionMeta}>
              {req.duration_minutes} min · Requested {formatDate(req.created_at)}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {!!req.notes && (
          <Text style={s.notesPreview} numberOfLines={1}>
            "{req.notes}"
          </Text>
        )}

        {/* Cancel button — only for pending */}
        {req.status === 'pending' && (
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={() => onCancel(req.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Cancel booking request"
          >
            <Text style={s.cancelBtnText}>Cancel Request</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={s.emptyWrap}>
      <View style={s.emptyIconWrap}>
        <Ionicons name="calendar-outline" size={36} color="rgba(255,255,255,0.15)" />
      </View>
      <Text style={s.emptyTitle}>No sessions yet</Text>
      <Text style={s.emptySub}>
        Browse coaches and request a private session to get started.
      </Text>
      <TouchableOpacity
        style={s.emptyBtn}
        onPress={onExplore}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Find a coach"
      >
        <LinearGradient
          colors={['#FFD700', '#FF9500']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.emptyBtnGrad}
        >
          <Ionicons name="search" size={14} color="#000000" />
          <Text style={s.emptyBtnText}>FIND A COACH</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function MySessionsScreen() {
  const router = useRouter();
  const { clientData, trainer } = useClient();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [requests, setRequests] = useState<SessionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'requests' | 'history'>('upcoming');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const weekDays = useMemo(() => getWeek(selectedDate), [selectedDate]);
  const today = new Date();

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!clientData?.id) return;

    try {
      // 1. Fetch confirmed sessions from `sessions` table
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('*, trainers:trainer_id(name, avatar_url)')
        .eq('client_id', clientData.id)
        .order('date', { ascending: false });

      // 2. Fetch pending/accepted booking requests from `session_requests`
      const { data: reqData } = await supabase
        .from('session_requests')
        .select('*, trainers:trainer_id(name, avatar_url)')
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: false });

      if (sessionData) {
        setSessions(
          sessionData.map((s: any) => ({
            ...s,
            trainer: s.trainers || trainer,
          }))
        );
      }

      // Also surface accepted requests that haven't been turned into sessions yet
      if (reqData) {
        setRequests(
          reqData.map((r: any) => ({
            ...r,
            trainer: r.trainers || trainer,
          }))
        );
      }
    } catch (err) {
      // Tables may not exist yet — show empty state gracefully
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

  const handleCancelRequest = (id: string) => {
    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this booking request?',
      [
        { text: 'Keep It', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await supabase
              .from('session_requests')
              .update({ status: 'cancelled' })
              .eq('id', id);
            fetchData();
          },
        },
      ]
    );
  };

  const shiftWeek = (dir: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir * 7);
    setSelectedDate(d);
  };

  // ── Filtered data ──────────────────────────────────────────────────────────
  const upcomingSessions = sessions.filter((s) => s.status === 'upcoming');
  const pastSessions = sessions.filter((s) => s.status !== 'upcoming');
  const activePendingReqs = requests.filter(
    (r) => r.status === 'pending' || r.status === 'accepted'
  );

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

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#5B7FFF" />
        </View>
      </SafeAreaView>
    );
  }

  const hasAnyData =
    sessions.length > 0 || requests.length > 0;

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
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.headerTag}>COACHING</Text>
          <Text style={s.headerTitle}>My Sessions</Text>
        </View>
        {activePendingReqs.length > 0 && (
          <View style={s.pendingBadge}>
            <Text style={s.pendingBadgeText}>{activePendingReqs.length}</Text>
          </View>
        )}
      </View>

      {/* ── Calendar strip ──────────────────────────────────────────────── */}
      <View style={s.calendarWrap}>
        {/* Week nav */}
        <View style={s.weekNav}>
          <TouchableOpacity onPress={() => shiftWeek(-1)} style={s.weekArrow}>
            <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
          <Text style={s.weekLabel}>
            {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' – '}
            {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => shiftWeek(1)} style={s.weekArrow}>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>

        {/* Day cells */}
        <View style={s.weekRow}>
          {weekDays.map((d, i) => {
            const isSelected = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);
            const count = sessionCountByDay[d.toDateString()] || 0;
            return (
              <TouchableOpacity
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
            { key: 'requests', label: 'Requests', count: activePendingReqs.length },
            { key: 'history',  label: 'History',  count: pastSessions.length      },
          ] as const
        ).map(({ key, label, count }) => (
          <TouchableOpacity
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
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#5B7FFF"
          />
        }
      >
        {!hasAnyData ? (
          <EmptyState onExplore={() => router.back()} />
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
                  <EmptyState onExplore={() => router.back()} />
                )}
              </>
            )}

            {/* Requests tab */}
            {activeTab === 'requests' && (
              <>
                {requests.length === 0 ? (
                  <EmptyState onExplore={() => router.back()} />
                ) : (
                  <>
                    <View style={s.sectionHeader}>
                      <Text style={s.sectionTag}>BOOKING REQUESTS</Text>
                    </View>
                    {requests.map((req) => (
                      <RequestCard
                        key={req.id}
                        req={req}
                        onCancel={handleCancelRequest}
                      />
                    ))}
                  </>
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
    backgroundColor: '#000000',
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1 },
  headerTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 2.5,
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },
  pendingBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#000000',
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  dayName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.5,
  },
  dayNameActive: { color: '#FFFFFF' },
  dayNameToday: { color: '#5B7FFF' },
  dayNumWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumWrapActive: { backgroundColor: '#5B7FFF' },
  dayNumWrapToday: { borderWidth: 1, borderColor: '#5B7FFF' },
  dayNum: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  dayNumActive: { color: '#FFFFFF' },
  dayNumToday: { color: '#5B7FFF' },
  dotsRow: { flexDirection: 'row', gap: 2, height: 5 },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: { backgroundColor: '#5B7FFF' },
  daySessionCount: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  tabActive: {
    backgroundColor: '#111113',
    borderColor: '#5B7FFF',
  },
  tabText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
  },
  tabTextActive: { color: '#FFFFFF' },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: '#5B7FFF' },
  tabBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
  },
  tabBadgeTextActive: { color: '#FFFFFF' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 20 },

  // Section
  sectionHeader: { marginBottom: 8, marginTop: 4 },
  sectionTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 2.5,
  },

  // Session card
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  requestCard: {
    flexDirection: 'row',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  timeCol: {
    width: 58,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  timeStart: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  timeEnd: {
    fontFamily: FontFamily.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
  },
  timeDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#1C1C1E',
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
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
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
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
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
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachInfo: { flex: 1, gap: 2 },
  coachName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  sessionMeta: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  notesPreview: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    fontStyle: 'italic',
  },
  cancelBtn: {
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  cancelBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#EF4444',
    letterSpacing: 0.5,
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  emptySub: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  emptyBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  emptyBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
    letterSpacing: 0.5,
  },
});
