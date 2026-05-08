import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWeekDates(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(d);
    dt.setDate(d.getDate() + i);
    return dt;
  });
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ScheduleScreen() {
  const router = useRouter();
  const { sessions, getClientById, getSessionsForDate, updateSession, refreshData } = useApp();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const today = new Date();
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const daySessions = useMemo(() => getSessionsForDate(selectedDate), [selectedDate, sessions]);

  const navigateWeek = (dir: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir * 7);
    setSelectedDate(d);
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Schedule</Text>
          <Text style={styles.subtitle}>
            {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={() => router.push(`/book-session?date=${selectedDate.toISOString()}` as any)}>
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Week Navigator */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.weekArrow}>
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.weekDays}>
          {weekDates.map((date, i) => {
            const isToday = isSameDay(date, today);
            const isSelected = isSameDay(date, selectedDate);
            const hasSession = getSessionsForDate(date).length > 0;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.dayBtn, isSelected && styles.dayBtnSelected, isToday && !isSelected && styles.dayBtnToday]}
                onPress={() => setSelectedDate(new Date(date))}
              >
                <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>{DAY_NAMES[date.getDay()]}</Text>
                <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>{date.getDate()}</Text>
                {hasSession && <View style={[styles.dayDot, isSelected && styles.dayDotSelected]} />}
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.weekArrow}>
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Day Label */}
      <View style={styles.dayHeader}>
        <Text style={styles.dayTitle}>
          {isSameDay(selectedDate, today) ? 'Today' :
            selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </Text>
        <Text style={styles.dayCount}>{daySessions.length} session{daySessions.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Sessions */}
      <ScrollView
        contentContainerStyle={styles.sessionList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {daySessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No sessions</Text>
            <Text style={styles.emptyText}>Nothing scheduled for this day</Text>
          </View>
        ) : (
          daySessions.map((session) => {
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
                <Card style={[styles.sessionCard, isDone && styles.sessionDone, { borderLeftWidth: 3, borderLeftColor: isDone ? (session.status === 'completed' ? Colors.green : Colors.red) : typeColor }]}>
                  {/* Time + Info */}
                  <View style={styles.sessionRow}>
                    <View style={styles.sessionTime}>
                      <Text style={styles.timeStart}>{dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
                      <Text style={styles.timeEnd}>{endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
                    </View>
                    {client ? <Avatar name={client.name} size="sm" /> : (
                      <View style={[styles.groupAvatar, { backgroundColor: Colors.purple }]}><Text style={styles.groupAvatarText}>G</Text></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionName}>{client?.name || session.group_name}</Text>
                      <View style={styles.sessionBadges}>
                        <View style={[styles.badge, { backgroundColor: `${typeColor}20` }]}>
                          <Text style={[styles.badgeText, { color: typeColor }]}>{session.type}</Text>
                        </View>
                        <Text style={styles.sessionDuration}>{session.duration}min</Text>
                      </View>
                    </View>
                    {session.status === 'completed' && (
                      <View style={[styles.statusBadge, { backgroundColor: Colors.greenSoft }]}>
                        <Text style={[styles.statusBadgeText, { color: Colors.green }]}>Done</Text>
                      </View>
                    )}
                    {session.status === 'cancelled' && (
                      <View style={[styles.statusBadge, { backgroundColor: Colors.redSoft }]}>
                        <Text style={[styles.statusBadgeText, { color: Colors.red }]}>Cancelled</Text>
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
                        <Ionicons name="checkmark" size={16} color={Colors.green} />
                        <Text style={[styles.actionText, { color: Colors.green }]}>Complete</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.redSoft }]}
                        onPress={() => handleStatusChange(session.id, 'cancelled')}
                      >
                        <Ionicons name="close" size={16} color={Colors.red} />
                        <Text style={[styles.actionText, { color: Colors.red }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {isExpanded && session.status !== 'upcoming' && (
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.bgElevated, flex: 1 }]}
                        onPress={() => handleStatusChange(session.id, 'upcoming')}
                      >
                        <Text style={[styles.actionText, { color: Colors.textSecondary }]}>Undo — Mark as Upcoming</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </Card>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },

  weekNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, marginTop: Spacing.lg },
  weekArrow: { padding: 6 },
  weekDays: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  dayBtn: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: Radius.md, minWidth: 36 },
  dayBtnSelected: { backgroundColor: Colors.accent },
  dayBtnToday: { borderWidth: 1, borderColor: Colors.accent },
  dayName: { fontFamily: FontFamily.body, fontSize: 9, color: Colors.textTertiary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayNameSelected: { color: Colors.white },
  dayNum: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  dayNumSelected: { color: Colors.white },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.accent, marginTop: 3 },
  dayDotSelected: { backgroundColor: Colors.white },

  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginTop: Spacing.xl, marginBottom: Spacing.md },
  dayTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  dayCount: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },

  sessionList: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  sessionCard: { marginBottom: Spacing.sm },
  sessionDone: { opacity: 0.6 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sessionTime: { width: 50 },
  timeStart: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textPrimary },
  timeEnd: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  sessionName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  sessionBadges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 3 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.xs },
  badgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10 },
  sessionDuration: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  groupAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  groupAvatarText: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: Colors.white },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs },
  statusBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10 },

  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: Radius.sm },
  actionText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
