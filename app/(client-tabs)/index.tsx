import { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import WeeklyRing from '../../components/WeeklyRing';
import CountdownTimer from '../../components/CountdownTimer';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const QUOTES = [
  { text: "The only bad workout is the one that didn't happen.", author: "Unknown" },
  { text: "Your body can stand almost anything. It's your mind you have to convince.", author: "Unknown" },
  { text: "Success is what comes after you stop making excuses.", author: "Luis Galarza" },
  { text: "The pain you feel today will be the strength you feel tomorrow.", author: "Arnold Schwarzenegger" },
  { text: "Don't limit your challenges. Challenge your limits.", author: "Jerry Dunn" },
  { text: "It never gets easier. You just get stronger.", author: "Unknown" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "The difference between try and triumph is a little umph.", author: "Marvin Phillips" },
  { text: "Strength does not come from the body. It comes from the will.", author: "Gandhi" },
  { text: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '💪' };
  return { text: 'Good evening', emoji: '🌙' };
}

function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

function getWeekDates() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function ClientHomeScreen() {
  const router = useRouter();
  const { clientData, trainer, upcomingSessions, todayWorkout, workouts, sessions, loading, refreshData } = useClient();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  if (loading || !clientData) return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}><View style={styles.loading}><Text style={[styles.loadingText, { color: colors.textTertiary }]}>Loading...</Text></View></SafeAreaView>
  );

  const firstName = clientData.name.split(' ')[0];
  const greeting = getGreeting();
  const quote = QUOTES[getDayOfYear() % QUOTES.length];

  // Weekly stats
  const weekDates = getWeekDates();
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const thisWeekWorkouts = workouts.filter((w: any) => {
    const d = new Date(w.assigned_date);
    return d >= weekStart && d <= new Date(weekEnd.getTime() + 86400000);
  });
  const completedThisWeek = thisWeekWorkouts.filter((w: any) => w.status === 'completed').length;
  const totalThisWeek = Math.max(thisWeekWorkouts.length, 5);

  // Streak
  const streak = clientData.progress?.streak || 0;

  // XP
  const totalCompleted = workouts.filter((w: any) => w.status === 'completed').length;
  const xp = totalCompleted * 50;
  const level = Math.floor(xp / 250) + 1;

  // Week day completion map
  const completedDays = new Set<number>();
  thisWeekWorkouts.forEach((w: any) => {
    if (w.status === 'completed') {
      const d = new Date(w.assigned_date).getDay();
      completedDays.add(d === 0 ? 6 : d - 1);
    }
  });
  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();

  // Heatmap (last 4 weeks)
  const heatmapData = useMemo(() => {
    const grid: number[][] = [];
    for (let w = 3; w >= 0; w--) {
      const row: number[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date();
        const dayOfWeek = date.getDay();
        const mondayOffset = (dayOfWeek + 6) % 7;
        date.setDate(date.getDate() - mondayOffset - w * 7 + d);
        date.setHours(0, 0, 0, 0);
        const hasWorkout = workouts.some((wo: any) => {
          const wd = new Date(wo.assigned_date);
          wd.setHours(0, 0, 0, 0);
          return wd.getTime() === date.getTime() && wo.status === 'completed';
        });
        row.push(hasWorkout ? 1 : 0);
      }
      grid.push(row);
    }
    return grid;
  }, [workouts]);

  // Next session
  const nextSession = upcomingSessions.length > 0 ? upcomingSessions[0] : null;

  // Mission card exercises
  const exercises = todayWorkout?.workouts?.workout_exercises || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>

        {/* ── HERO ── */}
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting.text} {greeting.emoji}</Text>
            <Text style={styles.heroName}>{firstName}</Text>
          </View>
          <Avatar name={clientData.name} size="lg" imageUrl={clientData.avatar_url} />
        </View>

        {/* ── COACH CARD ── */}
        {trainer && (
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(client-tabs)/my-messages' as any)}>
            <LinearGradient colors={isDark ? ['#1E1E28', '#252535'] : ['#FFF5F0', '#FFFFFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.coachCard}>
              <View style={styles.coachLeft}>
                <Avatar name={trainer.name || 'Coach'} size="md" imageUrl={trainer.avatar_url} />
                <View style={[styles.onlineDot, { borderColor: isDark ? '#1E1E28' : '#FFF5F0' }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.coachLabel}>Your Coach</Text>
                <Text style={styles.coachName}>{trainer.name || 'Coach'}</Text>
              </View>
              <View style={styles.coachCTA}>
                <Ionicons name="chatbubble" size={16} color={Colors.white} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* ── TRIAL BANNER ── */}
        {clientData.status === 'trial' && (() => {
          const trialEnd = clientData.trial_end_date ? new Date(clientData.trial_end_date) : new Date(new Date(clientData.created_at).getTime() + 20 * 86400000);
          const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000));
          const totalDays = Math.ceil((trialEnd.getTime() - new Date(clientData.created_at).getTime()) / 86400000);
          const pct = Math.min(1, (totalDays - daysLeft) / totalDays);
          const expired = daysLeft === 0;
          return (
            <View style={[styles.trialBanner, { backgroundColor: expired ? '#EF444418' : Colors.yellowSoft }]}>
              <View style={styles.trialTop}>
                <Ionicons name={expired ? 'alert-circle' : 'time'} size={22} color={expired ? '#EF4444' : Colors.yellow} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trialTitle, { color: colors.textPrimary }]}>{expired ? 'Trial Expired' : `${daysLeft} Day${daysLeft !== 1 ? 's' : ''} Left`}</Text>
                  <Text style={[styles.trialSub, { color: colors.textTertiary }]}>{expired ? 'Upgrade to continue.' : `Ends ${trialEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</Text>
                </View>
              </View>
              <View style={[styles.trialTrack, { backgroundColor: colors.bgElevated }]}>
                <View style={[styles.trialFill, { width: `${pct * 100}%`, backgroundColor: expired ? '#EF4444' : daysLeft <= 5 ? Colors.yellow : Colors.green }]} />
              </View>
            </View>
          );
        })()}

        {/* ── ASSESSMENT PROMPT ── */}
        {!clientData.assessment_data && (
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/client/assessment' as any)}>
            <LinearGradient colors={[colors.accent, '#FF9F6B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.assessmentCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.assessmentTitle}>Complete your profile</Text>
                <Text style={styles.assessmentDesc}>Help your coach build the perfect plan.</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* ── WEEKLY RING + STREAK ── */}
        <View style={styles.ringSection}>
          <WeeklyRing completed={completedThisWeek} total={totalThisWeek} accentColor={colors.accent} bgColor={colors.bgElevated} textColor={colors.textPrimary} subtextColor={colors.textTertiary} />
          <View style={styles.streakRow}>
            {DAY_LABELS.map((label, i) => {
              const done = completedDays.has(i);
              const isToday = i === todayIdx;
              return (
                <View key={i} style={styles.dayCol}>
                  <View style={[styles.dayDot, done && styles.dayDotDone, isToday && !done && { borderWidth: 2, borderColor: colors.accent }]}>
                    {done ? <Text style={{ fontSize: 12 }}>🔥</Text> : <Text style={[styles.dayDotText, { color: colors.textTertiary }]}>{label}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.xpRow}>
            <View style={[styles.xpBadge, { backgroundColor: `${colors.accent}15` }]}>
              <Ionicons name="flash" size={12} color={colors.accent} />
              <Text style={[styles.xpText, { color: colors.accent }]}>Level {level}</Text>
            </View>
            <Text style={[styles.xpDetail, { color: colors.textTertiary }]}>{xp} XP • {streak > 0 ? `${streak} day streak 🔥` : 'Start your streak!'}</Text>
          </View>
        </View>

        {/* ── MISSION CARD ── */}
        {todayWorkout && (
          <>
            <Text style={styles.sectionTitle}>Today's Mission</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(client-tabs)/workouts' as any); }}>
              <LinearGradient colors={isDark ? ['#1A1A24', '#22222E'] : ['#1C1C21', '#2A2A32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.missionCard}>
                <View style={[styles.missionAccent, { backgroundColor: colors.accent }]} />
                <Text style={styles.missionLabel}>MISSION BRIEFING</Text>
                <Text style={styles.missionName}>{todayWorkout.workouts?.name || 'Workout'}</Text>
                <View style={styles.missionMeta}>
                  <View style={styles.missionMetaItem}><Ionicons name="barbell" size={14} color={colors.accent} /><Text style={styles.missionMetaText}>{exercises.length} exercises</Text></View>
                  <View style={styles.missionMetaItem}><Ionicons name="time" size={14} color={colors.accent} /><Text style={styles.missionMetaText}>{todayWorkout.workouts?.estimated_duration || 45}min</Text></View>
                </View>
                <View style={styles.missionExercises}>
                  {exercises.slice(0, 2).map((ex: any, i: number) => (
                    <View key={i} style={styles.missionExRow}>
                      <Text style={styles.missionExName}>{ex.exercises?.name || 'Exercise'}</Text>
                      <Text style={styles.missionExSets}>{ex.sets}×{ex.reps}</Text>
                    </View>
                  ))}
                  {exercises.length > 2 && (
                    <View style={styles.missionExRow}>
                      <View style={styles.missionLockRow}><Ionicons name="lock-closed" size={11} color="rgba(255,255,255,0.35)" /><Text style={styles.missionLockText}>{exercises.length - 2} more exercises</Text></View>
                      <Text style={styles.missionExSets}>???</Text>
                    </View>
                  )}
                </View>
                <View style={styles.missionBtn}><Text style={styles.missionBtnText}>Accept Mission →</Text></View>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {/* ── COUNTDOWN ── */}
        {nextSession && (
          <>
            <Text style={styles.sectionTitle}>Next Session</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={() => {}}>
              <Card style={styles.countdownCard}>
                <View style={styles.countdownTop}>
                  <View style={[styles.countdownIcon, { backgroundColor: `${colors.accent}18` }]}>
                    <Ionicons name="time" size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.countdownType, { color: colors.textPrimary }]}>{nextSession.type} Session</Text>
                    <Text style={[styles.countdownDate, { color: colors.textTertiary }]}>
                      {new Date(nextSession.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {new Date(nextSession.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
                <View style={{ marginTop: Spacing.lg }}>
                  <CountdownTimer targetDate={new Date(nextSession.date)} accentColor={colors.accent} bgColor={colors.bgElevated} textColor={colors.textPrimary} subtextColor={colors.textTertiary} />
                </View>
              </Card>
            </TouchableOpacity>
          </>
        )}

        {/* ── HEATMAP ── */}
        <Text style={styles.sectionTitle}>Activity</Text>
        <Card>
          <View style={styles.heatmapHeader}>
            <Text style={[styles.heatmapTitle, { color: colors.textSecondary }]}>Last 4 Weeks</Text>
            <Text style={[styles.heatmapCount, { color: colors.accent }]}>{workouts.filter((w: any) => w.status === 'completed').length} total</Text>
          </View>
          <View style={styles.heatmapGrid}>
            {heatmapData.map((week, wi) => (
              <View key={wi} style={styles.heatmapRow}>
                {week.map((val, di) => (
                  <View key={di} style={[styles.heatmapCell, { backgroundColor: val ? colors.accent : colors.bgElevated }]} />
                ))}
              </View>
            ))}
          </View>
          <View style={styles.heatmapLabels}>
            {DAY_LABELS.map((l, i) => <Text key={i} style={[styles.heatmapLabel, { color: colors.textTertiary }]}>{l}</Text>)}
          </View>
        </Card>

        {/* ── UPCOMING SESSIONS ── */}
        {upcomingSessions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcomingSessions.slice(0, 3).map((session: any) => {
              const dt = new Date(session.date);
              return (
                <Card key={session.id} style={styles.sessionCard}>
                  <View style={styles.sessionRow}>
                    <View style={[styles.sessionIcon, { backgroundColor: `${colors.accent}18` }]}>
                      <Ionicons name="calendar" size={18} color={colors.accent} />
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
            })}
          </>
        )}

        {/* ── QUOTE ── */}
        <LinearGradient colors={isDark ? ['#1E1E28', '#252535'] : ['#FFF8F5', '#FFF0E8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.quoteCard}>
          <Text style={styles.quoteLabel}>💡 Daily Motivation</Text>
          <Text style={styles.quoteText}>"{quote.text}"</Text>
          <Text style={styles.quoteAuthor}>— {quote.author}</Text>
        </LinearGradient>

      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { padding: Spacing.lg, paddingBottom: 120 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: FontFamily.body },

  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  greeting: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textSecondary },
  heroName: { fontFamily: FontFamily.headingExtraBold, fontSize: 30, color: colors.textPrimary, letterSpacing: -0.5 },

  coachCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base, borderRadius: Radius.xl, marginBottom: Spacing.lg, borderWidth: 1, borderColor: colors.border },
  coachLeft: { position: 'relative' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2 },
  coachLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  coachName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  coachCTA: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },

  trialBanner: { padding: Spacing.lg, borderRadius: Radius.xl, gap: Spacing.md, marginBottom: Spacing.lg },
  trialTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  trialTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base },
  trialSub: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },
  trialTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  trialFill: { height: '100%', borderRadius: 3 },

  assessmentCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, borderRadius: Radius.xl, marginBottom: Spacing.lg },
  assessmentTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, color: '#FFF' },
  assessmentDesc: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  ringSection: { alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.lg },
  streakRow: { flexDirection: 'row', gap: Spacing.md },
  dayCol: { alignItems: 'center' },
  dayDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  dayDotDone: { backgroundColor: 'transparent' },
  dayDotText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10 },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  xpText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },
  xpDetail: { fontFamily: FontFamily.body, fontSize: FontSize.xs },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary, marginTop: Spacing.xl, marginBottom: Spacing.md },

  missionCard: { borderRadius: Radius.xl, padding: Spacing.lg, overflow: 'hidden' },
  missionAccent: { position: 'absolute', top: 0, left: 0, width: 4, height: '100%', borderTopLeftRadius: Radius.xl, borderBottomLeftRadius: Radius.xl },
  missionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2 },
  missionName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: '#FFF', marginTop: Spacing.xs },
  missionMeta: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md },
  missionMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  missionMetaText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.6)' },
  missionExercises: { marginTop: Spacing.lg, gap: Spacing.sm },
  missionExRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  missionExName: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)' },
  missionExSets: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.5)' },
  missionLockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  missionLockText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' },
  missionBtn: { backgroundColor: colors.accent, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.lg },
  missionBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#FFF' },

  countdownCard: { marginBottom: Spacing.sm },
  countdownTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  countdownIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  countdownType: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md },
  countdownDate: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },

  heatmapHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  heatmapTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  heatmapCount: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  heatmapGrid: { gap: 4 },
  heatmapRow: { flexDirection: 'row', gap: 4, justifyContent: 'space-around' },
  heatmapCell: { flex: 1, aspectRatio: 1, borderRadius: 4, maxWidth: 36, maxHeight: 36 },
  heatmapLabels: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.xs },
  heatmapLabel: { fontFamily: FontFamily.body, fontSize: 9, flex: 1, textAlign: 'center' },

  sessionCard: { marginBottom: Spacing.sm },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sessionIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  sessionType: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md },
  sessionMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },

  quoteCard: { padding: Spacing.lg, borderRadius: Radius.xl, marginTop: Spacing.xl, borderWidth: 1, borderColor: colors.border },
  quoteLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, marginBottom: Spacing.sm },
  quoteText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary, lineHeight: 22, fontStyle: 'italic' },
  quoteAuthor: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: Spacing.sm },
});
