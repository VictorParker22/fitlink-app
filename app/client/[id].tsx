import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

type AssignMode = 'workout' | 'diet' | null;

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const {
    getClientById, getClientSessions, getClientWorkouts, getClientDiets, getClientProgress,
    workouts, diets, assignWorkout, assignDietPlan, plans,
  } = useApp();

  const [assignMode, setAssignMode] = useState<AssignMode>(null);

  const client = getClientById(id || '');
  const sessions = getClientSessions(id || '');
  const assignedWorkouts = getClientWorkouts(id || '');
  const assignedDiets = getClientDiets(id || '');
  const progressLogs = getClientProgress(id || '');

  if (!client) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Client not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  const upcomingSessions = sessions.filter((s) => s.status === 'upcoming' && new Date(s.date) > new Date());
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const planName = plans.find(p => p.id === client.plan_id)?.name;

  const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: Colors.greenSoft, text: Colors.green },
    trial: { bg: Colors.yellowSoft, text: Colors.yellow },
    inactive: { bg: colors.bgElevated, text: colors.textTertiary },
  };
  const statusStyle = statusColors[client.status] || statusColors.inactive;

  const handleAssign = async (itemId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      if (assignMode === 'workout') {
        await assignWorkout(itemId, client.id, today);
        Alert.alert('Success', 'Workout assigned!');
      } else {
        await assignDietPlan(itemId, client.id, today);
        Alert.alert('Success', 'Diet plan assigned!');
      }
      setAssignMode(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to assign');
    }
  };

  const quickActions = [
    { icon: 'chatbubble', label: 'Message', color: Colors.blue, onPress: () => router.push(`/chat/${client.id}` as any) },
    { icon: 'calendar', label: 'Book', color: Colors.green, onPress: () => router.push(`/book-session?clientId=${client.id}` as any) },
    { icon: 'barbell', label: 'Workout', color: Colors.accent, onPress: () => setAssignMode('workout') },
    { icon: 'trending-up', label: 'Progress', color: Colors.purple, onPress: () => router.push(`/client/${client.id}/progress` as any) },
  ];

  const contactActions = [
    ...(client.phone ? [{ icon: 'call', label: 'Call', color: Colors.green, onPress: () => Linking.openURL(`tel:${client.phone}`) }] : []),
    ...(client.email ? [{ icon: 'mail', label: 'Email', color: Colors.blue, onPress: () => Linking.openURL(`mailto:${client.email}`) }] : []),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Client Profile</Text>
        <TouchableOpacity onPress={() => router.push(`/edit-client/${id}` as any)} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
          <Ionicons name="create-outline" size={18} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Hero */}
        <View style={styles.profileHero}>
          <Avatar name={client.name} size="xl" />
          <Text style={[styles.profileName, { color: colors.textPrimary }]}>{client.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>{client.status}</Text>
            </View>
            {planName && (
              <View style={[styles.statusBadge, { backgroundColor: `${Colors.blue}18` }]}>
                <Text style={[styles.statusText, { color: Colors.blue }]}>{planName}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {quickActions.map((action, i) => (
            <TouchableOpacity key={i} style={styles.quickBtn} onPress={action.onPress} activeOpacity={0.7}>
              <View style={[styles.quickIcon, { backgroundColor: `${action.color}18` }]}>
                <Ionicons name={action.icon as any} size={20} color={action.color} />
              </View>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {[
            { value: upcomingSessions.length, label: 'Upcoming', color: Colors.blue },
            { value: completedSessions.length, label: 'Completed', color: Colors.green },
            { value: assignedWorkouts.length, label: 'Programs', color: Colors.accent },
          ].map((stat, i) => (
            <Card key={i} style={styles.miniStat}>
              <Text style={[styles.miniStatValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[styles.miniStatLabel, { color: colors.textTertiary }]}>{stat.label}</Text>
            </Card>
          ))}
        </View>

        {/* Contact Info */}
        {(client.email || client.phone) && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Contact</Text>
            <Card noPadding>
              {[
                client.email && { icon: 'mail-outline', value: client.email, action: contactActions.find(a => a.icon === 'mail') },
                client.phone && { icon: 'call-outline', value: client.phone, action: contactActions.find(a => a.icon === 'call') },
              ].filter(Boolean).map((item: any, i, arr) => (
                <TouchableOpacity key={i} style={[styles.contactRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]} onPress={item.action?.onPress} activeOpacity={0.7}>
                  <Ionicons name={item.icon} size={18} color={colors.textTertiary} />
                  <Text style={[styles.contactValue, { color: colors.textPrimary }]}>{item.value}</Text>
                  <Ionicons name="open-outline" size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </Card>
          </>
        )}

        {/* Assigned Workouts */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Assigned Workouts</Text>
          <TouchableOpacity onPress={() => setAssignMode('workout')}>
            <Ionicons name="add-circle" size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>
        {assignedWorkouts.length === 0 ? (
          <Card>
            <View style={styles.emptySection}>
              <Ionicons name="barbell-outline" size={28} color={colors.textTertiary} />
              <Text style={[styles.emptySectionText, { color: colors.textTertiary }]}>No workouts assigned yet</Text>
              <TouchableOpacity style={[styles.assignChip, { backgroundColor: `${Colors.accent}18` }]} onPress={() => setAssignMode('workout')}>
                <Ionicons name="add" size={14} color={Colors.accent} />
                <Text style={[styles.assignChipText, { color: Colors.accent }]}>Assign Workout</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
          <Card noPadding>
            {assignedWorkouts.map((item, i) => {
              const exCount = item.workout.workout_exercises?.length || 0;
              return (
                <TouchableOpacity
                  key={item.assignment.id}
                  style={[styles.assignedRow, i < assignedWorkouts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  onPress={() => router.push(`/workout/${item.workout.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.assignedIcon, { backgroundColor: `${Colors.accent}18` }]}>
                    <Ionicons name="barbell" size={20} color={Colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assignedName, { color: colors.textPrimary }]}>{item.workout.name}</Text>
                    <Text style={[styles.assignedMeta, { color: colors.textTertiary }]}>
                      {exCount} exercises · {new Date(item.assignment.assigned_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: item.assignment.status === 'completed' ? Colors.greenSoft : `${Colors.blue}18` }]}>
                    <Text style={[styles.statusPillText, { color: item.assignment.status === 'completed' ? Colors.green : Colors.blue }]}>
                      {item.assignment.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Card>
        )}

        {/* Assigned Diets */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Assigned Diet Plans</Text>
          <TouchableOpacity onPress={() => setAssignMode('diet')}>
            <Ionicons name="add-circle" size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>
        {assignedDiets.length === 0 ? (
          <Card>
            <View style={styles.emptySection}>
              <Ionicons name="nutrition-outline" size={28} color={colors.textTertiary} />
              <Text style={[styles.emptySectionText, { color: colors.textTertiary }]}>No diet plans assigned yet</Text>
              <TouchableOpacity style={[styles.assignChip, { backgroundColor: `${Colors.purple}18` }]} onPress={() => setAssignMode('diet')}>
                <Ionicons name="add" size={14} color={Colors.purple} />
                <Text style={[styles.assignChipText, { color: Colors.purple }]}>Assign Diet</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
          <Card noPadding>
            {assignedDiets.map((item, i) => {
              const mealCount = item.diet.diet_plan_meals?.length || 0;
              return (
                <TouchableOpacity
                  key={item.assignment.id}
                  style={[styles.assignedRow, i < assignedDiets.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  onPress={() => router.push(`/diet/${item.diet.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.assignedIcon, { backgroundColor: `${Colors.purple}18` }]}>
                    <Ionicons name="nutrition" size={20} color={Colors.purple} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assignedName, { color: colors.textPrimary }]}>{item.diet.name}</Text>
                    <Text style={[styles.assignedMeta, { color: colors.textTertiary }]}>
                      {mealCount} meals · {new Date(item.assignment.assigned_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: item.assignment.status === 'completed' ? Colors.greenSoft : `${Colors.blue}18` }]}>
                    <Text style={[styles.statusPillText, { color: item.assignment.status === 'completed' ? Colors.green : Colors.blue }]}>
                      {item.assignment.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Card>
        )}

        {/* Progress Tracking */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Progress Tracking</Text>
          <TouchableOpacity onPress={() => router.push(`/client/${client.id}/log-progress` as any)}>
            <Ionicons name="add-circle" size={24} color={Colors.purple} />
          </TouchableOpacity>
        </View>
        {progressLogs.length === 0 ? (
          <Card>
            <View style={styles.emptySection}>
              <Ionicons name="trending-up" size={28} color={colors.textTertiary} />
              <Text style={[styles.emptySectionText, { color: colors.textTertiary }]}>No progress logged yet</Text>
              <TouchableOpacity style={[styles.assignChip, { backgroundColor: `${Colors.purple}18` }]} onPress={() => router.push(`/client/${client.id}/log-progress` as any)}>
                <Ionicons name="add" size={14} color={Colors.purple} />
                <Text style={[styles.assignChipText, { color: Colors.purple }]}>Log Progress</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
          <Card noPadding>
            {progressLogs.slice(0, 3).map((log, i) => {
              const dt = new Date(log.date);
              return (
                <TouchableOpacity
                  key={log.id}
                  style={[styles.assignedRow, i < Math.min(progressLogs.length, 3) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  onPress={() => router.push(`/client/${client.id}/progress` as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.assignedIcon, { backgroundColor: `${Colors.purple}18` }]}>
                    <Ionicons name="scale" size={20} color={Colors.purple} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assignedName, { color: colors.textPrimary }]}>
                      {log.weight ? `${log.weight} lbs` : 'Check-in'}
                    </Text>
                    <Text style={[styles.assignedMeta, { color: colors.textTertiary }]}>
                      {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity 
              style={{ padding: Spacing.md, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }}
              onPress={() => router.push(`/client/${client.id}/progress` as any)}
            >
              <Text style={{ fontFamily: FontFamily.bodySemiBold, color: Colors.purple }}>View All Progress</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Goals & Notes */}
        {client.goals && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Goals</Text>
            <Card><Text style={[styles.bodyText, { color: colors.textSecondary }]}>{client.goals}</Text></Card>
          </>
        )}
        {client.notes && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notes</Text>
            <Card><Text style={[styles.bodyText, { color: colors.textSecondary }]}>{client.notes}</Text></Card>
          </>
        )}

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Sessions</Text>
            <Card noPadding>
              {sessions.slice(0, 5).map((session, i) => {
                const dt = new Date(session.date);
                return (
                  <View key={session.id} style={[styles.sessionRow, i < Math.min(sessions.length, 5) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <View style={[styles.sessionDot, {
                      backgroundColor: session.status === 'completed' ? Colors.green : session.status === 'cancelled' ? Colors.red : Colors.blue,
                    }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sessionDate, { color: colors.textPrimary }]}>
                        {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      <Text style={[styles.sessionTime, { color: colors.textTertiary }]}>
                        {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {session.type} · {session.duration}min
                      </Text>
                    </View>
                    {session.status !== 'upcoming' && (
                      <Text style={[styles.sessionStatus, { color: session.status === 'completed' ? Colors.green : Colors.red }]}>
                        {session.status === 'completed' ? 'Done' : 'Cancelled'}
                      </Text>
                    )}
                  </View>
                );
              })}
            </Card>
          </>
        )}

        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>

      {/* Assign Modal */}
      <Modal visible={assignMode !== null} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setAssignMode(null)} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Assign {assignMode === 'workout' ? 'Workout' : 'Diet Plan'}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}>
            {(assignMode === 'workout' ? workouts : diets).length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={[styles.emptySectionText, { color: colors.textTertiary }]}>
                  No {assignMode === 'workout' ? 'workouts' : 'diet plans'} created yet
                </Text>
                <Button
                  title={`Create ${assignMode === 'workout' ? 'Workout' : 'Diet Plan'}`}
                  onPress={() => { setAssignMode(null); router.push(assignMode === 'workout' ? '/create-workout' : '/create-diet' as any); }}
                  size="sm"
                />
              </View>
            ) : (
              (assignMode === 'workout' ? workouts : diets).map((item: any) => {
                const isWorkout = assignMode === 'workout';
                const alreadyAssigned = isWorkout
                  ? assignedWorkouts.some(aw => aw.workout.id === item.id)
                  : assignedDiets.some(ad => ad.diet.id === item.id);

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.assignModalItem, { backgroundColor: colors.bgElevated, opacity: alreadyAssigned ? 0.5 : 1 }]}
                    onPress={() => !alreadyAssigned && handleAssign(item.id)}
                    disabled={alreadyAssigned}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.assignedIcon, { backgroundColor: isWorkout ? `${Colors.accent}18` : `${Colors.purple}18` }]}>
                      <Ionicons name={isWorkout ? 'barbell' : 'nutrition'} size={20} color={isWorkout ? Colors.accent : Colors.purple} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.assignedName, { color: colors.textPrimary }]}>{item.name}</Text>
                      <Text style={[styles.assignedMeta, { color: colors.textTertiary }]}>
                        {item.description || (isWorkout ? `${item.workout_exercises?.length || 0} exercises` : `${item.diet_plan_meals?.length || 0} meals`)}
                      </Text>
                    </View>
                    {alreadyAssigned ? (
                      <View style={[styles.statusPill, { backgroundColor: Colors.greenSoft }]}>
                        <Text style={[styles.statusPillText, { color: Colors.green }]}>Assigned</Text>
                      </View>
                    ) : (
                      <View style={[styles.assignArrow, { backgroundColor: colors.accent }]}>
                        <Ionicons name="add" size={16} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md },
  scrollContent: { paddingHorizontal: Spacing.lg },

  profileHero: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  profileName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], letterSpacing: -0.5 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.full },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, textTransform: 'capitalize' },

  quickActions: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xl, marginBottom: Spacing.xl },
  quickBtn: { alignItems: 'center', gap: 6 },
  quickIcon: { width: 48, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  miniStat: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  miniStatValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl },
  miniStatLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, marginTop: Spacing.sm },
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, marginBottom: Spacing.md, marginTop: Spacing.sm },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  contactValue: { flex: 1, fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base },

  emptySection: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptySectionText: { fontFamily: FontFamily.body, fontSize: FontSize.sm },
  assignChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, marginTop: Spacing.xs },
  assignChipText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  assignedIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assignedName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, marginBottom: 2 },
  assignedMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  statusPillText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, textTransform: 'capitalize' },

  assignModalItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg },
  assignArrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  bodyText: { fontFamily: FontFamily.body, fontSize: FontSize.base, lineHeight: 20 },

  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  sessionDot: { width: 8, height: 8, borderRadius: 4 },
  sessionDate: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  sessionTime: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 1 },
  sessionStatus: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  emptyText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md },
});
