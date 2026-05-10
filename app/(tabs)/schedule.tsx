import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Calendar, DateData } from 'react-native-calendars';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import { useTheme } from '../../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDateString(date: Date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

export default function ScheduleScreen() {
  const router = useRouter();
  const { sessions, getClientById, getSessionsForDate, updateSession, refreshData } = useApp();
  const { colors } = useTheme();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCalendar, setShowCalendar] = useState(true);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const today = new Date();
  const daySessions = useMemo(() => getSessionsForDate(selectedDate), [selectedDate, sessions]);

  // Build marked dates for the calendar
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    // Mark all dates with sessions
    sessions.forEach((session) => {
      const dateStr = new Date(session.date).toISOString().split('T')[0];
      const typeColor = session.type === '1-on-1' ? Colors.accent
        : session.type === 'Group' ? Colors.purple
        : Colors.blue;

      if (!marks[dateStr]) {
        marks[dateStr] = { dots: [], marked: true };
      }
      // Add dot if not already same color
      if (!marks[dateStr].dots.find((d: any) => d.color === typeColor)) {
        marks[dateStr].dots.push({ key: session.id, color: typeColor });
      }
    });

    // Mark selected date
    const selectedStr = toDateString(selectedDate);
    marks[selectedStr] = {
      ...marks[selectedStr],
      selected: true,
      selectedColor: Colors.accent,
      selectedTextColor: Colors.white,
    };

    return marks;
  }, [sessions, selectedDate]);

  const handleDayPress = (day: DateData) => {
    setSelectedDate(new Date(day.dateString + 'T12:00:00'));
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
    '1-on-1': Colors.accent,
    'Group': Colors.purple,
    'Virtual': Colors.blue,
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Schedule</Text>
          <Text style={styles.subtitle}>
            {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setShowCalendar(!showCalendar)}
          >
            <Ionicons
              name={showCalendar ? 'chevron-up' : 'calendar-outline'}
              size={18}
              color={Colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            activeOpacity={0.8}
            onPress={() => router.push(`/book-session?date=${selectedDate.toISOString()}` as any)}
          >
            <Ionicons name="add" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Calendar */}
      {showCalendar && (
        <View style={styles.calendarWrapper}>
          <Calendar
            current={toDateString(selectedDate)}
            onDayPress={handleDayPress}
            markingType="multi-dot"
            markedDates={markedDates}
            enableSwipeMonths
            hideExtraDays
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: Colors.textTertiary,
              textSectionTitleDisabledColor: Colors.border,
              selectedDayBackgroundColor: Colors.accent,
              selectedDayTextColor: Colors.white,
              todayTextColor: Colors.accent,
              todayBackgroundColor: Colors.accentSoft,
              dayTextColor: Colors.textPrimary,
              textDisabledColor: Colors.border,
              arrowColor: Colors.textSecondary,
              monthTextColor: Colors.textPrimary,
              textMonthFontFamily: FontFamily.headingSemiBold,
              textDayHeaderFontFamily: FontFamily.bodySemiBold,
              textDayFontFamily: FontFamily.bodyMedium,
              textMonthFontSize: FontSize.md,
              textDayHeaderFontSize: 11,
              textDayFontSize: FontSize.base,
              'stylesheet.calendar.header': {
                header: {
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingHorizontal: 4,
                  marginBottom: 8,
                },
                dayTextAtIndex0: { color: Colors.accent },
                dayTextAtIndex6: { color: Colors.accent },
              },
            }}
          />
        </View>
      )}

      {/* Day Label */}
      <View style={styles.dayHeader}>
        <View>
          <Text style={styles.dayTitle}>
            {isSameDay(selectedDate, today) ? 'Today' :
              selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
          <Text style={styles.dayCount}>
            {daySessions.length} session{daySessions.length !== 1 ? 's' : ''}
          </Text>
        </View>
        {/* Session type legend */}
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
          <View style={[styles.legendDot, { backgroundColor: Colors.purple }]} />
          <View style={[styles.legendDot, { backgroundColor: Colors.blue }]} />
        </View>
      </View>

      {/* Sessions Timeline */}
      <ScrollView
        contentContainerStyle={styles.sessionList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {daySessions.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-outline" size={32} color={Colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>No sessions</Text>
            <Text style={styles.emptyText}>Nothing scheduled for this day</Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push(`/book-session?date=${selectedDate.toISOString()}` as any)}
            >
              <Ionicons name="add" size={16} color={Colors.white} />
              <Text style={styles.emptyBtnText}>Book Session</Text>
            </TouchableOpacity>
          </View>
        ) : (
          daySessions.map((session, index) => {
            const client = getClientById(session.client_id || '');
            const dt = new Date(session.date);
            const endTime = new Date(dt.getTime() + session.duration * 60000);
            const typeColor = typeColors[session.type] || Colors.accent;
            const isDone = session.status !== 'upcoming';
            const isExpanded = expandedSession === session.id;

            return (
              <TouchableOpacity
                key={session.id}
                activeOpacity={0.8}
                onPress={() => setExpandedSession(isExpanded ? null : session.id)}
              >
                <View style={styles.timelineItem}>
                  {/* Timeline left column */}
                  <View style={styles.timelineLeft}>
                    <Text style={styles.timelineTime}>
                      {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                    <View style={[styles.timelineLine, { backgroundColor: typeColor }]} />
                    {index < daySessions.length - 1 && (
                      <View style={styles.timelineConnector} />
                    )}
                  </View>

                  {/* Session card */}
                  <Card style={[styles.sessionCard, isDone && styles.sessionDone]}>
                    <View style={[styles.sessionAccent, { backgroundColor: typeColor }]} />
                    <View style={styles.sessionContent}>
                      <View style={styles.sessionRow}>
                        {client ? <Avatar name={client.name} size="sm" /> : (
                          <View style={[styles.groupAvatar, { backgroundColor: Colors.purple }]}>
                            <Text style={styles.groupAvatarText}>G</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sessionName}>{client?.name || session.group_name}</Text>
                          <View style={styles.sessionMeta}>
                            <View style={[styles.badge, { backgroundColor: `${typeColor}15` }]}>
                              <Text style={[styles.badgeText, { color: typeColor }]}>{session.type}</Text>
                            </View>
                            <Text style={styles.sessionDuration}>{session.duration}min</Text>
                            <Text style={styles.sessionEndTime}>
                              → {endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </Text>
                          </View>
                        </View>
                        {session.status === 'completed' && (
                          <View style={[styles.statusChip, { backgroundColor: Colors.greenSoft }]}>
                            <Ionicons name="checkmark-circle" size={12} color={Colors.green} />
                          </View>
                        )}
                        {session.status === 'cancelled' && (
                          <View style={[styles.statusChip, { backgroundColor: Colors.redSoft }]}>
                            <Ionicons name="close-circle" size={12} color={Colors.red} />
                          </View>
                        )}
                      </View>

                      {/* Expanded actions */}
                      {isExpanded && session.status === 'upcoming' && (
                        <View style={styles.actions}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: Colors.greenSoft }]}
                            onPress={() => handleStatusChange(session.id, 'completed')}
                          >
                            <Ionicons name="checkmark" size={14} color={Colors.green} />
                            <Text style={[styles.actionText, { color: Colors.green }]}>Complete</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: Colors.redSoft }]}
                            onPress={() => handleStatusChange(session.id, 'cancelled')}
                          >
                            <Ionicons name="close" size={14} color={Colors.red} />
                            <Text style={[styles.actionText, { color: Colors.red }]}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {isExpanded && session.status !== 'upcoming' && (
                        <View style={styles.actions}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: colors.bgElevated, flex: 1 }]}
                            onPress={() => handleStatusChange(session.id, 'upcoming')}
                          >
                            <Text style={[styles.actionText, { color: colors.textSecondary }]}>Undo</Text>
                          </TouchableOpacity>
                          {session.status === 'completed' && (
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: `${Colors.purple}15`, flex: 2, marginLeft: Spacing.sm }]}
                              onPress={() => router.push(`/session-notes?sessionId=${session.id}` as any)}
                            >
                              <Ionicons name="document-text" size={14} color={Colors.purple} />
                              <Text style={[styles.actionText, { color: Colors.purple }]}>{session.notes ? 'Edit Notes' : 'Add Notes'}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  </Card>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  /* Header */
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  toggleBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },

  /* Calendar */
  calendarWrapper: {
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  /* Day Header */
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: Spacing.md,
  },
  dayTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  dayCount: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  legend: { flexDirection: 'row', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },

  /* Timeline */
  sessionList: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  timelineItem: { flexDirection: 'row', marginBottom: Spacing.xs },
  timelineLeft: { width: 56, alignItems: 'center', paddingTop: 14 },
  timelineTime: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.textTertiary, marginBottom: 6 },
  timelineLine: { width: 8, height: 8, borderRadius: 4 },
  timelineConnector: {
    width: 1.5, flex: 1, backgroundColor: Colors.border,
    marginTop: 4, minHeight: 20,
  },

  /* Session Card */
  sessionCard: { flex: 1, marginBottom: 0, overflow: 'hidden', paddingVertical: 0, paddingHorizontal: 0 },
  sessionDone: { opacity: 0.55 },
  sessionAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, borderTopLeftRadius: Radius.md, borderBottomLeftRadius: Radius.md },
  sessionContent: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, paddingLeft: Spacing.lg },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sessionName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 3 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.xs },
  badgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 9 },
  sessionDuration: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  sessionEndTime: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  groupAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  groupAvatarText: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: Colors.white },
  statusChip: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  /* Actions */
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: Radius.sm },
  actionText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  /* Empty State */
  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, marginTop: Spacing.md,
  },
  emptyBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.white },
});
