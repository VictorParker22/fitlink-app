/**
 * schedule.tsx — Coach Schedule Screen
 *
 * Design: Fitlink Coach Dashboard Redesign — fixed dark palette, one lime
 * accent (see constants/coachDesign.ts). Does NOT use useTheme().
 *
 * Layout notes (design turn 5 "Schedule"):
 *   • One accent only — session type is shown as a text label, never a colour.
 *   • Day list reads as a real timeline: gaps between sessions are rendered
 *     as proportional "free time" spacers instead of a flat equal-height list.
 *   • Week stats are demoted to a small strip under the day's sessions, not
 *     blocking the schedule at the top of the screen.
 *   • Two distinct empty states:
 *       - "Free day" (turn 5b) — shown when the coach HAS sessions elsewhere
 *         but the selected day is open. Surfaces regular weekday clients who
 *         haven't booked, framed as an opportunity.
 *       - "Nothing booked yet" (turn 10c) — shown when the coach has no
 *         sessions at all yet (brand-new account), across the whole schedule.
 *
 * Calendar approach (unchanged from prior implementation):
 *   • Custom week strip (always visible) — 7-day row with session dots
 *   • Tappable month header toggles to full month grid via react-native-calendars
 *   • Expand/collapse animated with Animated.timing on maxHeight
 *     (height cannot use the native driver — this is the correct RN approach)
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
  useState, useMemo, useCallback, useRef,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar } from 'react-native-calendars';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import CancelSessionSheet, { type SheetSession } from '../../components/sessions/CancelSessionSheet';

// ─── Layout ───────────────────────────────────────────────────────────────────

const { width: W } = Dimensions.get('window');
const FULL_CAL_HEIGHT = 320; // approximate height of react-native-calendars month grid
const PX_PER_MIN = 0.6;      // gap spacer scale — makes free time between sessions read proportionally
const GAP_THRESHOLD_MIN = 45; // gaps shorter than this render as a plain small space, not a "free" callout

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

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { sessions, getClientById, getSessionsForDate, updateSession, addSession, refreshData } = useApp();

  const [selectedDate, setSelectedDate]       = useState(new Date());
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [showFullCal, setShowFullCal]         = useState(false);
  const [refreshing, setRefreshing]           = useState(false);

  // ── Cancel sheet state ──
  const [cancelSheetSession, setCancelSheetSession] = useState<SheetSession | null>(null);
  const showCancelSheet = cancelSheetSession !== null;

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

  // Coach has never had a single session — the "day one" empty state (turn 10c),
  // distinct from an individual open day within an otherwise-booked schedule.
  const hasAnySessions = sessions.length > 0;

  // Sessions for the selected day, sorted by start time so the timeline reads correctly
  const daySessions = useMemo(
    () => [...getSessionsForDate(selectedDate)].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    ),
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

  // Week stats — demoted to a small strip under the day's sessions
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

  // Regular weekday clients who haven't booked the selected (open) day — powers the
  // "free day" opportunity panel (turn 5b). Only meaningful once there's a booking
  // history and only computed when the selected day itself has nothing on it.
  const dayOfWeekRegulars = useMemo(() => {
    if (daySessions.length > 0 || !hasAnySessions) return [];
    const weekday = selectedDate.getDay();
    const byClient: Record<string, { count: number; minutesOfDay: number[] }> = {};
    sessions.forEach(sess => {
      if (!sess.client_id || sess.status === 'cancelled') return;
      const sd = new Date(sess.date);
      if (sd.getDay() !== weekday) return;
      if (!byClient[sess.client_id]) byClient[sess.client_id] = { count: 0, minutesOfDay: [] };
      byClient[sess.client_id].count += 1;
      byClient[sess.client_id].minutesOfDay.push(sd.getHours() * 60 + sd.getMinutes());
    });
    return Object.entries(byClient)
      .filter(([, v]) => v.count >= 2) // a repeated pattern, not a one-off booking
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([clientId, v]) => {
        const client = getClientById(clientId);
        const avgMin = Math.round(v.minutesOfDay.reduce((a, b) => a + b, 0) / v.minutesOfDay.length);
        const timeLabel = new Date(2000, 0, 1, Math.floor(avgMin / 60), avgMin % 60)
          .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return client ? { clientId, client, timeLabel } : null;
      })
      .filter((r): r is { clientId: string; client: NonNullable<ReturnType<typeof getClientById>>; timeLabel: string } => r !== null);
  }, [daySessions, sessions, selectedDate, hasAnySessions, getClientById]);

  // Marked dates for react-native-calendars (dots on days with sessions)
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    sessions.forEach(sess => {
      const key = sess.date.split('T')[0];
      if (!marks[key]) {
        marks[key] = { dots: [{ color: CoachColors.accent }], marked: true };
      }
    });
    // Selected day
    const selKey = toDateKey(selectedDate);
    marks[selKey] = {
      ...(marks[selKey] || {}),
      selected: true,
      selectedColor: CoachColors.accent,
      selectedTextColor: CoachColors.onAccent,
    };
    // Today (if not selected) — mark so the theme's todayTextColor still applies
    const todayKey = toDateKey(today);
    if (todayKey !== selKey && !marks[todayKey]) {
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

  /** Complete → navigate to smart summary screen instead of bare status update */
  const handleComplete = useCallback((session: any) => {
    setExpandedSession(null);
    router.push(`/session/complete?sessionId=${session.id}` as any);
  }, [router]);

  /** Cancel → open reason sheet (not a bare updateSession call) */
  const handleOpenCancel = useCallback((session: any) => {
    const sheetSession: SheetSession = {
      id:         session.id,
      date:       session.date,
      type:       session.type,
      duration:   session.duration,
      client_id:  session.client_id,
      group_name: session.group_name,
    };
    setCancelSheetSession(sheetSession);
    setExpandedSession(null);
  }, []);

  const bookForDate = useCallback((clientId?: string) => {
    const qs = clientId
      ? `?date=${selectedDate.toISOString()}&clientId=${clientId}`
      : `?date=${selectedDate.toISOString()}`;
    router.push(`/book-session${qs}` as any);
  }, [router, selectedDate]);

  const isToday = isSameDay(selectedDate, today);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── HEADER ───────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Schedule</Text>
            <Text style={s.headerSub}>
              {monthLabel} {yearLabel}
              {hasAnySessions
                ? ` · ${weekStats.total} session${weekStats.total !== 1 ? 's' : ''} this week`
                : ' · nothing booked'}
            </Text>
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
              onPress={() => bookForDate()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Book new session"
            >
              <Ionicons name="add" size={22} color={CoachColors.onAccent} />
            </TouchableOpacity>
          </View>
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
              color={CoachColors.textFaint}
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
                  textSectionTitleColor:        CoachColors.textFaint,
                  textSectionTitleDisabledColor:CoachColors.borderMuted,
                  selectedDayBackgroundColor:   CoachColors.accent,
                  selectedDayTextColor:         CoachColors.onAccent,
                  todayTextColor:               CoachColors.accent,
                  dayTextColor:                 CoachColors.textPrimary,
                  textDisabledColor:            CoachColors.borderMuted,
                  dotColor:                     CoachColors.accent,
                  selectedDotColor:             CoachColors.onAccent,
                  arrowColor:                   CoachColors.textFaint,
                  monthTextColor:               'transparent', // hide — we have our own header
                  indicatorColor:               CoachColors.accent,
                  textDayFontFamily:            CoachFonts.bodyMedium,
                  textMonthFontFamily:          CoachFonts.headingBold,
                  textDayHeaderFontFamily:      CoachFonts.bodySemiBold,
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
              <Ionicons name="chevron-back" size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>

            {weekDays.map((d, i) => {
              const isSelected = isSameDay(d, selectedDate);
              const isTodayCell = isSameDay(d, today);
              const count      = sessionsByDay[toDateKey(d)] || 0;
              const dateLabel  = d.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              });

              return (
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }}
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
                    isTodayCell && !isSelected && s.dayNameToday,
                  ]}>
                    {DAY_NAMES_SHORT[i]}
                  </Text>

                  {/* Day number circle */}
                  <View style={[
                    s.dayNum,
                    isSelected && s.dayNumSel,
                    isTodayCell && !isSelected && s.dayNumToday,
                  ]}>
                    <Text style={[
                      s.dayNumText,
                      isSelected && s.dayNumTextSel,
                      isTodayCell && !isSelected && s.dayNumTextToday,
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
              <Ionicons name="chevron-forward" size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>
          </View>
        </View>

        {!hasAnySessions ? (
          // ── Nothing booked at all yet (day-one empty state) ─────────────
          <ScrollView
            contentContainerStyle={[s.emptyScroll, { paddingBottom: insets.bottom + 130 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} />
            }
          >
            <NothingBookedYet
              onSetHours={() => router.push('/settings' as any)}
              onBook={() => bookForDate()}
            />
          </ScrollView>
        ) : (
          <>
            {/* ── DAY HEADER ───────────────────────────────────────────── */}
            <View style={s.dayHeader}>
              <Text style={s.dayHeaderTitle}>
                {isToday
                  ? 'Today'
                  : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
              {daySessions.length > 0 ? (
                <View style={s.sessionCountPill}>
                  <Text style={s.sessionCountText}>
                    {daySessions.length} session{daySessions.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              ) : (
                <Text style={s.nothingBookedText}>Nothing booked</Text>
              )}
            </View>

            {/* ── DAY TIMELINE ─────────────────────────────────────────── */}
            <ScrollView
              contentContainerStyle={[s.sessionList, { paddingBottom: insets.bottom + 130 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} />
              }
            >
              {daySessions.length === 0 ? (
                <FreeDay
                  regulars={dayOfWeekRegulars}
                  onOfferSlot={(clientId) => bookForDate(clientId)}
                  onBook={() => bookForDate()}
                />
              ) : (
                <DayTimeline
                  sessions={daySessions}
                  now={today}
                  isToday={isToday}
                  expandedSession={expandedSession}
                  onToggleExpand={id => setExpandedSession(prev => (prev === id ? null : id))}
                  getClientById={getClientById}
                  onComplete={handleComplete}
                  onCancel={handleOpenCancel}
                  onUndo={id => handleStatus(id, 'upcoming')}
                  onNotes={id => router.push(`/session-notes?sessionId=${id}` as any)}
                  onDetails={id => router.push(`/session/${id}?mode=detail` as any)}
                />
              )}

              {/* ── WEEK STATS (demoted) ─────────────────────────────── */}
              <View style={s.statsStrip}>
                <StatTile label="This week" value={String(weekStats.total)} sub="sessions" />
                <StatTile label="Completed" value={String(weekStats.completed)} sub={`of ${weekStats.total}`} />
                <StatTile label="Booked" value={weekStats.hours.toFixed(1)} sub="hours" />
              </View>
            </ScrollView>
          </>
        )}
      </SafeAreaView>

      {/* ── Cancel Session Sheet — rendered outside SafeAreaView so it covers full screen ── */}
      <CancelSessionSheet
        visible={showCancelSheet}
        session={cancelSheetSession}
        onDismiss={() => setCancelSheetSession(null)}
        onDone={() => {
          setCancelSheetSession(null);
          refreshData();        // re-fetch so the schedule reflects the change
        }}
      />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={s.statTile} accessibilityLabel={`${label}: ${value} ${sub}`}>
      <Text style={s.statTileLabel}>{label}</Text>
      <Text style={s.statTileValue}>{value}</Text>
      <Text style={s.statTileSub}>{sub}</Text>
    </View>
  );
}

interface DayTimelineProps {
  sessions: any[];
  now: Date;
  isToday: boolean;
  expandedSession: string | null;
  onToggleExpand: (id: string) => void;
  getClientById: (id: string) => any;
  onComplete: (session: any) => void;
  onCancel: (session: any) => void;
  onUndo: (id: string) => void;
  onNotes: (id: string) => void;
  onDetails: (id: string) => void;
}

/** Renders the day's sessions as a real timeline — gaps between sessions are
 * proportional "free time" spacers so the day's actual shape reads at a glance. */
function DayTimeline({
  sessions, now, isToday, expandedSession, onToggleExpand, getClientById,
  onComplete, onCancel, onUndo, onNotes, onDetails,
}: DayTimelineProps) {
  // Index of the next upcoming session today (used to highlight the "current" card)
  const nextUpcomingIdx = isToday
    ? sessions.findIndex(sess => sess.status === 'upcoming' && new Date(sess.date).getTime() >= now.getTime())
    : -1;

  const rows: React.ReactNode[] = [];

  sessions.forEach((session, i) => {
    const startDt = new Date(session.date);
    const endDt   = new Date(startDt.getTime() + session.duration * 60000);

    rows.push(
      <SessionRow
        key={session.id}
        session={session}
        client={session.client_id ? getClientById(session.client_id) : undefined}
        startDt={startDt}
        endDt={endDt}
        isNext={i === nextUpcomingIdx}
        isExpanded={expandedSession === session.id}
        onToggleExpand={() => onToggleExpand(session.id)}
        onComplete={() => onComplete(session)}
        onCancel={() => onCancel(session)}
        onUndo={() => onUndo(session.id)}
        onNotes={() => onNotes(session.id)}
        onDetails={() => onDetails(session.id)}
      />
    );

    const nextSession = sessions[i + 1];
    if (nextSession) {
      const gapMin = (new Date(nextSession.date).getTime() - endDt.getTime()) / 60000;
      if (gapMin >= GAP_THRESHOLD_MIN) {
        const spacerHeight = Math.min(140, Math.max(40, gapMin * PX_PER_MIN));
        rows.push(
          <View key={`gap-${session.id}`} style={[s.gapRow, { height: spacerHeight }]}>
            <View style={s.gapTimeCol} />
            <View style={s.gapLine} />
            <View style={s.gapLabelWrap}>
              <Text style={s.gapLabel}>{formatDuration(gapMin)} free</Text>
            </View>
          </View>
        );
      }
    }
  });

  return <View>{rows}</View>;
}

interface SessionRowProps {
  session: any;
  client: any;
  startDt: Date;
  endDt: Date;
  isNext: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onNotes: () => void;
  onDetails: () => void;
}

function SessionRow({
  session, client, startDt, endDt, isNext, isExpanded, onToggleExpand,
  onComplete, onCancel, onUndo, onNotes, onDetails,
}: SessionRowProps) {
  const isCompleted = session.status === 'completed';
  const isCancelled = session.status === 'cancelled';
  const isPast      = isCompleted || isCancelled;
  const timeStr = startDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endStr  = endDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const metaParts = [session.type, `${session.duration} min`];
  if (session.notes) metaParts.push('has notes');
  const metaLine = metaParts.join(' · ');

  const statusSub = isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : metaLine;

  return (
    <View style={[s.row, isPast && s.rowPast]}>
      {/* Time column */}
      <View style={s.timeCol}>
        <Text style={[s.timeStart, isNext && s.timeStartNext]}>{timeStr}</Text>
        {!isPast && <Text style={s.timeEnd}>{endStr}</Text>}
      </View>

      {/* Vertical connector */}
      <View style={[s.timeLine, isNext && s.timeLineNext]} />

      {/* Card */}
      <TouchableOpacity
        style={s.cardWrap}
        activeOpacity={0.85}
        onPress={onToggleExpand}
        disabled={isCancelled}
        accessibilityRole="button"
        accessibilityLabel={`${client?.name || session.group_name || 'Session'}, ${timeStr}, ${session.type}, ${session.duration} minutes`}
        accessibilityHint={isPast ? undefined : 'Double-tap to expand actions'}
      >
        <View style={[s.card, isCompleted && s.cardCompleted, isNext && s.cardNext]}>
          <View style={s.cardTop}>
            {client ? (
              <Avatar name={client.name} size="sm" imageUrl={client.avatar_url} />
            ) : (
              <View style={s.groupAvatar}>
                <Ionicons name="people" size={16} color={CoachColors.textSecondary} />
              </View>
            )}

            <View style={s.cardInfo}>
              <Text
                style={[s.cardName, isCompleted && s.cardNameDone]}
                numberOfLines={1}
              >
                {client?.name || session.group_name || 'Session'}
              </Text>
              <Text style={[s.cardMeta, isCancelled && s.cardMetaCancelled]} numberOfLines={1}>
                {statusSub}
              </Text>
            </View>

            {isCompleted && (
              <View style={s.statusBadge}>
                <Ionicons name="checkmark" size={16} color={CoachColors.textSecondary} />
              </View>
            )}
            {isCancelled && (
              <View style={s.statusBadge}>
                <Ionicons name="close" size={16} color={CoachColors.danger} />
              </View>
            )}
            {session.status === 'upcoming' && (
              <Ionicons
                name="chevron-down"
                size={16}
                color={isExpanded ? CoachColors.accent : CoachColors.textFaint}
              />
            )}
          </View>

          {/* ── Expanded actions ── */}
          {isExpanded && session.status === 'upcoming' && (
            <View style={s.expandedRow}>
              <TouchableOpacity
                style={s.actionBtn}
                onPress={onComplete}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Mark session as completed"
              >
                <Ionicons name="checkmark-circle-outline" size={17} color={CoachColors.textPrimary} />
                <Text style={s.actionText}>Complete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.actionBtn}
                onPress={onDetails}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View session details"
              >
                <Ionicons name="document-text-outline" size={17} color={CoachColors.textPrimary} />
                <Text style={s.actionText}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.actionBtn}
                onPress={onCancel}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Cancel session"
              >
                <Ionicons name="close-circle-outline" size={17} color={CoachColors.danger} />
                <Text style={[s.actionText, { color: CoachColors.danger }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {isExpanded && session.status !== 'upcoming' && !isCancelled && (
            <View style={s.expandedRow}>
              <TouchableOpacity
                style={s.actionBtn}
                onPress={onUndo}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Undo — mark session as upcoming"
              >
                <Ionicons name="arrow-undo" size={16} color={CoachColors.textSecondary} />
                <Text style={s.actionText}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { flex: 2 }]}
                onPress={onNotes}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={session.notes ? 'Edit session notes' : 'Add session notes'}
              >
                <Ionicons name="document-text-outline" size={16} color={CoachColors.textPrimary} />
                <Text style={s.actionText}>{session.notes ? 'Edit notes' : 'Add notes'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

/** Turn 5b — an open day within an otherwise-populated schedule. Framed as an
 * opportunity: surfaces regular weekday clients who haven't booked. */
function FreeDay({
  regulars, onOfferSlot, onBook,
}: {
  regulars: { clientId: string; client: any; timeLabel: string }[];
  onOfferSlot: (clientId: string) => void;
  onBook: () => void;
}) {
  return (
    <View style={s.freeDayCard}>
      <Text style={s.freeDayTitle}>Your day is free.</Text>
      {regulars.length > 0 ? (
        <>
          <Text style={s.freeDayDesc}>
            {regulars.length === 1
              ? 'One athlete usually trains this day and hasn’t booked yet.'
              : `${regulars.length} athletes usually train this day and haven’t booked yet.`}
          </Text>
          <View style={s.regularsList}>
            {regulars.map(r => (
              <View key={r.clientId} style={s.regularRow}>
                <Avatar name={r.client.name} size="sm" imageUrl={r.client.avatar_url} />
                <View style={s.regularInfo}>
                  <Text style={s.regularName} numberOfLines={1}>{r.client.name}</Text>
                  <Text style={s.regularSub}>Usually around {r.timeLabel}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => onOfferSlot(r.clientId)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Offer a slot to ${r.client.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.offerSlotText}>Offer slot</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text style={s.freeDayDesc}>Tap below to book a session for this day.</Text>
      )}
      <TouchableOpacity
        style={s.freeDayCta}
        onPress={onBook}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Book a session for this day"
      >
        <Text style={s.freeDayCtaText}>Book a session</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Turn 10c — the coach has no sessions at all yet, anywhere in the schedule. */
function NothingBookedYet({ onSetHours, onBook }: { onSetHours: () => void; onBook: () => void }) {
  return (
    <View style={s.freeDayCard}>
      <Text style={s.freeDayTitle}>Your week is open</Text>
      <Text style={s.freeDayDesc}>
        Set the hours you&apos;re available and athletes can book themselves in, or book a session yourself.
      </Text>
      <TouchableOpacity
        style={s.freeDayCta}
        onPress={onSetHours}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Set your available hours"
      >
        <Text style={s.freeDayCtaText}>Set your hours</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.freeDaySecondaryCta}
        onPress={onBook}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Book a session"
      >
        <Text style={s.freeDaySecondaryCtaText}>Book a session</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CoachColors.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: W * 0.05, paddingTop: 10, paddingBottom: 14,
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: Math.round(W * 0.065),
    color: CoachColors.textPrimary,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: CoachFonts.body,
    fontSize: Math.round(W * 0.03),
    color: CoachColors.textMuted,
    marginTop: 2,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todayBtn: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border,
    minHeight: 44, justifyContent: 'center',
  },
  todayBtnText: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: Math.round(W * 0.032), color: CoachColors.textPrimary,
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center',
  },

  // Calendar section
  calendarSection: {
    marginHorizontal: W * 0.05,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 16, borderCurve: 'continuous', marginBottom: 12, overflow: 'hidden',
  },

  // Month toggle
  monthToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: W * 0.04, paddingVertical: 12,
    minHeight: 44,
  },
  monthToggleText: {
    fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.038), color: CoachColors.textPrimary,
  },
  monthToggleYear: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.033),
    color: CoachColors.textMuted, marginLeft: 'auto',
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
    borderRadius: 10, borderCurve: 'continuous', gap: 3,
  },
  dayCellSelected: {
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.25)',
  },
  dayName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: Math.round(W * 0.025),
    color: CoachColors.textFaint,
  },
  dayNameSel:   { color: CoachColors.accent },
  dayNameToday: { color: CoachColors.accent },
  dayNum: {
    width: Math.round(W * 0.082), height: Math.round(W * 0.082),
    borderRadius: Math.round(W * 0.041),
    borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
  },
  dayNumSel:   { backgroundColor: CoachColors.accent },
  dayNumToday: { borderWidth: 1.5, borderColor: CoachColors.accent },
  dayNumText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: Math.round(W * 0.038),
    color: CoachColors.textSecondary,
  },
  dayNumTextSel:   { color: CoachColors.onAccent },
  dayNumTextToday: { color: CoachColors.accent },
  dotRow: { flexDirection: 'row', gap: 2, height: 5, alignItems: 'center' },
  dot: {
    width: Math.round(W * 0.011), height: Math.round(W * 0.011),
    borderRadius: 99, borderCurve: 'continuous', backgroundColor: CoachColors.border,
  },
  dotSel: { backgroundColor: CoachColors.accent },

  // Day header
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: W * 0.05, marginBottom: 10,
  },
  dayHeaderTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.042), color: CoachColors.textPrimary,
  },
  sessionCountPill: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderCurve: 'continuous',
  },
  sessionCountText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.028),
    color: CoachColors.textSecondary,
  },
  nothingBookedText: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.03),
    color: CoachColors.textMuted,
  },

  // Session list / timeline
  sessionList: { paddingHorizontal: W * 0.05, paddingTop: 2 },

  row: { flexDirection: 'row', gap: 12 },
  rowPast: { opacity: 0.55 },

  timeCol: {
    width: W * 0.14, paddingTop: 3, alignItems: 'flex-end',
  },
  timeStart: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: Math.round(W * 0.032), color: CoachColors.textSecondary,
  },
  timeStartNext: { color: CoachColors.accent },
  timeEnd: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.026),
    color: CoachColors.textFaint, marginTop: 1,
  },
  timeLine: {
    width: 2, borderRadius: 1, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted,
    marginTop: 4, marginBottom: 14,
  },
  timeLineNext: { backgroundColor: CoachColors.accent },

  cardWrap: { flex: 1, paddingBottom: 14 },
  card: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, borderCurve: 'continuous', padding: 14,
  },
  cardCompleted: { backgroundColor: 'transparent', borderStyle: 'solid' },
  cardNext: { borderColor: CoachColors.border },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  groupAvatar: {
    width: 32, height: 32, borderRadius: 8, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: Math.round(W * 0.037),
    color: CoachColors.textPrimary,
  },
  cardNameDone: { textDecorationLine: 'line-through', color: CoachColors.textMuted },
  cardMeta: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.028),
    color: CoachColors.textMuted, marginTop: 2,
  },
  cardMetaCancelled: { color: CoachColors.danger },
  statusBadge: {
    width: 28, height: 28, borderRadius: 8, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', backgroundColor: CoachColors.borderMuted,
  },

  // Free-time gap spacer
  gapRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  gapTimeCol: { width: W * 0.14 },
  gapLine: {
    width: 2, borderRadius: 1, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted,
  },
  gapLabelWrap: { flex: 1, justifyContent: 'center', alignItems: 'flex-start' },
  gapLabel: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.028),
    color: CoachColors.textFaint,
  },

  // Expanded actions
  expandedRow: {
    flexDirection: 'row', gap: 8,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 11, borderRadius: 10, borderCurve: 'continuous',
    borderWidth: 1, borderColor: CoachColors.border, minHeight: 44,
  },
  actionText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.028),
    color: CoachColors.textPrimary,
  },

  // Week stats (demoted)
  statsStrip: {
    flexDirection: 'row', gap: 10, marginTop: 4,
  },
  statTile: {
    flex: 1, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, borderCurve: 'continuous', paddingVertical: 12, paddingHorizontal: 12,
  },
  statTileLabel: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.026), color: CoachColors.textMuted,
  },
  statTileValue: {
    fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.042), color: CoachColors.textPrimary,
    marginTop: 3,
  },
  statTileSub: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.025), color: CoachColors.textMuted, marginTop: 1,
  },

  // Empty-state scroll wrapper (when there are no sessions at all)
  emptyScroll: { paddingHorizontal: W * 0.05, paddingTop: 6 },

  // Free day / nothing booked yet card (shared shape, turns 5b + 10c)
  freeDayCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 16, borderCurve: 'continuous', padding: 18,
  },
  freeDayTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.045), color: CoachColors.textPrimary,
  },
  freeDayDesc: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.033),
    color: CoachColors.textSecondary, marginTop: 8, lineHeight: 21.5,
  },
  regularsList: { marginTop: 14 },
  regularRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
    minHeight: 44,
  },
  regularInfo: { flex: 1 },
  regularName: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.034), color: CoachColors.textPrimary,
  },
  regularSub: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.028), color: CoachColors.textMuted, marginTop: 1,
  },
  offerSlotText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.03), color: CoachColors.accent,
  },
  freeDayCta: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 13, alignItems: 'center', marginTop: 16, minHeight: 44, justifyContent: 'center',
  },
  freeDayCtaText: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: Math.round(W * 0.035), color: CoachColors.onAccent,
  },
  freeDaySecondaryCta: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 11, alignItems: 'center', marginTop: 9, minHeight: 44, justifyContent: 'center',
  },
  freeDaySecondaryCtaText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.032), color: CoachColors.textPrimary,
  },
});
