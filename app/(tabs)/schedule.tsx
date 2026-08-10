/**
 * schedule.tsx — Coach Schedule Screen (Redesigned)
 *
 * Design: consistent with dashboard & clients screens
 *   • #0D0D12 dark navy + LinearGradient
 *   • #C8F135 lime accent (today, selected, add button)
 *   • Frosted glass session cards
 *   • SpaceGrotesk + Epilogue
 *
 * Calendar approach:
 *   • Custom week strip (always visible) — 7-day row with session dots
 *   • Tappable month header toggles to full month grid via react-native-calendars
 *     (already installed). Library is the recommended 2024 standard per research
 *     — handles leap years, timezone edge-cases, and accessibility automatically.
 *   • Expand/collapse animated with Animated.timing on maxHeight
 *     (height cannot use native driver — this is the correct RN approach)
 *
 * Responsiveness: ALL layout values derived from W = Dimensions.get('window').width
 *
 * Apple HIG:
 *   • All tap targets ≥ 44pt (minHeight / hitSlop)
 *   • accessibilityLabel with full date + session count on each day cell
 *   • accessibilityState.selected on selected day
 *   • accessibilityRole on all interactive elements
 *   • Sentence-case labels, no ALL-CAPS
 */
import {
  useState, useMemo, useCallback, useRef, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import { FontFamily } from '../../constants/theme';

// ─── Layout ───────────────────────────────────────────────────────────────────

const { width: W } = Dimensions.get('window');
const DAY_CELL_W = (W - W * 0.1 - 56) / 7; // account for side padding + arrows
const FULL_CAL_HEIGHT = 320; // approximate height of react-native-calendars month grid

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDateKey(d: Date): string {
  return d.toISOString().split('T')[0];
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

const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Session type → color mapping
const TYPE_COLORS: Record<string, string> = {
  '1-on-1': '#C8F135',   // lime — coach's primary colour
  'Group':  '#A78BFA',   // purple
  'Virtual':'#60A5FA',   // blue
};
const DEFAULT_TYPE_COLOR = '#C8F135';

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? DEFAULT_TYPE_COLOR;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { sessions, getClientById, getSessionsForDate, updateSession, refreshData } = useApp();

  const [selectedDate, setSelectedDate]   = useState(new Date());
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [showFullCal, setShowFullCal]     = useState(false);
  const [refreshing, setRefreshing]       = useState(false);

  // Animated height for calendar expand/collapse
  // height cannot use the native driver — Animated.timing on maxHeight is the correct RN pattern
  const calAnim = useRef(new Animated.Value(0)).current;

  const toggleFullCal = () => {
    const toValue = showFullCal ? 0 : FULL_CAL_HEIGHT;
    Animated.timing(calAnim, {
      toValue,
      duration: 280,
      useNativeDriver: false,
    }).start();
    setShowFullCal(prev => !prev);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  useFocusEffect(
    useCallback(() => { refreshData(); }, [refreshData])
  );

  const today    = new Date();
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);

  // Sessions for the selected day
  const daySessions = useMemo(
    () => getSessionsForDate(selectedDate),
    [selectedDate, sessions],
  );

  // Sessions per day in current week (for week strip dots)
  const sessionsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    weekDays.forEach(d => {
      map[toDateKey(d)] = getSessionsForDate(d).length;
    });
    return map;
  }, [weekDays, sessions]);

  // Week stats for the stats strip
  const weekStats = useMemo(() => {
    let total = 0; let completed = 0; let hours = 0;
    weekDays.forEach(d => {
      const s = getSessionsForDate(d);
      total     += s.length;
      completed += s.filter(x => x.status === 'completed').length;
      hours     += s.reduce((acc, x) => acc + x.duration, 0);
    });
    return { total, completed, hours: Math.round(hours / 60 * 10) / 10 };
  }, [weekDays, sessions]);

  // Marked dates for react-native-calendars (dots on days with sessions)
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    sessions.forEach(s => {
      const key = s.date.split('T')[0];
      if (!marks[key]) {
        marks[key] = { dots: [{ color: '#C8F135' }], marked: true };
      }
    });
    // Selected day
    const selKey = toDateKey(selectedDate);
    marks[selKey] = {
      ...(marks[selKey] || {}),
      selected: true,
      selectedColor: '#C8F135',
      selectedTextColor: '#0D0D12',
    };
    // Today (if not selected)
    // Note: todayTextColor in the Calendar theme handles lime styling for today.
    // We add marked:true so the session dot (if any) still shows on today.
    const todayKey = toDateKey(today);
    if (todayKey !== selKey && !marks[todayKey]) {
      // No session today — still mark so theme's todayTextColor applies.
      marks[todayKey] = { dots: [], marked: false };
    }
    return marks;
  }, [sessions, selectedDate]);

  // Month header label
  const monthLabel = (() => {
    const months = [...new Set(weekDays.map(d => MONTH_NAMES[d.getMonth()]))];
    return months.join(' / ');
  })();
  const yearLabel = weekDays[0].getFullYear().toString();

  const shiftWeek = (dir: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + dir * 7);
    setSelectedDate(next);
    setExpandedSession(null);
  };

  const isCurrentWeek = weekDays.some(d => isSameDay(d, today));

  const handleStatus = async (
    sessionId: string,
    newStatus: 'completed' | 'cancelled' | 'upcoming',
  ) => {
    try {
      await updateSession(sessionId, { status: newStatus });
    } catch {
      Alert.alert('Error', 'Failed to update session. Please try again.');
    }
    setExpandedSession(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <LinearGradient colors={['#0D0D12', '#111118', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── HEADER ───────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Schedule</Text>
            <Text style={s.headerSub}>{monthLabel} {yearLabel}</Text>
          </View>
          <View style={s.headerRight}>
            {!isCurrentWeek && (
              <TouchableOpacity
                style={s.todayBtn}
                onPress={() => { setSelectedDate(new Date()); setExpandedSession(null); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Jump to today"
              >
                <Text style={s.todayBtnText}>Today</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => router.push(`/book-session?date=${selectedDate.toISOString()}` as any)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Book new session"
            >
              <Ionicons name="add" size={20} color="#0D0D12" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── WEEK STATS STRIP ─────────────────────────────────────────── */}
        <View style={s.statsStrip}>
          <StatPill label="Sessions" value={weekStats.total}     color="#C8F135" />
          <View style={s.statsDivider} />
          <StatPill label="Done"     value={weekStats.completed} color="#22C55E" />
          <View style={s.statsDivider} />
          <StatPill label="Hours"    value={weekStats.hours}     color="#60A5FA" decimals />
        </View>

        {/* ── MONTH TOGGLE + WEEK STRIP ────────────────────────────────── */}
        <View style={s.calendarSection}>

          {/* Month header — tap to expand full calendar */}
          <TouchableOpacity
            style={s.monthToggle}
            onPress={toggleFullCal}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={showFullCal ? 'Collapse calendar' : 'Expand to full month calendar'}
          >
            <Text style={s.monthToggleText}>{monthLabel}</Text>
            <Ionicons
              name={showFullCal ? 'chevron-up' : 'chevron-down'}
              size={14}
              color="rgba(255,255,255,0.4)"
            />
            <Text style={s.monthToggleYear}>{yearLabel}</Text>
          </TouchableOpacity>

          {/* Animated full calendar (react-native-calendars) */}
          <Animated.View style={[s.fullCalWrap, { maxHeight: calAnim }]}>
            {showFullCal && (
              <Calendar
                current={toDateKey(selectedDate)}
                onDayPress={day => {
                  setSelectedDate(new Date(day.dateString + 'T12:00:00'));
                  setExpandedSession(null);
                }}
                markedDates={markedDates}
                markingType="multi-dot"
                firstDay={1}
                theme={{
                  backgroundColor:              'transparent',
                  calendarBackground:           'transparent',
                  textSectionTitleColor:        'rgba(255,255,255,0.35)',
                  textSectionTitleDisabledColor:'rgba(255,255,255,0.15)',
                  selectedDayBackgroundColor:   '#C8F135',
                  selectedDayTextColor:         '#0D0D12',
                  todayTextColor:               '#C8F135',
                  dayTextColor:                 '#FFFFFF',
                  textDisabledColor:            'rgba(255,255,255,0.2)',
                  dotColor:                     '#C8F135',
                  selectedDotColor:             '#0D0D12',
                  arrowColor:                   'rgba(255,255,255,0.4)',
                  monthTextColor:               'transparent', // hide — we have our own header
                  indicatorColor:               '#C8F135',
                  textDayFontFamily:            FontFamily.bodyMedium,
                  textMonthFontFamily:          FontFamily.heading,
                  textDayHeaderFontFamily:      FontFamily.bodySemiBold,
                  textDayFontSize:              Math.round(W * 0.037),
                  textMonthFontSize:            0,  // hide library month label
                  textDayHeaderFontSize:        Math.round(W * 0.028),
                }}
              />
            )}
          </Animated.View>

          {/* Week strip (always visible) */}
          <View style={s.weekStrip}>
            <TouchableOpacity
              onPress={() => shiftWeek(-1)}
              style={s.weekArrow}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>

            {weekDays.map((d, i) => {
              const isSelected = isSameDay(d, selectedDate);
              const isToday    = isSameDay(d, today);
              const count      = sessionsByDay[toDateKey(d)] || 0;
              const dateLabel  = d.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              });

              return (
                <TouchableOpacity
                  key={i}
                  style={[s.dayCell, isSelected && s.dayCellSelected]}
                  onPress={() => { setSelectedDate(d); setExpandedSession(null); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${dateLabel}, ${count} session${count !== 1 ? 's' : ''}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  {/* Day name */}
                  <Text style={[
                    s.dayName,
                    isSelected && s.dayNameSel,
                    isToday && !isSelected && s.dayNameToday,
                  ]}>
                    {DAY_NAMES_SHORT[i]}
                  </Text>

                  {/* Day number circle */}
                  <View style={[
                    s.dayNum,
                    isSelected && s.dayNumSel,
                    isToday && !isSelected && s.dayNumToday,
                  ]}>
                    <Text style={[
                      s.dayNumText,
                      isSelected && s.dayNumTextSel,
                      isToday && !isSelected && s.dayNumTextToday,
                    ]}>
                      {d.getDate()}
                    </Text>
                  </View>

                  {/* Session dots (up to 3) */}
                  <View style={s.dotRow}>
                    {Array.from({ length: Math.min(count, 3) }).map((_, di) => (
                      <View
                        key={di}
                        style={[s.dot, isSelected && s.dotSel]}
                      />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => shiftWeek(1)}
              style={s.weekArrow}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Next week"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── DAY HEADER ───────────────────────────────────────────────── */}
        <View style={s.dayHeader}>
          <Text style={s.dayHeaderTitle}>
            {isSameDay(selectedDate, today)
              ? 'Today'
              : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
          <View style={s.sessionCountPill}>
            <Text style={s.sessionCountText}>
              {daySessions.length} session{daySessions.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* ── SESSION LIST ─────────────────────────────────────────────── */}
        <ScrollView
          contentContainerStyle={[s.sessionList, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C8F135" />
          }
        >
          {daySessions.length === 0 ? (
            <EmptyDay
              isToday={isSameDay(selectedDate, today)}
              onBook={() => router.push(`/book-session?date=${selectedDate.toISOString()}` as any)}
            />
          ) : (
            daySessions.map(session => {
              const client    = getClientById(session.client_id || '');
              const dt        = new Date(session.date);
              const endDt     = new Date(dt.getTime() + session.duration * 60000);
              const color     = typeColor(session.type);
              const isDone    = session.status !== 'upcoming';
              const isExpanded = expandedSession === session.id;
              const timeStr   = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              const endStr    = endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

              return (
                <TouchableOpacity
                  key={session.id}
                  activeOpacity={0.85}
                  onPress={() => setExpandedSession(isExpanded ? null : session.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${client?.name || session.group_name || 'Session'}, ${timeStr}, ${session.type}, ${session.duration} minutes`}
                  accessibilityHint="Double-tap to expand actions"
                >
                  <View style={[s.sessionCard, isDone && s.sessionDone]}>

                    {/* Type accent bar */}
                    <View style={[s.typeBar, { backgroundColor: color }]} />

                    {/* Time column */}
                    <View style={s.timeCol}>
                      <Text style={s.timeStart}>{timeStr}</Text>
                      <View style={s.timeDot} />
                      <Text style={s.timeEnd}>{endStr}</Text>
                    </View>

                    {/* Vertical divider */}
                    <View style={s.timeDivider} />

                    {/* Session body */}
                    <View style={s.sessionBody}>
                      <View style={s.sessionTop}>

                        {/* Avatar */}
                        {client ? (
                          <Avatar name={client.name} size="sm" imageUrl={client.avatar_url} />
                        ) : (
                          <View style={[s.groupAvatar, { backgroundColor: color + '22' }]}>
                            <Ionicons name="people" size={14} color={color} />
                          </View>
                        )}

                        {/* Name + meta */}
                        <View style={s.sessionInfo}>
                          <Text style={s.sessionName} numberOfLines={1}>
                            {client?.name || session.group_name || 'Session'}
                          </Text>
                          <View style={s.sessionMeta}>
                            <View style={[s.typePill, { backgroundColor: color + '1A' }]}>
                              <Text style={[s.typePillText, { color }]}>{session.type}</Text>
                            </View>
                            <Text style={s.durationText}>{session.duration} min</Text>
                            {session.notes && (
                              <Ionicons name="document-text-outline" size={11} color="rgba(255,255,255,0.3)" />
                            )}
                          </View>
                        </View>

                        {/* Status icon */}
                        {session.status === 'completed' && (
                          <View style={[s.statusBadge, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                            <Ionicons name="checkmark" size={14} color="#22C55E" />
                          </View>
                        )}
                        {session.status === 'cancelled' && (
                          <View style={[s.statusBadge, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                            <Ionicons name="close" size={14} color="#EF4444" />
                          </View>
                        )}
                        {session.status === 'upcoming' && (
                          <Ionicons name="chevron-down" size={16} color={isExpanded ? '#C8F135' : 'rgba(255,255,255,0.2)'} />
                        )}
                      </View>

                      {/* ── Expanded actions ── */}
                      {isExpanded && session.status === 'upcoming' && (
                        <View style={s.expandedRow}>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: 'rgba(200,241,53,0.08)', borderColor: 'rgba(200,241,53,0.2)' }]}
                            onPress={() => handleStatus(session.id, 'completed')}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Mark session as completed"
                          >
                            <Ionicons name="checkmark-circle" size={15} color="#C8F135" />
                            <Text style={[s.actionText, { color: '#C8F135' }]}>Complete</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }]}
                            onPress={() => handleStatus(session.id, 'cancelled')}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel session"
                          >
                            <Ionicons name="close-circle" size={15} color="#EF4444" />
                            <Text style={[s.actionText, { color: '#EF4444' }]}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: 'rgba(96,165,250,0.08)', borderColor: 'rgba(96,165,250,0.2)' }]}
                            onPress={() => router.push(`/session/${session.id}` as any)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="View session details"
                          >
                            <Ionicons name="open-outline" size={14} color="#60A5FA" />
                            <Text style={[s.actionText, { color: '#60A5FA' }]}>Details</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {isExpanded && session.status !== 'upcoming' && (
                        <View style={s.expandedRow}>
                          <TouchableOpacity
                            style={[s.actionBtn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }]}
                            onPress={() => handleStatus(session.id, 'upcoming')}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Undo — mark session as upcoming"
                          >
                            <Ionicons name="arrow-undo" size={14} color="rgba(255,255,255,0.45)" />
                            <Text style={[s.actionText, { color: 'rgba(255,255,255,0.45)' }]}>Undo</Text>
                          </TouchableOpacity>
                          {session.status === 'completed' && (
                            <TouchableOpacity
                              style={[s.actionBtn, { flex: 2, backgroundColor: 'rgba(167,139,250,0.08)', borderColor: 'rgba(167,139,250,0.2)' }]}
                              onPress={() => router.push(`/session-notes?sessionId=${session.id}` as any)}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={session.notes ? 'Edit session notes' : 'Add session notes'}
                            >
                              <Ionicons name="document-text" size={14} color="#A78BFA" />
                              <Text style={[s.actionText, { color: '#A78BFA' }]}>
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
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({
  label, value, color, decimals = false,
}: { label: string; value: number; color: string; decimals?: boolean }) {
  return (
    <View style={s.statPill} accessibilityLabel={`${value} ${label} this week`}>
      <Text style={[s.statPillValue, { color }]}>
        {decimals ? value.toFixed(1) : value}
      </Text>
      <Text style={s.statPillLabel}>{label}</Text>
    </View>
  );
}

function EmptyDay({ isToday, onBook }: { isToday: boolean; onBook: () => void }) {
  return (
    <View style={s.emptyWrap}>
      <View style={s.emptyIcon}>
        <Ionicons name="calendar-outline" size={28} color="rgba(255,255,255,0.2)" />
      </View>
      <Text style={s.emptyTitle}>No sessions scheduled</Text>
      <Text style={s.emptyDesc}>
        {isToday ? 'Enjoy your free day, or schedule a session.' : 'Tap below to book a session for this day.'}
      </Text>
      <TouchableOpacity
        style={s.emptyAddBtn}
        onPress={onBook}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Book a session for this day"
      >
        <Ionicons name="add" size={16} color="#0D0D12" />
        <Text style={s.emptyAddBtnText}>Book Session</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_BG     = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D12' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: W * 0.05, paddingTop: 10, paddingBottom: 14,
  },
  headerTitle: {
    fontFamily: FontFamily.heading,
    fontSize: Math.round(W * 0.065),
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: FontFamily.body,
    fontSize: Math.round(W * 0.03),
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todayBtn: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    minHeight: 44, justifyContent: 'center',
  },
  todayBtnText: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.032), color: '#FFFFFF',
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#C8F135', alignItems: 'center', justifyContent: 'center',
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: W * 0.05, marginBottom: 14,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: W * 0.05,
  },
  statsDivider: {
    width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: W * 0.04,
  },
  statPill: { flex: 1, alignItems: 'center', gap: 2 },
  statPillValue: { fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.055) },
  statPillLabel: {
    fontFamily: FontFamily.body, fontSize: Math.round(W * 0.025),
    color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3,
  },

  // Calendar section
  calendarSection: {
    marginHorizontal: W * 0.05,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 16, marginBottom: 12, overflow: 'hidden',
  },

  // Month toggle
  monthToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: W * 0.04, paddingVertical: 12,
    minHeight: 44,
  },
  monthToggleText: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.038), color: '#FFFFFF',
  },
  monthToggleYear: {
    fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.033),
    color: 'rgba(255,255,255,0.35)', marginLeft: 'auto',
  },

  // Full calendar container (animated maxHeight)
  fullCalWrap: { overflow: 'hidden' },

  // Week strip
  weekStrip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 4, paddingBottom: 10, gap: 2,
  },
  weekArrow: {
    width: 28, height: 60, alignItems: 'center', justifyContent: 'center',
  },
  dayCell: {
    flex: 1, alignItems: 'center', paddingVertical: 6,
    borderRadius: 10, gap: 3,
  },
  dayCellSelected: {
    backgroundColor: 'rgba(200,241,53,0.1)',
    borderWidth: 1, borderColor: 'rgba(200,241,53,0.25)',
  },
  dayName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: Math.round(W * 0.025),
    color: 'rgba(255,255,255,0.3)',
  },
  dayNameSel:   { color: '#C8F135' },
  dayNameToday: { color: '#C8F135' },
  dayNum: {
    width: Math.round(W * 0.082), height: Math.round(W * 0.082),
    borderRadius: Math.round(W * 0.041),
    alignItems: 'center', justifyContent: 'center',
  },
  dayNumSel:   { backgroundColor: '#C8F135' },
  dayNumToday: { borderWidth: 1.5, borderColor: '#C8F135' },
  dayNumText: {
    fontFamily: FontFamily.heading,
    fontSize: Math.round(W * 0.038),
    color: 'rgba(255,255,255,0.7)',
  },
  dayNumTextSel:   { color: '#0D0D12' },
  dayNumTextToday: { color: '#C8F135' },
  dotRow: { flexDirection: 'row', gap: 2, height: 5, alignItems: 'center' },
  dot: {
    width: Math.round(W * 0.011), height: Math.round(W * 0.011),
    borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotSel: { backgroundColor: '#C8F135' },

  // Day header
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: W * 0.05, marginBottom: 10,
  },
  dayHeaderTitle: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.042), color: '#FFFFFF',
  },
  sessionCountPill: {
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  sessionCountText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.028),
    color: 'rgba(255,255,255,0.5)',
  },

  // Session list
  sessionList: { paddingHorizontal: W * 0.05, gap: 8 },

  // Session card
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 16, overflow: 'hidden', minHeight: 80,
  },
  sessionDone: { opacity: 0.55 },

  typeBar: { width: 4, borderRadius: 0 },

  timeCol: {
    width: W * 0.165, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  timeStart: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.032), color: '#FFFFFF',
  },
  timeDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  timeEnd: {
    fontFamily: FontFamily.body, fontSize: Math.round(W * 0.026),
    color: 'rgba(255,255,255,0.35)',
  },
  timeDivider: {
    width: 1, backgroundColor: CARD_BORDER, marginVertical: 14,
  },

  sessionBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, paddingRight: 14 },
  sessionTop:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupAvatar: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  sessionInfo: { flex: 1 },
  sessionName: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.037),
    color: '#FFFFFF', marginBottom: 4,
  },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typePill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  typePillText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.023),
  },
  durationText: {
    fontFamily: FontFamily.body, fontSize: Math.round(W * 0.026),
    color: 'rgba(255,255,255,0.35)',
  },
  statusBadge: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },

  // Expanded actions
  expandedRow: {
    flexDirection: 'row', gap: 8,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: CARD_BORDER,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, minHeight: 44,
  },
  actionText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.028),
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center', paddingTop: 56, paddingHorizontal: W * 0.1,
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyTitle: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.042),
    color: '#FFFFFF', marginBottom: 8, textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: FontFamily.body, fontSize: Math.round(W * 0.033),
    color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#C8F135', paddingHorizontal: W * 0.062,
    paddingVertical: 13, borderRadius: 12, minHeight: 44,
  },
  emptyAddBtnText: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.033), color: '#0D0D12',
  },
});
