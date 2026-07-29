import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Modal, ActivityIndicator, Dimensions, Image as RNImage } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { getWorkoutEmblem } from '../../utils/workoutEmblems';

type AssignMode = 'enroll' | 'workout' | 'diet' | null;
type TabType = 'overview' | 'health' | 'programs' | 'progress';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const {
    getClientById, getClientSessions, getClientWorkouts, getClientDiets, getClientProgress,
    workouts, diets, assignWorkout, assignDietPlan, plans,
    upgradeClientToPlan, extendClientTrial, getClientHealthSnapshot, requestHealthAccess,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [assignMode, setAssignMode] = useState<AssignMode>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const client = getClientById(id || '');
  const sessions = getClientSessions(id || '');
  const assignedWorkouts = getClientWorkouts(id || '');
  const assignedDiets = getClientDiets(id || '');
  const progressLogs = getClientProgress(id || '');
  const healthSnapshot = getClientHealthSnapshot(id || '');

  const upcomingSessions = sessions.filter((s) => s.status === 'upcoming' && new Date(s.date) > new Date());
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const planName = plans.find(p => p.id === client?.plan_id)?.name;

  if (!client) {
    return (
      <SafeAreaView style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={st.emptyState}>
          <Text style={st.emptyText}>Client not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: '#22C55E1A', text: '#22C55E' },
    trial: { bg: '#EAB3081A', text: '#EAB308' },
    inactive: { bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.4)' },
  };
  const statusStyle = statusColors[client.status] || statusColors.inactive;

  const handleAssign = async (itemId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      if (assignMode === 'workout') {
        await assignWorkout(itemId, client.id, today);
        showAlert({ type: 'success', title: 'Workout Assigned!', message: 'The workout has been assigned to this client.' });
      } else {
        await assignDietPlan(itemId, client.id, today);
        showAlert({ type: 'success', title: 'Diet Plan Assigned!', message: 'The diet plan has been assigned to this client.' });
      }
      setAssignMode(null);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Assignment Failed', message: err.message || 'Failed to assign' });
    }
  };

  const contactActions = [
    ...(client.phone ? [{ icon: 'call', label: 'Call', color: Colors.green, onPress: () => Linking.openURL(`tel:${client.phone}`) }] : []),
    ...(client.email ? [{ icon: 'mail', label: 'Email', color: Colors.blue, onPress: () => Linking.openURL(`mailto:${client.email}`) }] : []),
  ];

  // Start or resume in-app conversation
  const startConversation = useCallback(async () => {
    try {
      // Check for existing conversation
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_id', client.id)
        .maybeSingle();

      if (existing) {
        router.push(`/chat/${existing.id}` as any);
        return;
      }

      // Create new conversation
      const { data: { user } } = await supabase.auth.getUser();
      const { data: newConvo, error } = await supabase
        .from('conversations')
        .insert({ trainer_id: user!.id, client_id: client.id })
        .select()
        .single();

      if (error) throw error;
      router.push(`/chat/${newConvo.id}` as any);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Could not open chat' });
    }
  }, [client.id, router, showAlert]);

  return (
    <View style={st.container}>
      {/* Header */}
      <SafeAreaView edges={['top']}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} style={st.headerBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Client Profile</Text>
          <TouchableOpacity onPress={() => router.push(`/edit-client/${id}` as any)} style={st.headerBtn}>
            <Ionicons name="create-outline" size={20} color="#FF6B35" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Hero Section */}
        <View style={st.profileHero}>
          <Avatar name={client.name} size="xl" imageUrl={client.avatar_url} />
          <Text style={st.profileName}>{client.name}</Text>
          <View style={st.badgeRow}>
            <View style={[st.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[st.statusText, { color: statusStyle.text }]}>{client.status}</Text>
            </View>
            {planName && (
              <View style={[st.statusBadge, { backgroundColor: '#6C9BF21A' }]}>
                <Text style={[st.statusText, { color: '#6C9BF2' }]}>{planName}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Dynamic Trial Banner */}
        {client.status === 'trial' && (() => {
          const trialEnd = client.trial_end_date
            ? new Date(client.trial_end_date)
            : new Date(new Date(client.created_at).getTime() + 20 * 86400000);
          const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000));
          const totalTrialDays = Math.ceil((trialEnd.getTime() - new Date(client.created_at).getTime()) / 86400000);
          const maxDays = 40;
          const canExtend = totalTrialDays < maxDays;
          const isExpired = daysLeft === 0;
          const progressPct = Math.min(1, (totalTrialDays - daysLeft) / totalTrialDays);

          return (
            <View style={[st.trialCard, { borderColor: isExpired ? '#EF444430' : 'rgba(255,255,255,0.06)' }]}>
              <View style={st.trialHeader}>
                <View style={st.trialHeaderLeft}>
                  <Ionicons name={isExpired ? 'alert-circle' : 'time'} size={20} color={isExpired ? '#EF4444' : '#EAB308'} />
                  <View>
                    <Text style={st.trialTitle}>{isExpired ? 'Trial Expired' : `${daysLeft} Day${daysLeft !== 1 ? 's' : ''} Left`}</Text>
                    <Text style={st.trialSub}>{isExpired ? 'Upgrade to active plan' : `Ends ${trialEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</Text>
                  </View>
                </View>
              </View>
              <View style={st.trialTrack}>
                <View style={[st.trialFill, { width: `${progressPct * 100}%`, backgroundColor: isExpired ? '#EF4444' : daysLeft <= 5 ? '#EAB308' : '#22C55E' }]} />
              </View>
              <View style={st.trialActions}>
                {canExtend && !isExpired && (
                  <>
                    <TouchableOpacity
                      style={st.extendBtn}
                      onPress={async () => {
                        try {
                          await extendClientTrial(client.id, 7);
                          showAlert({ type: 'success', title: 'Extended!', message: 'Trial extended by 1 week.' });
                        } catch { showAlert({ type: 'error', title: 'Error', message: 'Could not extend trial.' }); }
                      }}
                    >
                      <Text style={st.extendText}>+1 Wk</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={st.extendBtn}
                      onPress={async () => {
                        try {
                          await extendClientTrial(client.id, 30);
                          showAlert({ type: 'success', title: 'Extended!', message: 'Trial extended by 1 month.' });
                        } catch { showAlert({ type: 'error', title: 'Error', message: 'Max 40-day trial reached.' }); }
                      }}
                    >
                      <Text style={st.extendText}>+1 Mo</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity style={st.upgradeBtn} onPress={() => setShowUpgradeModal(true)}>
                  <Ionicons name="arrow-up-circle" size={15} color="#FFF" />
                  <Text style={st.upgradeText}>Upgrade Plan</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* Quick Messaging & Booking Icons */}
        <View style={st.quickActions}>
          {[
            { icon: 'chatbubble-ellipses', label: 'Message', color: '#6C9BF2', action: startConversation },
            { icon: 'calendar-outline', label: 'Book Session', color: '#22C55E', action: () => router.push(`/book-session?clientId=${client.id}` as any) },
            { icon: 'ribbon', label: 'Enroll', color: '#FF6B35', action: () => setAssignMode('enroll') },
            { icon: 'trending-up', label: 'Progress', color: '#A78BFA', action: () => router.push(`/client/${client.id}/progress` as any) },
          ].map((action, i) => (
            <TouchableOpacity key={i} style={st.quickAction} onPress={action.action} activeOpacity={0.7}>
              <View style={[st.quickActionIcon, { backgroundColor: `${action.color}14` }]}>
                <Ionicons name={action.icon as any} size={22} color={action.color} />
              </View>
              <Text style={st.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Selection Switcher */}
        <View style={st.tabBar}>
          {(['overview', 'health', 'programs', 'progress'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[st.tabItem, activeTab === tab && st.tabItemActive]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab); }}
            >
              <Text style={[st.tabText, activeTab === tab && st.tabTextActive]}>
                {tab.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <View style={st.tabContent}>
            {/* Contacts details */}
            {(client.email || client.phone) && (
              <Card noPadding style={st.sectionCard}>
                {[
                  client.email && { icon: 'mail-outline', value: client.email, action: contactActions.find(a => a.icon === 'mail') },
                  client.phone && { icon: 'call-outline', value: client.phone, action: contactActions.find(a => a.icon === 'call') },
                ].filter(Boolean).map((item: any, i, arr) => (
                  <TouchableOpacity key={i} style={[st.contactRow, i < arr.length - 1 && st.rowBorder]} onPress={item.action?.onPress} activeOpacity={0.7}>
                    <Ionicons name={item.icon} size={18} color="rgba(255,255,255,0.4)" />
                    <Text style={st.contactValue}>{item.value}</Text>
                    <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                ))}
              </Card>
            )}

            {/* ── Client Snapshot ── */}
            {client.assessment_data && Object.keys(client.assessment_data).length > 0 ? (() => {
              const d = client.assessment_data;
              const hasBodyStats = d.weight || d.height || d.age || d.gender;
              const fitnessGoals: string[] = d.fitness_goals || (d.fitness_goal ? [d.fitness_goal] : []);
              const trainingStyles: string[] = d.training_styles || [];
              const activities: string[] = d.activities || [];
              const commitDays: number = d.commit_days || d.weekly_workout_goal || 0;

              const trainingIcons: Record<string, string> = {
                '1-on-1 with a coach': 'person',
                'Solo workouts': 'fitness',
                'Small group sessions': 'people',
                'Online / virtual': 'laptop',
                'In-person at gym': 'barbell',
                'Something else': 'ellipsis-horizontal',
              };

              return (
                <View style={{ gap: Spacing.md }}>
                  {/* Body Stats */}
                  {hasBodyStats && (
                    <>
                      <Text style={st.sectionTitle}>Body Stats</Text>
                      <View style={st.snapGrid}>
                        {d.weight && (
                          <View style={st.snapTile}>
                            <Ionicons name="scale-outline" size={18} color="#FF6B35" />
                            <Text style={st.snapTileValue}>{typeof d.weight === 'object' ? d.weight.value : d.weight}</Text>
                            <Text style={st.snapTileLabel}>Weight</Text>
                          </View>
                        )}
                        {d.height && (
                          <View style={st.snapTile}>
                            <Ionicons name="resize-outline" size={18} color="#7DAAFF" />
                            <Text style={st.snapTileValue}>{typeof d.height === 'object' ? d.height.value : d.height}</Text>
                            <Text style={st.snapTileLabel}>Height</Text>
                          </View>
                        )}
                        {d.age && (
                          <View style={st.snapTile}>
                            <Ionicons name="calendar-outline" size={18} color="#B8A4FF" />
                            <Text style={st.snapTileValue}>{d.age}</Text>
                            <Text style={st.snapTileLabel}>Age</Text>
                          </View>
                        )}
                        {d.gender && (
                          <View style={st.snapTile}>
                            <Ionicons name="person-outline" size={18} color="#2DD4BF" />
                            <Text style={st.snapTileValue}>{d.gender}</Text>
                            <Text style={st.snapTileLabel}>Gender</Text>
                          </View>
                        )}
                      </View>
                    </>
                  )}

                  {/* Fitness Goals */}
                  {fitnessGoals.length > 0 && (
                    <>
                      <Text style={st.sectionTitle}>Goals</Text>
                      <View style={st.snapChipRow}>
                        {fitnessGoals.map((g, i) => (
                          <View key={i} style={st.snapGoalChip}>
                            <Ionicons name="flag" size={12} color="#FF6B35" />
                            <Text style={st.snapGoalText}>{g}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Weekly Commitment */}
                  {commitDays > 0 && (
                    <>
                      <Text style={st.sectionTitle}>Weekly Commitment</Text>
                      <View style={st.snapCommitCard}>
                        <View style={st.snapCommitRing}>
                          <Text style={st.snapCommitNum}>{commitDays}</Text>
                        </View>
                        <View>
                          <Text style={st.snapCommitLabel}>{commitDays} day{commitDays !== 1 ? 's' : ''} per week</Text>
                          <Text style={st.snapCommitDesc}>
                            {commitDays <= 2 ? 'Light schedule' : commitDays <= 4 ? 'Moderate schedule' : 'Intense schedule'}
                          </Text>
                        </View>
                        {/* Mini bar visualization */}
                        <View style={st.snapCommitBars}>
                          {[1,2,3,4,5,6,7].map(day => (
                            <View key={day} style={[st.snapCommitBar, day <= commitDays && st.snapCommitBarActive]} />
                          ))}
                        </View>
                      </View>
                    </>
                  )}

                  {/* Training Style */}
                  {trainingStyles.length > 0 && (
                    <>
                      <Text style={st.sectionTitle}>Training Style</Text>
                      <View style={st.snapChipRow}>
                        {trainingStyles.map((s, i) => (
                          <View key={i} style={st.snapTagChip}>
                            <Ionicons name={(trainingIcons[s] || 'ellipsis-horizontal') as any} size={13} color="rgba(255,255,255,0.5)" />
                            <Text style={st.snapTagText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Activity Preferences */}
                  {activities.length > 0 && (
                    <>
                      <Text style={st.sectionTitle}>Preferred Activities</Text>
                      <View style={st.snapChipRow}>
                        {activities.map((a, i) => (
                          <View key={i} style={st.snapActivityChip}>
                            <Text style={st.snapActivityText}>{a}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              );
            })() : (
              <Card style={st.emptySection}>
                <Ionicons name="clipboard-outline" size={32} color="rgba(255,255,255,0.3)" />
                <Text style={st.emptyText}>No assessment completed yet</Text>
                <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 4 }}>
                  Client hasn't completed their onboarding profile
                </Text>
              </Card>
            )}

            {/* Goals & Notes */}
            {client.goals && (
              <>
                <Text style={st.sectionTitle}>Client Goals</Text>
                <Card style={st.noteCard}>
                  <Text style={st.noteText}>{client.goals}</Text>
                </Card>
              </>
            )}
            {client.notes && (
              <>
                <Text style={st.sectionTitle}>Coach Notes</Text>
                <Card style={st.noteCard}>
                  <Text style={st.noteText}>{client.notes}</Text>
                </Card>
              </>
            )}
          </View>
        )}

        {/* TAB 2: HEALTH */}
        {activeTab === 'health' && (
          <View style={st.tabContent}>
            {healthSnapshot ? (
              <View style={{ gap: Spacing.md }}>
                <Text style={st.sectionTitle}>Daily Health Snapshot</Text>
                <View style={st.assessGrid}>
                  <Card style={st.assessTile}>
                    <Ionicons name="walk-outline" size={20} color="#6C9BF2" />
                    <Text style={st.assessTileValue}>{(healthSnapshot.steps || 0).toLocaleString()}</Text>
                    <Text style={st.assessTileLabel}>steps</Text>
                  </Card>
                  <Card style={st.assessTile}>
                    <Ionicons name="heart-outline" size={20} color="#FF6B35" />
                    <Text style={st.assessTileValue}>{healthSnapshot.heart_rate_avg || '--'}</Text>
                    <Text style={st.assessTileLabel}>avg BPM</Text>
                  </Card>
                  <Card style={st.assessTile}>
                    <Ionicons name="water-outline" size={20} color="#22C55E" />
                    <Text style={st.assessTileValue}>{healthSnapshot.blood_oxygen ? `${healthSnapshot.blood_oxygen}%` : '--'}</Text>
                    <Text style={st.assessTileLabel}>SpO2</Text>
                  </Card>
                </View>

                <Card noPadding style={st.sectionCard}>
                  <View style={[st.assessRow, st.rowBorder]}>
                    <Ionicons name="pulse" size={16} color="#FF6B35" style={st.assessRowIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={st.assessRowLabel}>Heart Rate Range</Text>
                      <Text style={st.assessRowValue}>{healthSnapshot.heart_rate_min || '--'} - {healthSnapshot.heart_rate_max || '--'} BPM</Text>
                    </View>
                  </View>
                  <View style={[st.assessRow, st.rowBorder]}>
                    <Ionicons name="bed-outline" size={16} color="#6C9BF2" style={st.assessRowIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={st.assessRowLabel}>Resting Heart Rate</Text>
                      <Text style={st.assessRowValue}>{healthSnapshot.resting_heart_rate || '--'} BPM</Text>
                    </View>
                  </View>
                  <View style={st.assessRow}>
                    <Ionicons name="analytics" size={16} color="#A78BFA" style={st.assessRowIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={st.assessRowLabel}>Blood Pressure</Text>
                      <Text style={st.assessRowValue}>
                        {healthSnapshot.blood_pressure_systolic && healthSnapshot.blood_pressure_diastolic
                          ? `${healthSnapshot.blood_pressure_systolic}/${healthSnapshot.blood_pressure_diastolic} mmHg`
                          : 'Not sync\'d'}
                      </Text>
                    </View>
                  </View>
                </Card>
                <Text style={st.syncText}>
                  Last synced: {healthSnapshot.synced_at ? new Date(healthSnapshot.synced_at).toLocaleDateString() : 'N/A'}
                </Text>
              </View>
            ) : (
              <Card style={st.emptySection}>
                <Ionicons name="heart-dislike-outline" size={36} color="rgba(255,255,255,0.3)" />
                <Text style={st.emptyText}>Health data not shared</Text>
                <Text style={st.emptySub}>Ask the client to approve sharing steps and vitals from Apple Health / Google Fit.</Text>
                {!(client as any).health_sharing_requested && (
                  <Button
                    title="Request Health Data"
                    variant="primary"
                    onPress={async () => {
                      try {
                        await requestHealthAccess(client.id);
                        showAlert({ type: 'success', title: 'Request Sent', message: `Request has been sent to ${client.name}.` });
                      } catch {
                        showAlert({ type: 'error', title: 'Error', message: 'Failed to send request.' });
                      }
                    }}
                    style={{ marginTop: Spacing.md }}
                  />
                )}
                {(client as any).health_sharing_requested && (
                  <View style={st.pendingBadge}>
                    <Text style={st.pendingBadgeText}>Request Pending Approval</Text>
                  </View>
                )}
              </Card>
            )}
          </View>
        )}

        {/* TAB 3: PROGRAMS */}
        {activeTab === 'programs' && (
          <View style={st.tabContent}>
            {/* ── Active Program ── */}
            <Text style={st.sectionTitle}>Active Program</Text>
            {(() => {
              const activePlan = plans.find(p => p.id === client.plan_id);
              if (!activePlan) return (
                <TouchableOpacity style={st.planCardEmpty} onPress={() => setAssignMode('enroll')} activeOpacity={0.7}>
                  <Ionicons name="ribbon-outline" size={32} color="rgba(255,255,255,0.2)" />
                  <Text style={st.planEmptyText}>No program enrolled</Text>
                  <View style={[st.selectBtn, { marginTop: 4 }]}>
                    <Text style={st.selectText}>Enroll Now</Text>
                    <Ionicons name="arrow-forward" size={14} color="#FFF" />
                  </View>
                </TouchableOpacity>
              );

              const trackNodes = activePlan.track || [];
              const trackWorkouts = trackNodes.filter(n => n.type === 'workout');
              const trackDiets = trackNodes.filter(n => n.type === 'diet');
              const trackMilestones = trackNodes.filter(n => n.type === 'milestone');

              return (
                <Card noPadding style={st.sectionCard}>
                  <View style={{ padding: Spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                      <LinearGradient colors={['#FF6B35', '#FF8F65']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.planIcon}>
                        <Ionicons name="ribbon" size={24} color="#FFF" />
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <Text style={st.planName}>{activePlan.name}</Text>
                        <Text style={st.planPrice}>${activePlan.price} / {activePlan.period === 'monthly' ? 'mo' : activePlan.period}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setAssignMode('enroll')} style={{ padding: 8 }}>
                        <Ionicons name="swap-horizontal" size={20} color="rgba(255,255,255,0.4)" />
                      </TouchableOpacity>
                    </View>

                    {/* Track Stats */}
                    {trackNodes.length > 0 && (
                      <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md }}>
                        {trackWorkouts.length > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="barbell" size={14} color="#FF6B35" />
                            <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{trackWorkouts.length} workouts</Text>
                          </View>
                        )}
                        {trackDiets.length > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="nutrition" size={14} color="#A78BFA" />
                            <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{trackDiets.length} diets</Text>
                          </View>
                        )}
                        {trackMilestones.length > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="flag" size={14} color="#22C55E" />
                            <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{trackMilestones.length} milestones</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Track Timeline */}
                  {trackNodes.length > 0 && (
                    <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                      {trackNodes.sort((a, b) => a.order - b.order).slice(0, 5).map((node, i) => {
                        const isLast = i === Math.min(trackNodes.length, 5) - 1;
                        const nodeWorkout = node.type === 'workout' ? workouts.find(w => w.id === node.id) : null;
                        const nodeDiet = node.type === 'diet' ? diets.find(d => d.id === node.id) : null;
                        const nodeIcon = node.type === 'workout' ? 'barbell' : node.type === 'diet' ? 'nutrition' : 'flag';
                        const nodeColor = node.type === 'workout' ? '#FF6B35' : node.type === 'diet' ? '#A78BFA' : '#22C55E';
                        const nodeName = nodeWorkout?.name || nodeDiet?.name || node.label || 'Milestone';

                        return (
                          <View key={i} style={[st.assignedRow, !isLast && st.rowBorder]}>
                            <View style={{ alignItems: 'center', width: 30 }}>
                              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: nodeColor }} />
                              {!isLast && <View style={{ width: 2, height: 24, backgroundColor: 'rgba(255,255,255,0.08)', position: 'absolute', top: 14 }} />}
                            </View>
                            <View style={[st.assignedIcon, { backgroundColor: `${nodeColor}18` }]}>
                              <Ionicons name={nodeIcon as any} size={18} color={nodeColor} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={st.assignedName}>{nodeName}</Text>
                              <Text style={st.assignedMeta}>Step {node.order + 1} · {node.type}</Text>
                            </View>
                          </View>
                        );
                      })}
                      {trackNodes.length > 5 && (
                        <TouchableOpacity style={st.viewAllBtn} onPress={() => router.push(`/plan/${activePlan.id}` as any)}>
                          <Text style={st.viewAllBtnText}>View full track ({trackNodes.length} items)</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </Card>
              );
            })()}

            {/* ── Bonus Workouts ── */}
            {assignedWorkouts.length > 0 && (
              <>
                <Text style={st.sectionTitle}>Bonus Workouts</Text>
                <Card noPadding style={st.sectionCard}>
                  {assignedWorkouts.map((item, i) => (
                    <TouchableOpacity
                      key={item.assignment.id}
                      style={[st.assignedRow, i < assignedWorkouts.length - 1 && st.rowBorder]}
                      onPress={() => router.push(`/workout/${item.workout.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <View style={[st.assignedIcon, { backgroundColor: '#111111' }]}>
                        <RNImage source={getWorkoutEmblem(item.workout.id, item.workout.name, item.workout.workout_exercises?.map((we: any) => we.exercises?.muscle_group).filter(Boolean))} style={{ width: 36, height: 36, borderRadius: Radius.xs }} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.assignedName}>{item.workout.name}</Text>
                        <Text style={st.assignedMeta}>
                          {item.workout.workout_exercises?.length || 0} exercises · {new Date(item.assignment.assigned_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                      <View style={[st.statusPill, { backgroundColor: item.assignment.status === 'completed' ? '#22C55E1A' : '#6C9BF21A' }]}>
                        <Text style={[st.statusPillText, { color: item.assignment.status === 'completed' ? '#22C55E' : '#6C9BF2' }]}>
                          {item.assignment.status}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </Card>
              </>
            )}

            {/* ── Custom Diet Plans ── */}
            {assignedDiets.length > 0 && (
              <>
                <Text style={st.sectionTitle}>Custom Diet Plans</Text>
                <Card noPadding style={st.sectionCard}>
                  {assignedDiets.map((item, i) => (
                    <TouchableOpacity
                      key={item.assignment.id}
                      style={[st.assignedRow, i < assignedDiets.length - 1 && st.rowBorder]}
                      onPress={() => router.push(`/diet/${item.diet.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <View style={[st.assignedIcon, { backgroundColor: '#A78BFA18' }]}>
                        <Ionicons name="nutrition" size={20} color="#A78BFA" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.assignedName}>{item.diet.name}</Text>
                        <Text style={st.assignedMeta}>
                          {item.diet.diet_plan_meals?.length || 0} meals · {new Date(item.assignment.assigned_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                      <View style={[st.statusPill, { backgroundColor: item.assignment.status === 'completed' ? '#22C55E1A' : '#6C9BF21A' }]}>
                        <Text style={[st.statusPillText, { color: item.assignment.status === 'completed' ? '#22C55E' : '#6C9BF2' }]}>
                          {item.assignment.status}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </Card>
              </>
            )}

            {/* Quick Add button */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: Spacing.sm }}
              onPress={() => setAssignMode('workout')}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={18} color="rgba(255,255,255,0.4)" />
              <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Quick add workout or diet</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 4: PROGRESS */}
        {activeTab === 'progress' && (
          <View style={st.tabContent}>
            <View style={st.sectionHeader}>
              <Text style={st.sectionTitle}>Client Logs</Text>
              <TouchableOpacity onPress={() => router.push(`/client/${client.id}/log-progress` as any)}>
                <Ionicons name="add-circle" size={24} color="#FF6B35" />
              </TouchableOpacity>
            </View>

            {progressLogs.length === 0 ? (
              <Card style={st.emptySection}>
                <Ionicons name="trending-up-outline" size={28} color="rgba(255,255,255,0.3)" />
                <Text style={st.emptyText}>No progress entries recorded yet</Text>
              </Card>
            ) : (
              <Card noPadding style={st.sectionCard}>
                {progressLogs.slice(0, 5).map((log, i) => (
                  <TouchableOpacity
                    key={log.id}
                    style={[st.assignedRow, i < Math.min(progressLogs.length, 5) - 1 && st.rowBorder]}
                    onPress={() => router.push(`/client/${client.id}/progress` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={[st.assignedIcon, { backgroundColor: '#6C9BF218' }]}>
                      <Ionicons name="scale" size={20} color="#6C9BF2" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.assignedName}>{log.weight ? `${log.weight} lbs` : 'Check-in entry'}</Text>
                      <Text style={st.assignedMeta}>{new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={st.viewAllBtn}
                  onPress={() => router.push(`/client/${client.id}/progress` as any)}
                >
                  <Text style={st.viewAllBtnText}>View All Progress History</Text>
                </TouchableOpacity>
              </Card>
            )}

            {/* Sessions list */}
            {sessions.length > 0 && (
              <>
                <Text style={st.sectionTitle}>Recent Sessions</Text>
                <Card noPadding style={st.sectionCard}>
                  {sessions.slice(0, 5).map((session, i) => {
                    const dt = new Date(session.date);
                    return (
                      <View key={session.id} style={[st.sessionRow, i < Math.min(sessions.length, 5) - 1 && st.rowBorder]}>
                        <View style={[st.sessionDot, { backgroundColor: session.status === 'completed' ? '#22C55E' : session.status === 'cancelled' ? '#EF4444' : '#6C9BF2' }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={st.sessionDate}>{dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                          <Text style={st.sessionTime}>
                            {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {session.type} · {session.duration}m
                          </Text>
                        </View>
                        {session.status !== 'upcoming' && (
                          <Text style={[st.sessionStatus, { color: session.status === 'completed' ? '#22C55E' : '#EF4444' }]}>
                            {session.status === 'completed' ? 'Done' : 'Cancelled'}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </Card>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Enroll / Quick Add Modal */}
      <Modal visible={assignMode !== null} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[st.container, { backgroundColor: '#000' }]}>
          <View style={st.header}>
            <TouchableOpacity onPress={() => { setAssignMode(null); setShowQuickAdd(false); }} style={st.headerBtn}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={st.headerTitle}>
              {assignMode === 'enroll' ? 'Enroll in Program' : `Assign ${assignMode === 'workout' ? 'Workout' : 'Diet Plan'}`}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}>
            {/* ── Programs Section (shown in enroll mode) ── */}
            {assignMode === 'enroll' && (
              <>
                <Text style={st.modalSubtitle}>Choose a program for {client.name}. This gives them access to all workouts and diets in the program's track.</Text>
                {plans.length === 0 ? (
                  <View style={st.emptySection}>
                    <Ionicons name="ribbon-outline" size={48} color="rgba(255,255,255,0.3)" />
                    <Text style={st.emptyText}>No programs created yet</Text>
                    <Button title="Create Program" onPress={() => { setAssignMode(null); router.push('/create-plan' as any); }} size="sm" style={{ marginTop: Spacing.md }} />
                  </View>
                ) : (
                  plans.map((plan) => {
                    const isActive = client.plan_id === plan.id;
                    const trackCount = plan.track?.length || 0;
                    const wCount = plan.track?.filter(n => n.type === 'workout').length || 0;
                    const dCount = plan.track?.filter(n => n.type === 'diet').length || 0;

                    return (
                      <TouchableOpacity
                        key={plan.id}
                        style={[st.planCard, isActive && { borderColor: '#FF6B35', borderWidth: 1.5 }]}
                        activeOpacity={isActive ? 1 : 0.85}
                        onPress={async () => {
                          if (isActive) return;
                          try {
                            await upgradeClientToPlan(client.id, plan.id);
                            setAssignMode(null);
                            showAlert({ type: 'success', title: 'Enrolled! 🎉', message: `${client.name} is now enrolled in ${plan.name}.` });
                          } catch (err: any) {
                            showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to enroll' });
                          }
                        }}
                      >
                        <LinearGradient colors={isActive ? ['#FF6B35', '#FF8F65'] : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.planIcon}>
                          <Ionicons name="ribbon" size={24} color={isActive ? '#FFF' : 'rgba(255,255,255,0.5)'} />
                        </LinearGradient>
                        <View style={{ flex: 1 }}>
                          <Text style={st.planName}>{plan.name}</Text>
                          <Text style={st.planPrice}>
                            ${plan.price}/{plan.period === 'monthly' ? 'mo' : plan.period}
                            {trackCount > 0 ? ` · ${wCount} workouts${dCount > 0 ? ` · ${dCount} diets` : ''}` : ''}
                          </Text>
                        </View>
                        {isActive ? (
                          <View style={[st.statusPill, { backgroundColor: '#22C55E1A' }]}>
                            <Text style={[st.statusPillText, { color: '#22C55E' }]}>Active</Text>
                          </View>
                        ) : (
                          <View style={st.selectBtn}>
                            <Text style={st.selectText}>Enroll</Text>
                            <Ionicons name="arrow-forward" size={14} color="#FFF" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}

                {/* Quick Add Expandable */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}
                  onPress={() => setShowQuickAdd(!showQuickAdd)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={showQuickAdd ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.4)" />
                  <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                    Quick add individual workout or diet
                  </Text>
                </TouchableOpacity>

                {showQuickAdd && (
                  <View style={{ gap: Spacing.sm }}>
                    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                      <TouchableOpacity
                        style={[st.createNewTemplateBtn, { flex: 1 }]}
                        onPress={() => setAssignMode('workout')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="barbell" size={18} color="#FF6B35" />
                        <Text style={st.createNewTemplateBtnText}>Assign Workout</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[st.createNewTemplateBtn, { flex: 1 }]}
                        onPress={() => setAssignMode('diet')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="nutrition" size={18} color="#FF6B35" />
                        <Text style={st.createNewTemplateBtnText}>Assign Diet</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* ── Workout / Diet Assignment List (shown in workout/diet mode) ── */}
            {(assignMode === 'workout' || assignMode === 'diet') && (
              <>
                <TouchableOpacity
                  style={st.createNewTemplateBtn}
                  onPress={() => {
                    const mode = assignMode;
                    setAssignMode(null);
                    router.push(mode === 'workout' ? '/create-workout' : '/create-diet' as any);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={20} color="#FF6B35" />
                  <Text style={st.createNewTemplateBtnText}>
                    Create New {assignMode === 'workout' ? 'Workout' : 'Diet Plan'}
                  </Text>
                </TouchableOpacity>

                {(assignMode === 'workout' ? workouts : diets).length === 0 ? (
                  <View style={st.emptySection}>
                    <Text style={st.emptyText}>No templates found</Text>
                  </View>
                ) : (
                  (assignMode === 'workout' ? workouts : diets).map((item: any) => {
                    const isWorkout = assignMode === 'workout';
                    const alreadyAssigned = isWorkout
                      ? assignedWorkouts.some(aw => aw.workout.id === item.id && aw.assignment.status === 'assigned')
                      : assignedDiets.some(ad => ad.diet.id === item.id && ad.assignment.status === 'assigned');

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[st.assignModalItem, { opacity: alreadyAssigned ? 0.5 : 1 }]}
                        onPress={() => !alreadyAssigned && handleAssign(item.id)}
                        disabled={alreadyAssigned}
                        activeOpacity={0.7}
                      >
                        <View style={[st.assignedIcon, { backgroundColor: isWorkout ? '#FF6B3518' : '#A78BFA18' }]}>
                          <Ionicons name={isWorkout ? 'barbell' : 'nutrition'} size={20} color={isWorkout ? '#FF6B35' : '#A78BFA'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.assignedName}>{item.name}</Text>
                          <Text style={st.assignedMeta}>
                            {item.description || (isWorkout ? `${item.workout_exercises?.length || 0} exercises` : `${item.diet_plan_meals?.length || 0} meals`)}
                          </Text>
                        </View>
                        {alreadyAssigned ? (
                          <View style={[st.statusPill, { backgroundColor: '#22C55E1A' }]}>
                            <Text style={[st.statusPillText, { color: '#22C55E' }]}>Assigned</Text>
                          </View>
                        ) : (
                          <View style={st.assignArrow}>
                            <Ionicons name="add" size={16} color="#000" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}

                {/* Back to enroll */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 }}
                  onPress={() => setAssignMode('enroll')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.4)" />
                  <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Back to programs</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Upgrade Plan Modal */}
      <Modal visible={showUpgradeModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[st.container, { backgroundColor: '#000' }]}>
          <View style={st.header}>
            <TouchableOpacity onPress={() => setShowUpgradeModal(false)} style={st.headerBtn}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={st.headerTitle}>Select Membership Plan</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
            <Text style={st.modalSubtitle}>Upgrade {client.name} from trial status to a permanent plan.</Text>
            {plans.length === 0 ? (
              <View style={st.emptySection}>
                <Ionicons name="document-text-outline" size={48} color="rgba(255,255,255,0.3)" />
                <Text style={st.emptyText}>No subscription plans created yet</Text>
                <Button title="Create Plan" onPress={() => { setShowUpgradeModal(false); router.push('/create-plan' as any); }} size="sm" style={{ marginTop: Spacing.md }} />
              </View>
            ) : (
              plans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={st.planCard}
                  activeOpacity={0.85}
                  onPress={async () => {
                    try {
                      await upgradeClientToPlan(client.id, plan.id);
                      setShowUpgradeModal(false);
                      showAlert({ type: 'success', title: 'Success! 🎉', message: `${client.name} upgraded to plan.` });
                    } catch (err: any) {
                      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to upgrade' });
                    }
                  }}
                >
                  <LinearGradient colors={['#FF6B35', '#FF8F65']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.planIcon}>
                    <Ionicons name="diamond" size={24} color="#FFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={st.planName}>{plan.name}</Text>
                    <Text style={st.planPrice}>${plan.price} / {plan.period === 'monthly' ? 'mo' : plan.period}</Text>
                  </View>
                  <View style={st.selectBtn}>
                    <Text style={st.selectText}>Select</Text>
                    <Ionicons name="arrow-forward" size={14} color="#FFF" />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  headerBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: '#FFFFFF' },

  profileHero: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  profileName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: '#FFFFFF', letterSpacing: -0.5 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.full },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, textTransform: 'capitalize' },

  trialCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: Radius.lg, padding: Spacing.base, marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  trialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trialHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  trialTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: '#FFFFFF' },
  trialSub: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  trialTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', marginTop: Spacing.md },
  trialFill: { height: '100%', borderRadius: 2 },
  trialActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  extendBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.08)' },
  extendText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: '#FFFFFF' },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: '#FF6B35', marginLeft: 'auto' },
  upgradeText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: '#FFFFFF' },

  quickActions: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  quickAction: { flex: 1, alignItems: 'center', gap: 6 },
  quickActionIcon: { width: 50, height: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },

  tabBar: { flexDirection: 'row', paddingHorizontal: Spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', marginBottom: Spacing.md },
  tabItem: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: '#FF6B35' },
  tabText: { fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
  tabTextActive: { color: '#FF6B35' },
  tabContent: { paddingHorizontal: Spacing.lg, gap: Spacing.md },

  sectionCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  contactValue: { flex: 1, fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: '#FFFFFF' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.sm },
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: '#FFFFFF', marginTop: Spacing.md },
  seeAll: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: '#FF6B35' },

  assessGrid: { flexDirection: 'row', gap: Spacing.sm },
  assessTile: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, gap: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.lg },
  assessTileValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: '#FFFFFF' },
  assessTileLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)' },

  assessRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  assessRowIcon: { marginRight: Spacing.xs },
  assessRowLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.4)' },
  assessRowValue: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#FFFFFF', marginTop: 2 },

  noteCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  noteText: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: 'rgba(255,255,255,0.8)', lineHeight: 22 },

  syncText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.3)', textAlign: 'right', marginTop: Spacing.xs },
  pendingBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: '#EAB3081A', alignSelf: 'flex-start', marginTop: Spacing.md },
  pendingBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: '#EAB308' },

  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  assignedIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  assignedName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#FFFFFF' },
  assignedMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  statusPillText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, textTransform: 'capitalize' },

  viewAllBtn: { padding: Spacing.md, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  viewAllBtnText: { fontFamily: FontFamily.bodySemiBold, color: '#FF6B35', fontSize: FontSize.sm },

  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  sessionDot: { width: 8, height: 8, borderRadius: 4 },
  sessionDate: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: '#FFFFFF' },
  sessionTime: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  sessionStatus: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  emptySection: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', borderRadius: Radius.lg },
  emptySub: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingHorizontal: Spacing.xl },

  assignModalItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: Spacing.sm },
  assignArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  createNewTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.2)',
    marginBottom: Spacing.md,
  },
  createNewTemplateBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: FontSize.sm,
    color: '#FF6B35',
  },

  modalSubtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.5)', lineHeight: 20, marginBottom: Spacing.md },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base, borderRadius: Radius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: Spacing.sm },
  planCardEmpty: { width: '100%', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: Radius.lg, padding: Spacing.xl, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  planEmptyText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.3)' },
  planIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  planName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: '#FFFFFF' },
  planPrice: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: '#FF6B35' },
  selectText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: '#FFF' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  emptyText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: '#FFFFFF' },

  // ── Client Snapshot ──
  snapGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  snapTile: {
    flex: 1, minWidth: '44%', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 8,
  },
  snapTileValue: {
    fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: '#FFF',
  },
  snapTileLabel: {
    fontFamily: FontFamily.body, fontSize: 10, color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  snapChipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  snapGoalChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.2)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  snapGoalText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: '#FF8255',
  },
  snapCommitCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 16,
  },
  snapCommitRing: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 3, borderColor: '#FF6B35',
    alignItems: 'center', justifyContent: 'center',
  },
  snapCommitNum: {
    fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: '#FF6B35',
  },
  snapCommitLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: '#FFF',
  },
  snapCommitDesc: {
    fontFamily: FontFamily.body, fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2,
  },
  snapCommitBars: {
    flexDirection: 'row', gap: 3, marginLeft: 'auto',
  },
  snapCommitBar: {
    width: 6, height: 20, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  snapCommitBarActive: {
    backgroundColor: '#FF6B35',
  },
  snapTagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7,
  },
  snapTagText: {
    fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)',
  },
  snapActivityChip: {
    backgroundColor: 'rgba(125,170,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(125,170,255,0.15)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  snapActivityText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: '#7DAAFF',
  },
});
