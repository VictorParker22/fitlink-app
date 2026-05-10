import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function ClientHomeScreen() {
  const router = useRouter();
  const { clientData, trainer, upcomingSessions, todayWorkout, workouts, loading, refreshData } = useClient();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  if (loading || !clientData) return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}><View style={styles.loading}><Text style={[styles.loadingText, { color: colors.textTertiary }]}>Loading...</Text></View></SafeAreaView>
  );

  const completedCount = workouts.filter((w: any) => w.status === 'completed').length;
  const streak = clientData.progress?.streak || 0;
  const firstName = clientData.name.split(' ')[0];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <Text style={[styles.greeting, { color: colors.textSecondary }]}>Welcome back</Text>
        <Text style={[styles.name, { color: colors.textPrimary }]}>{firstName} 💪</Text>
        {trainer && <Text style={[styles.trainerLine, { color: colors.textTertiary }]}>Training with Coach {trainer.name?.split(' ')[0]}</Text>}

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.blue }]}>{completedCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Completed</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.yellow }]}>🔥 {streak}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Day Streak</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.green }]}>{upcomingSessions.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Upcoming</Text>
          </Card>
        </View>

        {/* Today's Workout */}
        {todayWorkout && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Workout</Text>
            <TouchableOpacity style={[styles.todayCard, { backgroundColor: colors.bgElevated, borderColor: colors.border }]} activeOpacity={0.8} onPress={() => router.push('/(client-tabs)/workouts' as any)}>
              <Text style={[styles.todayLabel, { color: colors.accent }]}>Assigned today</Text>
              <Text style={[styles.todayName, { color: colors.textPrimary }]}>{todayWorkout.workouts?.name || 'Workout'}</Text>
              <View style={styles.todayMeta}>
                <View style={styles.todayMetaItem}><Ionicons name="barbell" size={14} color={colors.accent} /><Text style={[styles.todayMetaText, { color: colors.textSecondary }]}>{todayWorkout.workouts?.workout_exercises?.length || 0} exercises</Text></View>
                <View style={styles.todayMetaItem}><Ionicons name="time" size={14} color={colors.accent} /><Text style={[styles.todayMetaText, { color: colors.textSecondary }]}>{todayWorkout.workouts?.estimated_duration || 45}min</Text></View>
              </View>
              <View style={styles.todayBtn}><Text style={styles.todayBtnText}>Start Workout →</Text></View>
            </TouchableOpacity>
          </>
        )}

        {/* Upcoming Sessions */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Upcoming Sessions</Text>
        {upcomingSessions.length === 0 ? (
          <Card><View style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
            <Ionicons name="calendar-outline" size={32} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: Spacing.sm }]}>No upcoming sessions</Text>
            <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>Your trainer will schedule your next session</Text>
          </View></Card>
        ) : (
          upcomingSessions.slice(0, 4).map((session: any) => {
            const dt = new Date(session.date);
            return (
              <Card key={session.id} style={styles.sessionCard}>
                <View style={styles.sessionRow}>
                  <View style={[styles.sessionIcon, { backgroundColor: `${colors.accent}18` }]}>
                    <Ionicons name="time" size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sessionType, { color: colors.textPrimary }]}>{session.type} Session</Text>
                    <Text style={[styles.sessionMeta, { color: colors.textTertiary }]}>
                      {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {session.duration}min
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: FontFamily.body },
  greeting: { fontFamily: FontFamily.body, fontSize: FontSize.base },
  name: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], letterSpacing: -0.5 },
  trainerLine: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: Spacing.xs },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xl },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl },
  statLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, marginTop: Spacing['2xl'], marginBottom: Spacing.md },

  todayCard: { borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1 },
  todayLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  todayName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, marginTop: Spacing.xs },
  todayMeta: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md },
  todayMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  todayMetaText: { fontFamily: FontFamily.body, fontSize: FontSize.sm },
  todayBtn: { backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center', marginTop: Spacing.lg },
  todayBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.white },

  sessionCard: { marginBottom: Spacing.sm },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sessionIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  sessionType: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md },
  sessionMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },

  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.base },
  emptySubtext: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: 4 },
});
