import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, clients, deleteWorkout, assignWorkout, activeClients } = useApp();
  const [showAssign, setShowAssign] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id]);

  if (!workout) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Workout</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Workout not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const exercises = workout.workout_exercises || [];
  const totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);
  const estTime = Math.max(15, exercises.length * 5);

  const handleDelete = () => {
    Alert.alert('Delete Workout', `Are you sure you want to delete "${workout.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await deleteWorkout(workout.id);
            router.back();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete');
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleAssign = async (clientId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      await assignWorkout(workout.id, clientId, today);
      setShowAssign(false);
      Alert.alert('Success', 'Workout assigned!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to assign workout');
    }
  };

  // Assign picker overlay
  if (showAssign) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowAssign(false)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Assign to Client</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.assignList}>
          {activeClients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No active clients</Text>
              <Text style={styles.emptyText}>Add clients first to assign workouts</Text>
            </View>
          ) : (
            activeClients.map((client) => (
              <TouchableOpacity
                key={client.id}
                style={styles.assignItem}
                onPress={() => handleAssign(client.id)}
              >
                <Avatar name={client.name} size="sm" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.assignName}>{client.name}</Text>
                  <Text style={styles.assignMeta}>{client.email || client.phone || 'No contact'}</Text>
                </View>
                <View style={styles.assignBtn}>
                  <Ionicons name="arrow-forward" size={16} color={Colors.white} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{workout.name}</Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} disabled={deleting}>
          <Ionicons name="trash-outline" size={18} color={Colors.red} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: Colors.accentSoft }]}>
            <Ionicons name="barbell-outline" size={18} color={Colors.accent} />
            <Text style={[styles.statValue, { color: Colors.accent }]}>{exercises.length}</Text>
            <Text style={styles.statLabel}>Exercises</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E8F4FD' }]}>
            <Ionicons name="layers-outline" size={18} color={Colors.blue} />
            <Text style={[styles.statValue, { color: Colors.blue }]}>{totalSets}</Text>
            <Text style={styles.statLabel}>Total Sets</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F3E8FF' }]}>
            <Ionicons name="time-outline" size={18} color={Colors.purple} />
            <Text style={[styles.statValue, { color: Colors.purple }]}>~{estTime}</Text>
            <Text style={styles.statLabel}>Minutes</Text>
          </View>
        </View>

        {/* Description */}
        {workout.description ? (
          <Card style={styles.descCard}>
            <Text style={styles.descText}>{workout.description}</Text>
          </Card>
        ) : null}

        {/* Exercise List */}
        <Text style={styles.sectionTitle}>Exercises</Text>
        {exercises
          .sort((a, b) => a.order_index - b.order_index)
          .map((we, index) => (
          <Card key={we.id} style={styles.exerciseCard}>
            <View style={styles.exerciseRow}>
              <View style={styles.orderBadge}>
                <Text style={styles.orderText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseName}>{we.exercises?.name || 'Exercise'}</Text>
                <Text style={styles.exerciseMuscle}>{we.exercises?.muscle_group}</Text>
              </View>
            </View>
            <View style={styles.paramRow}>
              <View style={styles.paramItem}>
                <Text style={styles.paramValue}>{we.sets}</Text>
                <Text style={styles.paramLabel}>Sets</Text>
              </View>
              <View style={styles.paramDivider} />
              <View style={styles.paramItem}>
                <Text style={styles.paramValue}>{we.reps}</Text>
                <Text style={styles.paramLabel}>Reps</Text>
              </View>
              <View style={styles.paramDivider} />
              <View style={styles.paramItem}>
                <Text style={styles.paramValue}>{we.rest_seconds}s</Text>
                <Text style={styles.paramLabel}>Rest</Text>
              </View>
            </View>
          </Card>
        ))}

        {/* Assign Button */}
        <TouchableOpacity
          style={styles.assignCTA}
          onPress={() => setShowAssign(true)}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[Colors.accent, Colors.accentHover]}
            style={styles.assignCTAGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="person-add-outline" size={20} color={Colors.white} />
            <Text style={styles.assignCTAText}>Assign to Client</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg,
    color: Colors.textPrimary, textAlign: 'center', marginHorizontal: Spacing.sm,
  },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.redSoft, alignItems: 'center', justifyContent: 'center',
  },

  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md,
    borderRadius: Radius.lg, gap: 4,
  },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl },
  statLabel: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.textTertiary },

  descCard: { marginBottom: Spacing.lg },
  descText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  sectionTitle: {
    fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md,
    color: Colors.textPrimary, marginBottom: Spacing.md,
  },

  exerciseCard: { marginBottom: Spacing.sm },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  orderBadge: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  orderText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.white },
  exerciseName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  exerciseMuscle: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },

  paramRow: {
    flexDirection: 'row', marginTop: Spacing.md,
    paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  paramItem: { flex: 1, alignItems: 'center' },
  paramDivider: { width: 1, height: '100%', backgroundColor: Colors.border },
  paramValue: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  paramLabel: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.textTertiary, marginTop: 2 },

  assignCTA: { marginTop: Spacing.xl, borderRadius: Radius.lg, overflow: 'hidden' },
  assignCTAGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  assignCTAText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.white },

  // Assign picker
  assignList: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  assignItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  assignName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  assignMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },
  assignBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
