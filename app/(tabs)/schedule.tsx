import { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Dimensions, Animated, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import { useTheme } from '../../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const DAY_CELL_W = (SCREEN_W - 48) / 7;

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWeekDays(anchor: Date): Date[] {
  const d = new Date(anchor);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ScheduleScreen() {
  const router = useRouter();
  const { sessions, getClientById, getSessionsForDate, updateSession, refreshData } = useApp();
  const { colors } = useTheme();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // Auto-refresh when screen gains focus (e.g. after booking a session)
  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  const today = new Date();
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const daySessions = useMemo(() => getSessionsForDate(selectedDate), [selectedDate, sessions]);

  // Count sessions per day in the current week
  const sessionCountByDay = useMemo(() => {
    const counts = new Map<string, number>();
    weekDays.forEach(d => {
      const dayStr = d.toISOString().split('T')[0];
      counts.set(dayStr, getSessionsForDate(d).length);
    });
    return counts;
  }, [weekDays, sessions]);

  const shiftWeek = (dir: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + dir * 7);
    setSelectedDate(next);
    setExpandedSession(null);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
    setExpandedSession(null);
  };

  const handleStatusChange = async (sessionId: string, newStatus: 'completed' | 'cancelled' | 'upcoming') => {
    try {
      await updateSession(sessionId, { status: newStatus });
    } catch (err) {
      Alert.alert('Error', 'Failed to update session');
    }
    setExpandedSession(null);
  };

  const typeColors: Record<string, string> = {
    '1-on-1': '#FF6B35',
    'Group': '#A78BFA',
    'Virtual': '#6C9BF2',
  };

  const isCurrentWeek = weekDays.some(d => isSameDay(d, today));
  const monthLabel = (() => {
    const months = new Set(weekDays.map(d => MONTH_NAMES[d.getMonth()]));
    const years = new Set(weekDays.map(d => d.getFullYear()));
    const monthArr = Array.from(months);
    const yearStr = years.size > 1 ? '' : ` ${weekDays[0].getFullYear()}`;
    return monthArr.join(' – ') + yearStr;
  })();

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      {/* ── HEADER ── */}
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Schedule</Text>
          <Text style={st.headerMonth}>{monthLabel}</Text>
        </View>
        <View style={st.headerActions}>
          {!isCurrentWeek && (
            <TouchableOpacity style={st.todayBtn} onPress={goToToday} activeOpacity={0.7}>
              <Text style={st.todayBtnText}>Today</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={st.addBtn}
            activeOpacity={0.8}
            onPress={() => router.push(`/book-session?date=${selectedDate.toISOString()}` as any)}
          >
            <Ionicons name="add" size={22} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── WEEK STRIP ── */}
      <View style={st.weekStrip}>
        <TouchableOpacity onPress={() => shiftWeek(-1)} style={st.weekArrow} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>

        <View style={st.weekDays}>
          {weekDays.map((d, i) => {
            const isSelected = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);
            const dayStr = d.toISOString().split('T')[0];
            const count = sessionCountByDay.get(dayStr) || 0;

            return (
              <TouchableOpacity
                key={i}
                style={[st.dayCell, isSelected && st.dayCellSelected]}
                onPress={() => { setSelectedDate(d); setExpandedSession(null); }}
                activeOpacity={0.7}
              >
                <Text style={[st.dayName, isSelected && st.dayNameSelected, isToday && !isSelected && st.dayNameToday]}>
                  {DAY_NAMES[i]}
                </Text>
                <View style={[st.dayNumber, isSelected && st.dayNumberSelected, isToday && !isSelected && st.dayNumberToday]}>
                  <Text style={[st.dayNumberText, isSelected && st.dayNumberTextSelected, isToday && !isSelected && st.dayNumberTextToday]}>
                    {d.getDate()}
                  </Text>
                </View>
                {/* Dots for sessions */}
                <View style={st.dayDots}>
                  {count > 0 && (
                    <View style={[st.dayDot, isSelected && st.dayDotSelected]} />
                  )}
                  {count > 1 && (
                    <View style={[st.dayDot, isSelected && st.dayDotSelected]} />
                  )}
                  {count > 2 && (
                    <View style={[st.dayDot, isSelected && st.dayDotSelected]} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity onPress={() => shiftWeek(1)} style={st.weekArrow} activeOpacity={0.6}>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>

      {/* ── DAY HEADER ── */}
      <View style={st.dayHeader}>
        <Text style={st.dayHeaderTitle}>
          {isSameDay(selectedDate, today) ? 'Today' :
            selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </Text>
        <View style={st.sessionCount}>
          <Text style={st.sessionCountText}>
            {daySessions.length} session{daySessions.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* ── SESSIONS TIMELINE ── */}
      <ScrollView
        contentContainerStyle={st.sessionList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
      >
        {daySessions.length === 0 ? (
          <View style={st.emptyState}>
            <View style={st.emptyIcon}>
              <Ionicons name="calendar-outline" size={36} color="rgba(255,255,255,0.15)" />
            </View>
            <Text style={st.emptyTitle}>No sessions scheduled</Text>
            <Text style={st.emptySubtitle}>
              {isSameDay(selectedDate, today) ? 'Enjoy your free day!' : 'Tap + to book a session'}
            </Text>
            <TouchableOpacity
              style={st.emptyBtn}
              onPress={() => router.push(`/book-session?date=${selectedDate.toISOString()}` as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color="#000" />
              <Text style={st.emptyBtnText}>Book Session</Text>
            </TouchableOpacity>
          </View>
        ) : (
          daySessions.map((session, index) => {
            const client = getClientById(session.client_id || '');
            const dt = new Date(session.date);
            const endTime = new Date(dt.getTime() + session.duration * 60000);
            const typeColor = typeColors[session.type] || '#FF6B35';
            const isDone = session.status !== 'upcoming';
            const isExpanded = expandedSession === session.id;
            const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const endStr = endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

            return (
              <TouchableOpacity
                key={session.id}
                activeOpacity={0.85}
                onPress={() => setExpandedSession(isExpanded ? null : session.id)}
              >
                <View style={[st.sessionCard, isDone && st.sessionDone]}>
                  {/* Left accent bar */}
                  <View style={[st.sessionAccent, { backgroundColor: typeColor }]} />

                  {/* Time column */}
                  <View style={st.timeCol}>
                    <Text style={st.timeStart}>{timeStr}</Text>
                    <Text style={st.timeEnd}>{endStr}</Text>
                  </View>

                  {/* Divider */}
                  <View style={st.timeDivider} />

                  {/* Content */}
                  <View style={st.sessionBody}>
                    <View style={st.sessionTopRow}>
                      {client ? (
                        <Avatar name={client.name} size="sm" imageUrl={client.avatar_url} />
                      ) : (
                        <View style={[st.groupAvatar, { backgroundColor: typeColor + '25' }]}>
                          <Ionicons name="people" size={14} color={typeColor} />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={st.sessionName} numberOfLines={1}>
                          {client?.name || session.group_name || 'Session'}
                        </Text>
                        <View style={st.sessionMeta}>
                          <View style={[st.typeBadge, { backgroundColor: typeColor + '18' }]}>
                            <Text style={[st.typeBadgeText, { color: typeColor }]}>{session.type}</Text>
                          </View>
                          <Text style={st.durationText}>{session.duration} min</Text>
                        </View>
                      </View>

                      {/* Status */}
                      {session.status === 'completed' && (
                        <View style={[st.statusIcon, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                          <Ionicons name="checkmark" size={14} color="#22C55E" />
                        </View>
                      )}
                      {session.status === 'cancelled' && (
                        <View style={[st.statusIcon, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                          <Ionicons name="close" size={14} color="#EF4444" />
                        </View>
                      )}
                      {session.status === 'upcoming' && (
                        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                      )}
                    </View>

                    {/* Expanded actions */}
                    {isExpanded && session.status === 'upcoming' && (
                      <View style={st.expandedActions}>
                        <TouchableOpacity
                          style={[st.actionBtn, { backgroundColor: 'rgba(34,197,94,0.1)' }]}
                          onPress={() => handleStatusChange(session.id, 'completed')}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                          <Text style={[st.actionText, { color: '#22C55E' }]}>Complete</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[st.actionBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}
                          onPress={() => handleStatusChange(session.id, 'cancelled')}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="close-circle" size={16} color="#EF4444" />
                          <Text style={[st.actionText, { color: '#EF4444' }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[st.actionBtn, { backgroundColor: 'rgba(108,155,242,0.1)' }]}
                          onPress={() => router.push(`/session/${session.id}` as any)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="open-outline" size={14} color="#6C9BF2" />
                          <Text style={[st.actionText, { color: '#6C9BF2' }]}>View</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {isExpanded && session.status !== 'upcoming' && (
                      <View style={st.expandedActions}>
                        <TouchableOpacity
                          style={[st.actionBtn, { backgroundColor: 'rgba(255,255,255,0.06)', flex: 1 }]}
                          onPress={() => handleStatusChange(session.id, 'upcoming')}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="arrow-undo" size={14} color="rgba(255,255,255,0.5)" />
                          <Text style={[st.actionText, { color: 'rgba(255,255,255,0.5)' }]}>Undo</Text>
                        </TouchableOpacity>
                        {session.status === 'completed' && (
                          <TouchableOpacity
                            style={[st.actionBtn, { backgroundColor: 'rgba(167,139,250,0.1)', flex: 2 }]}
                            onPress={() => router.push(`/session-notes?sessionId=${session.id}` as any)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="document-text" size={14} color="#A78BFA" />
                            <Text style={[st.actionText, { color: '#A78BFA' }]}>
                              {session.notes ? 'Edit Notes' : 'Add Notes'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Bottom spacer */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerMonth: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todayBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  todayBtnText: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: '#FFFFFF', letterSpacing: 1, textTransform: 'uppercase' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Week Strip
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  weekArrow: {
    width: 28,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDays: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayCell: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: Radius.xs,
    width: DAY_CELL_W,
    gap: 4,
  },
  dayCellSelected: {
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dayName: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dayNameSelected: { color: '#FFFFFF' },
  dayNameToday: { color: '#FF6B35' },
  dayNumber: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberSelected: {
    backgroundColor: '#FFFFFF',
  },
  dayNumberToday: {
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  dayNumberText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  dayNumberTextSelected: { color: '#000000' },
  dayNumberTextToday: { color: '#FF6B35' },
  dayDots: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  dayDot: { width: 4, height: 4, borderRadius: Radius.xs, backgroundColor: 'rgba(255,255,255,0.25)' },
  dayDotSelected: { backgroundColor: '#FF6B35' },

  // Day Header
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  dayHeaderTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sessionCount: {
    backgroundColor: '#0F0F0F',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sessionCountText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Session List
  sessionList: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs },

  // Session Card
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: '#0A0A0A',
    borderRadius: Radius.xs,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sessionDone: { opacity: 0.5 },
  sessionAccent: {
    width: 4,
  },
  timeCol: {
    width: 70,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  timeStart: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  timeEnd: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
  },
  timeDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },
  sessionBody: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingRight: 16,
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupAvatar: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionName: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  typeBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  durationText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
  },
  statusIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Expanded Actions
  expandedActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.xs,
  },
  actionText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 8,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.xs,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emptyTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  emptySubtitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: Radius.xs,
    marginTop: 16,
  },
  emptyBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#000000',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
