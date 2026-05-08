import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useClient } from '../../context/ClientContext';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function ClientWorkoutsScreen() {
  const { workouts, markWorkoutComplete, markWorkoutSkipped } = useClient();

  const handleComplete = (id: string, name: string) => {
    Alert.alert('Complete Workout', `Mark "${name}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => markWorkoutComplete(id) },
    ]);
  };

  const statusColors: Record<string, { bg: string; text: string; icon: string }> = {
    assigned: { bg: Colors.accentSoft, text: Colors.accent, icon: 'barbell' },
    completed: { bg: Colors.greenSoft, text: Colors.green, icon: 'checkmark-circle' },
    skipped: { bg: Colors.bgElevated, text: Colors.textTertiary, icon: 'close-circle' },
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Workouts</Text>
      <FlatList
        data={workouts}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptyText}>Your trainer will assign workouts to you</Text>
          </View>
        }
        renderItem={({ item: workout }) => {
          const s = statusColors[workout.status] || statusColors.assigned;
          const exercises = workout.workouts?.workout_exercises || [];
          const dt = new Date(workout.assigned_date);

          return (
            <Card style={styles.workoutCard}>
              <View style={styles.workoutHeader}>
                <View style={[styles.statusIcon, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon as any} size={18} color={s.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutName}>{workout.workouts?.name || 'Workout'}</Text>
                  <Text style={styles.workoutDate}>{dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.statusText, { color: s.text }]}>{workout.status}</Text>
                </View>
              </View>

              {exercises.length > 0 && (
                <View style={styles.exerciseList}>
                  {exercises.slice(0, 4).map((ex: any, i: number) => (
                    <View key={i} style={styles.exerciseRow}>
                      <Text style={styles.exerciseName}>{ex.exercises?.name || 'Exercise'}</Text>
                      <Text style={styles.exerciseSets}>{ex.sets}×{ex.reps}</Text>
                    </View>
                  ))}
                  {exercises.length > 4 && <Text style={styles.moreExercises}>+{exercises.length - 4} more</Text>}
                </View>
              )}

              {workout.status === 'assigned' && (
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.greenSoft }]} onPress={() => handleComplete(workout.id, workout.workouts?.name)}>
                    <Ionicons name="checkmark" size={16} color={Colors.green} />
                    <Text style={[styles.actionText, { color: Colors.green }]}>Complete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.bgElevated }]} onPress={() => markWorkoutSkipped(workout.id)}>
                    <Text style={[styles.actionText, { color: Colors.textTertiary }]}>Skip</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, letterSpacing: -0.5, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, marginBottom: Spacing.md },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  workoutCard: { marginBottom: Spacing.md },
  workoutHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  statusIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  workoutName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  workoutDate: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, textTransform: 'capitalize' },

  exerciseList: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  exerciseName: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary },
  exerciseSets: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textPrimary },
  moreExercises: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 4 },

  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: Radius.sm },
  actionText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
