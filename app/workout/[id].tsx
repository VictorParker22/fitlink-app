import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Dimensions, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import Avatar from '../../components/Avatar';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

// Helper to get fallback images similar to programs tab
const getCategoryImage = (category: string) => {
  const lower = category?.toLowerCase() || '';
  if (lower.includes('cardio') || lower.includes('aerobics')) return require('../../assets/images/welcome-2.png');
  if (lower.includes('yoga') || lower.includes('flex')) return require('../../assets/images/welcome-3.png');
  return require('../../assets/images/welcome-1.png');
};

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, deleteWorkout, assignWorkout, activeClients, clientWorkouts } = useApp();
  const { colors } = useTheme();
  const [showAssign, setShowAssign] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id]);

  if (!workout) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bgPrimary }]}>
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => router.back()} style={styles.glassBtn} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Workout not found</Text>
        </View>
      </View>
    );
  }

  const exercises = workout.workout_exercises || [];
  const totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);
  const estTime = Math.max(15, exercises.length * 5);
  const kcal = Math.max(150, exercises.length * 45);

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
    const filteredClients = activeClients.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
        <View style={styles.assignHeader}>
          <TouchableOpacity onPress={() => { setShowAssign(false); setSearchQuery(''); }} style={[styles.backBtnDark, { backgroundColor: colors.bgElevated }]} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.assignHeaderTitle, { color: colors.textPrimary }]}>Assign to Client</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md }}>
          <View style={[styles.searchBox, { backgroundColor: colors.bgElevated }]}>
            <Ionicons name="search" size={20} color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search clients..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.assignList} showsVerticalScrollIndicator={false}>
          {filteredClients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No clients found</Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Try a different search term</Text>
            </View>
          ) : (
            filteredClients.map((client) => {
              const alreadyAssigned = clientWorkouts.some(cw => cw.client_id === client.id && cw.workout_id === workout.id && cw.status === 'assigned');
              
              return (
                <TouchableOpacity
                  key={client.id}
                  style={[styles.assignItem, { borderBottomColor: colors.border, opacity: alreadyAssigned ? 0.6 : 1 }]}
                  onPress={() => !alreadyAssigned && handleAssign(client.id)}
                  disabled={alreadyAssigned}
                  activeOpacity={0.7}
                >
                  <Avatar name={client.name} size="sm" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assignName, { color: colors.textPrimary }]}>{client.name}</Text>
                    <Text style={[styles.assignMeta, { color: colors.textTertiary }]}>{client.email || client.phone || 'No contact'}</Text>
                  </View>
                  {alreadyAssigned ? (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.greenSoft, borderRadius: Radius.full }}>
                      <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.green }}>Assigned</Text>
                    </View>
                  ) : (
                    <View style={styles.assignBtn}>
                      <Ionicons name="add" size={16} color={Colors.white} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  // Derive an image based on the name or just use a fallback
  const heroImage = getCategoryImage(workout.name);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.heroContainer}>
          <Image source={heroImage} style={styles.heroImage} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']}
            style={styles.heroGradient}
          >
            <View style={[styles.topNav, { marginTop: insets.top || Spacing.lg }]}>
              <TouchableOpacity onPress={() => router.back()} style={styles.glassBtn} accessibilityLabel="Go back" accessibilityRole="button">
                <Ionicons name="chevron-back" size={24} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={[styles.glassBtn, { backgroundColor: 'rgba(255,59,48,0.35)' }]} disabled={deleting}>
                <Ionicons name="trash-outline" size={22} color={Colors.white} />
              </TouchableOpacity>
            </View>
            <View style={styles.heroTitleBlock}>
              <View style={styles.totalPill}>
                <Text style={styles.totalPillText}>{exercises.length} Total</Text>
              </View>
              <Text style={styles.heroTitle}>{workout.name}</Text>
              <Text style={styles.heroSubtitle}>With {workout.description || 'FitLink Coach'}</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={[styles.contentSheet, { backgroundColor: colors.bgPrimary }]}>
          <Text style={[styles.descText, { color: colors.textSecondary }]}>
            {workout.description || 'A custom workout routine designed by your coach.'}
          </Text>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Ionicons name="time" size={16} color={colors.textTertiary} />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>~{estTime}min</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Est. Time</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Ionicons name="flame" size={16} color={colors.textTertiary} />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>~{kcal}kcal</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Est. Calories</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Ionicons name="barbell" size={16} color={colors.textTertiary} />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{exercises.length}x{Math.round(totalSets/Math.max(1, exercises.length))}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Sets</Text>
            </View>
          </View>

          <View style={styles.exerciseList}>
            {exercises
              .sort((a, b) => a.order_index - b.order_index)
              .map((we, index) => {
                const exImage = getCategoryImage(we.exercises?.category || '');
                return (
                  <View key={we.id} style={[styles.exerciseCard, { backgroundColor: colors.bgElevated }]}>
                    <View style={styles.exerciseImgWrap}>
                      <Image source={exImage} style={styles.exerciseImg} resizeMode="cover" />
                      <View style={styles.playOverlay}>
                        <Ionicons name="play" size={18} color={Colors.white} style={{ marginLeft: 2 }} />
                      </View>
                    </View>
                    <View style={styles.exerciseInfo}>
                      <View style={[styles.exIndexPill, { backgroundColor: colors.border }]}>
                        <Text style={[styles.exIndexText, { color: colors.textSecondary }]}>Exercise {index + 1}</Text>
                      </View>
                      <Text style={[styles.exName, { color: colors.textPrimary }]}>{we.exercises?.name || 'Exercise'}</Text>
                      <View style={styles.exTimeRow}>
                        <Ionicons name="barbell-outline" size={12} color={colors.textTertiary} />
                        <Text style={[styles.exTimeText, { color: colors.textTertiary }]}>{we.sets} × {we.reps} reps</Text>
                      </View>
                    </View>
                  </View>
                );
            })}
          </View>
          <View style={{ height: 100 }} />
        </View>

      </ScrollView>
      <View style={[styles.bottomCTAWrapper, { paddingBottom: insets.bottom || Spacing.xl }]}>
        <TouchableOpacity
          style={styles.bottomBtn}
          onPress={() => setShowAssign(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomBtnText}>Assign to Client</Text>
          <Ionicons name="stopwatch" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  heroContainer: { width: '100%', height: height * 0.45 },
  heroImage: { width: '100%', height: '100%', position: 'absolute' },
  heroGradient: { flex: 1, justifyContent: 'space-between' },

  topNav: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  glassBtn: {
    width: 44, height: 44, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(10px)',
  },

  heroTitleBlock: { alignItems: 'center', paddingBottom: 60 },
  totalPill: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: Spacing.sm,
  },
  totalPillText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.white },
  heroTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 32, color: Colors.white, marginBottom: 4 },
  heroSubtitle: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)' },

  contentSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    marginTop: -40, paddingHorizontal: Spacing.lg, paddingTop: Spacing['2xl'],
    minHeight: height * 0.6,
  },

  descText: {
    fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 22, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },

  statsContainer: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md, marginBottom: Spacing['2xl'],
  },
  statItem: { flex: 1, alignItems: 'center', gap: 6 },
  statDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  statLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: Colors.textTertiary, textTransform: 'uppercase' },

  exerciseList: { gap: Spacing.md },
  exerciseCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgElevated, borderRadius: 24, padding: Spacing.sm,
  },
  exerciseImgWrap: {
    width: 72, height: 72, borderRadius: 20, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  exerciseImg: { width: '100%', height: '100%', position: 'absolute' },
  playOverlay: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  exerciseInfo: { flex: 1, justifyContent: 'center', paddingRight: Spacing.sm },
  exIndexPill: {
    alignSelf: 'flex-start', backgroundColor: Colors.border,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 6,
  },
  exIndexText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.textSecondary },
  exName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: Colors.textPrimary, marginBottom: 4 },
  exTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exTimeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: Colors.textTertiary },

  bottomCTAWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'transparent', paddingHorizontal: Spacing.lg,
  },
  bottomBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accent, paddingVertical: 18, borderRadius: Radius.full,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  bottomBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.white },

  // Assign UI 
  assignHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtnDark: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  assignHeaderTitle: { flex: 1, fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary, textAlign: 'center' },
  assignList: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  assignItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  assignName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base },
  assignMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 1 },
  assignBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 12, borderRadius: Radius.full },
  searchInput: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.sm, padding: 0 },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm },
});
