import { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

const CATEGORY_ICONS: Record<string, { icon: string; colors: [string, string] }> = {
  strength: { icon: 'barbell-outline', colors: [Colors.accent, '#FF8F6B'] },
  cardio: { icon: 'heart-outline', colors: [Colors.blue, '#66B8FF'] },
  flexibility: { icon: 'body-outline', colors: [Colors.green, '#66D9A3'] },
  hiit: { icon: 'flash-outline', colors: [Colors.yellow, '#FFD966'] },
  default: { icon: 'fitness-outline', colors: [Colors.purple, '#B388FF'] },
};

function getWorkoutCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('strength') || lower.includes('push') || lower.includes('pull') || lower.includes('leg') || lower.includes('upper') || lower.includes('lower')) return 'strength';
  if (lower.includes('cardio') || lower.includes('run') || lower.includes('cycle')) return 'cardio';
  if (lower.includes('flex') || lower.includes('stretch') || lower.includes('yoga')) return 'flexibility';
  if (lower.includes('hiit') || lower.includes('circuit') || lower.includes('tabata')) return 'hiit';
  return 'default';
}

export default function ProgramsScreen() {
  const router = useRouter();
  const { workouts, refreshData } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const totalExercises = useMemo(() =>
    workouts.reduce((sum, w) => sum + (w.workout_exercises?.length || 0), 0),
    [workouts]
  );

  const renderWorkout = ({ item, index }: { item: typeof workouts[0]; index: number }) => {
    const exerciseCount = item.workout_exercises?.length || 0;
    const cat = getWorkoutCategory(item.name);
    const meta = CATEGORY_ICONS[cat];
    const muscleGroups = [...new Set(
      item.workout_exercises?.map((we) => we.exercises?.muscle_group).filter(Boolean) || []
    )];

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/workout/${item.id}` as any)}
      >
        <Card style={styles.workoutCard}>
          {/* Accent bar */}
          <LinearGradient
            colors={meta.colors}
            style={styles.accentBar}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          <View style={styles.cardContent}>
            {/* Top row: icon + info + arrow */}
            <View style={styles.cardTop}>
              <LinearGradient
                colors={meta.colors}
                style={styles.iconCircle}
              >
                <Ionicons name={meta.icon as any} size={22} color={Colors.white} />
              </LinearGradient>

              <View style={{ flex: 1 }}>
                <Text style={styles.workoutName} numberOfLines={1}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.workoutDesc} numberOfLines={1}>{item.description}</Text>
                ) : null}
              </View>

              <View style={styles.arrowBtn}>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </View>
            </View>

            {/* Bottom row: badges */}
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Ionicons name="barbell-outline" size={12} color={Colors.accent} />
                <Text style={styles.badgeText}>{exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}</Text>
              </View>
              {muscleGroups.slice(0, 2).map((mg) => (
                <View key={mg} style={[styles.badge, { backgroundColor: `${meta.colors[0]}12` }]}>
                  <Text style={[styles.badgeText, { color: meta.colors[0] }]}>{mg}</Text>
                </View>
              ))}
              <View style={styles.badge}>
                <Ionicons name="time-outline" size={12} color={Colors.textTertiary} />
                <Text style={styles.badgeText}>~{Math.max(15, exerciseCount * 5)}min</Text>
              </View>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Programs</Text>
          <Text style={styles.subtitle}>{workouts.length} workout{workouts.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/create-workout' as any)}
        >
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { label: 'Programs', value: workouts.length, color: Colors.accent, bg: Colors.accentSoft },
          { label: 'Exercises', value: totalExercises, color: Colors.blue, bg: '#E8F4FD' },
          { label: 'Categories', value: new Set(workouts.map((w) => getWorkoutCategory(w.name))).size, color: Colors.purple, bg: '#F3E8FF' },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCard, { backgroundColor: stat.bg }]}>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Workout List */}
      <FlatList
        data={workouts}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkout}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="barbell-outline" size={32} color={Colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>No programs yet</Text>
            <Text style={styles.emptyText}>Create your first workout program to assign to clients</Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              onPress={() => router.push('/create-workout' as any)}
            >
              <Ionicons name="add" size={16} color={Colors.white} />
              <Text style={styles.emptyCTAText}>Create Program</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },

  statsRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl },
  statLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  workoutCard: {
    overflow: 'hidden',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  accentBar: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: 4,
    borderTopLeftRadius: Radius.md, borderBottomLeftRadius: Radius.md,
  },
  cardContent: { paddingVertical: Spacing.base, paddingHorizontal: Spacing.lg, paddingLeft: 20 },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconCircle: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  workoutName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  workoutDesc: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  arrowBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.md },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bgElevated, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeText: { fontFamily: FontFamily.bodyMedium, fontSize: 10, color: Colors.textTertiary },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center', paddingHorizontal: Spacing['2xl'] },
  emptyCTA: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, marginTop: Spacing.md,
  },
  emptyCTAText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.white },
});
