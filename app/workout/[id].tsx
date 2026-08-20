import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Dimensions, TextInput, Modal, Share, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import RenderHtml from 'react-native-render-html';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Audio } from 'expo-av';
import { supabase } from '../../lib/supabase';
import { isKnownVideoHost, isSafeMediaUrl, openExternalUrl } from '../../lib/safeUrl';
import { useApp } from '../../context/AppContext';
import { proxyGifUrl, proxyGifStill } from '../../lib/exercisedb';
import { useAlert } from '../../context/AlertContext';
import Avatar from '../../components/Avatar';
import { Spacing, FontSize, Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import ExerciseThumbnail from '../../components/shared/exercise/ExerciseThumbnail';
import ExerciseMediaDemo from '../../components/shared/exercise/ExerciseMediaDemo';
import ExerciseInstructions from '../../components/shared/exercise/ExerciseInstructions';
import MuscleMap from '../../components/anatomy/MuscleMap';
import { musclesForExercise, regionLabel, MuscleRegionId } from '../../lib/muscles';

const { width } = Dimensions.get('window');

const stripHtml = (html?: string) => {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

const ExerciseVideoPlayer = ({ url }: { url: string }) => {
  const player = useVideoPlayer(url, p => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: 200, borderRadius: Radius.md, backgroundColor: '#000000', borderWidth: 1, borderColor: CoachColors.borderMuted, marginBottom: Spacing.xl }}
      nativeControls={false}
      contentFit="cover"
    />
  );
};

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, deleteWorkout, duplicateWorkout, assignWorkout, activeClients, clientWorkouts } = useApp();
  const { showAlert } = useAlert();
  
  const [showAssign, setShowAssign] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoExerciseName, setVideoExerciseName] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [speakingExerciseId, setSpeakingExerciseId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [showTextExerciseId, setShowTextExerciseId] = useState<string | null>(null);
  const [soundRef, setSoundRef] = useState<Audio.Sound | null>(null);
  const [failedGifs, setFailedGifs] = useState<Set<string>>(new Set());
  const handleSpeak = useCallback(async (exerciseId: string, text?: string) => {
    if (speakingExerciseId === exerciseId) {
      if (soundRef) {
        await soundRef.stopAsync();
        await soundRef.unloadAsync();
        setSoundRef(null);
      }
      setSpeakingExerciseId(null);
      return;
    }
    const plainText = stripHtml(text);
    if (!plainText) {
      showAlert({ type: 'info', title: 'No Instructions', message: 'This exercise has no instructions to read aloud yet.' });
      return;
    }
    if (soundRef) {
      await soundRef.stopAsync();
      await soundRef.unloadAsync();
      setSoundRef(null);
    }
    try {
      setLoadingAudioId(exerciseId);
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { exercise_id: exerciseId, text: plainText }
      });
      if (error || !data?.audio_url) throw new Error(error?.message || 'Failed to generate audio');
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: data.audio_url }, { shouldPlay: true });
      setSoundRef(sound);
      setSpeakingExerciseId(exerciseId);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setSpeakingExerciseId(null);
          sound.unloadAsync();
          setSoundRef(null);
        }
      });
    } catch (err: any) {
      if (__DEV__) console.error('TTS error:', err);
      showAlert({ type: 'error', title: 'Voice Error', message: String(err?.message || 'Could not generate voice audio') });
      setSpeakingExerciseId(null);
    } finally {
      setLoadingAudioId(null);
    }
  }, [speakingExerciseId, soundRef]);

  const videoPlayer = useVideoPlayer(videoUrl || '', player => {
    if (videoUrl) player.play();
  });

  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id]);

  const exercises = useMemo(() => {
    if (!workout) return [];
    return [...(workout.workout_exercises || [])].sort((a, b) => a.order_index - b.order_index);
  }, [workout]);

  const muscleTargets = useMemo(() => {
    const primaryCounts = new Map<MuscleRegionId, number>();
    const secondaryCounts = new Map<MuscleRegionId, number>();
    exercises.forEach((we: any) => {
      const base = we.exercises;
      if (!base) return;
      const { primary, secondary } = musclesForExercise(base);
      primary.forEach(id => primaryCounts.set(id, (primaryCounts.get(id) || 0) + 1));
      secondary.forEach(id => secondaryCounts.set(id, (secondaryCounts.get(id) || 0) + 1));
    });
    const primary = [...primaryCounts.keys()];
    const secondary = [...secondaryCounts.keys()].filter(id => !primaryCounts.has(id));
    const rows = [
      ...[...primaryCounts.entries()].map(([id, count]) => ({ id, count, isPrimary: true })),
      ...secondary.map(id => ({ id, count: secondaryCounts.get(id) || 0, isPrimary: false })),
    ].sort((a, b) => (a.isPrimary === b.isPrimary ? b.count - a.count : a.isPrimary ? -1 : 1));
    return { primary, secondary, rows };
  }, [exercises]);

  const equipmentList = useMemo(() => {
    const list: string[] = [];
    exercises.forEach(we => {
      const eq = we.exercises?.equipment;
      if (eq && eq !== 'None' && eq !== 'None (bodyweight)' && !list.includes(eq)) {
        list.push(eq);
      }
    });
    if (list.length === 0) list.push('Bodyweight');
    return list;
  }, [exercises]);

  if (!workout) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={27} color={CoachColors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Workout not found</Text>
        </View>
      </View>
    );
  }

  const groupedExercises = useMemo(() => {
    const groups: { isGroup: boolean; items: typeof exercises; groupId?: string }[] = [];
    let currentGroup: typeof exercises = [];
    let currentGroupId: string | null = null;

    exercises.forEach((ex, idx) => {
      if (ex.group_id) {
        if (ex.group_id === currentGroupId) {
          currentGroup.push(ex);
        } else {
          if (currentGroup.length > 0) {
            groups.push({ isGroup: currentGroupId !== null, items: currentGroup, groupId: currentGroupId! });
          }
          currentGroup = [ex];
          currentGroupId = ex.group_id;
        }
      } else {
        if (currentGroup.length > 0) {
          groups.push({ isGroup: currentGroupId !== null, items: currentGroup, groupId: currentGroupId! });
        }
        currentGroup = [ex];
        currentGroupId = null;
      }
    });
    if (currentGroup.length > 0) {
      groups.push({ isGroup: currentGroupId !== null, items: currentGroup, groupId: currentGroupId! });
    }
    return groups;
  }, [exercises]);

  const estTime = Math.max(15, exercises.length * 5);
  const kcal = Math.max(150, exercises.length * 45);

  const handleDuplicate = async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const newWorkout = await duplicateWorkout(id as string);
      showAlert({ type: 'success', title: 'Duplicated', message: 'Workout duplicated successfully.' });
      router.replace(`/workout/${newWorkout.id}` as any);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setDuplicating(false);
    }
  };

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

  const handlePlayVideo = (url: string, exerciseName?: string) => {
    // video_url is coach-written content. The old substring test matched
    // `https://evil.tld/?ref=youtube.com`, so anything could be handed to
    // Linking.openURL. Scheme + exact hostname, via lib/safeUrl.ts.
    if (isKnownVideoHost(url)) {
      openExternalUrl(url);
    } else if (!isSafeMediaUrl(url)) {
      // Not https (file:, content:, javascript:, an app scheme...) - never
      // hand it to the OS or to the native media loader.
      if (__DEV__) console.warn('[workout] Blocked unsafe video URL:', url);
      Alert.alert('Video unavailable', "This exercise's video link can't be opened.");
    } else {
      setVideoExerciseName(exerciseName || 'Exercise Demo');
      setVideoUrl(url);
      setShowVideoModal(true);
    }
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

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out "${workout.name}" on FitLink!`,
      });
    } catch (e) {}
  };

  // Assign picker overlay (styled with flat black theme)
  if (showAssign) {
    const filteredClients = activeClients.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.assignHeader}>
          <TouchableOpacity hitSlop={4} onPress={() => { setShowAssign(false); setSearchQuery(''); }} style={styles.backBtnDark} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={25} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.assignHeaderTitle}>Assign to client</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md }}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={22} color={CoachColors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search clients..."
              placeholderTextColor={CoachColors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              selectionColor={CoachColors.accent}
            />
            {searchQuery !== '' && (
              <TouchableOpacity hitSlop={12} onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={22} color={CoachColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.assignList} showsVerticalScrollIndicator={false}>
          {filteredClients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No clients found</Text>
              <Text style={styles.emptyText}>Try a different search term</Text>
            </View>
          ) : (
            filteredClients.map((client) => {
              const alreadyAssigned = clientWorkouts.some(cw => cw.client_id === client.id && cw.workout_id === workout.id && cw.status === 'assigned');
              
              return (
                <TouchableOpacity
                  key={client.id}
                  style={[styles.assignItem, { opacity: alreadyAssigned ? 0.6 : 1 }]}
                  onPress={() => !alreadyAssigned && handleAssign(client.id)}
                  disabled={alreadyAssigned}
                  activeOpacity={0.7}
                >
                  <Avatar name={client.name} size="sm" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.assignName}>{client.name}</Text>
                    <Text style={styles.assignMeta}>{client.email || client.phone || 'No contact'}</Text>
                  </View>
                  {alreadyAssigned ? (
                    <View style={styles.assignedBadge}>
                      <Text style={styles.assignedBadgeText}>Assigned</Text>
                    </View>
                  ) : (
                    <View style={styles.assignAddBtn}>
                      <Ionicons name="add" size={18} color={CoachColors.onAccent} />
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

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Custom Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={27} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{workout.name}</Text>
          <View style={styles.headerRightActions}>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => router.push(`/create-workout?editId=${workout.id}` as any)} style={styles.navBtn} accessibilityLabel="Edit">
              <Ionicons name="pencil" size={25} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleDuplicate} style={styles.navBtn} accessibilityLabel="Duplicate" disabled={duplicating}>
              <Ionicons name="copy-outline" size={25} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleShare} style={styles.navBtn} accessibilityLabel="Share">
              <Ionicons name="share-outline" size={25} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => { setIsFavorite(!isFavorite); }}
              style={styles.navBtn}
              accessibilityLabel="Favorite"
            >
              <Ionicons name={isFavorite ? "star" : "star-outline"} size={25} color={isFavorite ? CoachColors.accent : CoachColors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleDelete} style={[styles.navBtn, { marginLeft: 4 }]} accessibilityLabel="Delete" disabled={deleting}>
              <Ionicons name="trash-outline" size={25} color={CoachColors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Clears the always-on sticky "Assign to client" CTA (button + its own
            insets.bottom padding). No tab bar renders over this stack screen. */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 76 }]}
        >
          {/* Description */}
          <View style={styles.descSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <View style={styles.workoutIconCircle}>
                <Ionicons name="barbell-outline" size={27} color={CoachColors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.descText}>
                  {workout.description || 'A custom workout routine designed to hit your goals.'}
                </Text>
              </View>
            </View>

            {/* Meta Row */}
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{estTime} mins</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{kcal} kcal est.</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{exercises.length} moves</Text>
            </View>
          </View>

          <View style={styles.dividerLine} />

          {/* Equipment */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Equipment</Text>
            <View style={styles.equipmentGrid}>
              {equipmentList.map((item, idx) => (
                <View key={idx} style={styles.equipmentItem}>
                  <Text style={styles.equipmentText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.dividerLine} />

          {/* Targets */}
          {muscleTargets.rows.length > 0 && (
            <>
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionTitle}>Targets</Text>
                <View style={styles.targetsCard}>
                  <MuscleMap
                    view="both"
                    height={150}
                    primary={muscleTargets.primary}
                    secondary={muscleTargets.secondary}
                  />
                  <View style={styles.targetsList}>
                    {muscleTargets.rows.slice(0, 7).map(row => (
                      <View key={row.id} style={styles.targetRow}>
                        <View
                          style={[
                            styles.targetDot,
                            !row.isPrimary && { backgroundColor: CoachColors.accentSoft },
                          ]}
                        />
                        <Text style={styles.targetRowText} numberOfLines={1}>
                          {regionLabel(row.id)} · {row.count} exercise{row.count === 1 ? '' : 's'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.dividerLine} />
            </>
          )}

          {/* Session Breakdown */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Session breakdown</Text>
            
            <View style={styles.breakdownHeaderRow}>
              <Text style={styles.breakdownGroupTitle}>Exercises</Text>
              <Text style={styles.breakdownGroupSubtitle}>{exercises.length} moves</Text>
            </View>


            <View style={styles.breakdownCard}>
              {groupedExercises.map((group, gIndex) => {
                const renderItems = () => group.items.map((we: any, i: number) => {
                  const hasDivider = i < group.items.length - 1;
                  const instructionText = we.notes || we.exercises?.instructions;
                  return (
                    <View key={we.id}>
                      <TouchableOpacity
                        style={styles.exerciseRow}
                        activeOpacity={0.7}
                        onPress={() => setExpandedExerciseId(prev => prev === we.id ? null : we.id)}
                      >
                        <View style={{ marginRight: 12 }}>
                          <ExerciseThumbnail
                            imageUrl={we.exercises?.image_url}
                            hasVideo={!!we.video_url}
                            size={44}
                            iconColor={CoachColors.textSecondary}
                          />
                        </View>
                        <View style={styles.exerciseInfoCol}>
                          <Text style={styles.exerciseNameText}>{we.exercises?.name || 'Exercise'}</Text>
                          <Text style={styles.exerciseStatsText}>
                            {we.sets} sets  {we.reps} reps {we.rest_seconds > 0 ? ` ${we.rest_seconds}s rest` : ''}
                          </Text>
                        </View>

                        <Ionicons name={expandedExerciseId === we.id ? 'chevron-up' : 'chevron-down'} size={22} color={CoachColors.textMuted} />
                      </TouchableOpacity>

                      {expandedExerciseId === we.id && (
                        <View style={styles.expandedContent}>
                          <ExerciseMediaDemo 
                            imageUrl={we.exercises?.image_url}
                            videoUrl={we.video_url}
                            exerciseName={we.exercises?.name}
                            onPlayVideo={handlePlayVideo}
                          />
                          <ExerciseInstructions 
                            exerciseId={we.id}
                            instructionText={instructionText}
                            muscleGroup={we.exercises?.muscle_group}
                          />
                        </View>
                      )}

                      {hasDivider && <View style={styles.rowDivider} />}
                    </View>
                  );
                });

                if (group.isGroup) {
                  return (
                    <View key={`group-${group.groupId || gIndex}`} style={styles.supersetContainer}>
                      <View style={styles.supersetHeader}>
                        <Ionicons name="link" size={18} color={CoachColors.accent} />
                        <Text style={styles.supersetHeaderText}>Superset</Text>
                      </View>
                      {renderItems()}
                    </View>
                  );
                }

                return (
                  <View key={`single-${group.items[0].id}`}>
                    {renderItems()}
                    {gIndex < groupedExercises.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                );
              })}
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>

      {/* Fixed Sticky CTA */}
      <View style={[styles.bottomCTAWrapper, { paddingBottom: insets.bottom || Spacing.xl }]}>
        <TouchableOpacity
          style={styles.bottomBtn}
          onPress={() => setShowAssign(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomBtnText}>Assign to client</Text>
        </TouchableOpacity>
      </View>

      {/* Video Modal */}
      <Modal
        visible={showVideoModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowVideoModal(false); setVideoUrl(null); }}
      >
        <View style={styles.videoModalOverlay}>
          <View style={styles.videoModalHeader}>
            <TouchableOpacity hitSlop={4}
              style={styles.videoCloseBtn}
              onPress={() => { setShowVideoModal(false); setVideoUrl(null); }}
            >
              <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.videoModalTitleWrap}>
              <Ionicons name="videocam" size={20} color={CoachColors.accent} />
              <Text style={styles.videoModalTitle} numberOfLines={1}>
                {videoExerciseName}
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.videoModalContent}>
            {videoUrl && (
              <VideoView
                player={videoPlayer}
                style={styles.videoPlayer}
                nativeControls
              />
            )}
          </View>

          {/* A Modal inherits no safe area — the hint supplies its own bottom clearance. */}
          <Text style={[styles.videoModalHint, { paddingBottom: insets.bottom + 16 }]}>Tap fullscreen for a better view</Text>
        </View>
      </Modal>

      {/* Loading Overlay for Voice Generation */}
      <Modal
        visible={loadingAudioId !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLoadingAudioId(null)}
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={CoachColors.accent} style={{ marginBottom: 16 }} />
            <Text style={styles.loadingTitle}>Generating voice</Text>
            <Text style={styles.loadingSubtitle}>
              Creating a natural voice guide for this exercise. This only happens once.
            </Text>
            <View style={styles.loadingDots}>
              <View style={[styles.loadingDot, { opacity: 0.4 }]} />
              <View style={[styles.loadingDot, { opacity: 0.7 }]} />
              <View style={[styles.loadingDot, { opacity: 1 }]} />
            </View>
            {/* A blocking overlay must never trap the user — if the request
                stalls, this is the visible way back out. */}
            <TouchableOpacity
              onPress={() => setLoadingAudioId(null)}
              hitSlop={12}
              style={styles.loadingCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel voice generation"
            >
              <Text style={styles.loadingCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },

  // Custom Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  navBtn: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  scrollContent: {},

  // Description Section
  descSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  workoutIconCircle: {
    width: 52,
    height: 52,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descText: {
    fontFamily: CoachFonts.body,
    fontSize: FontSize.sm,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    lineHeight: 24.5,
    marginBottom: Spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textMuted,
  },
  metaDot: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textFaint,
  },

  dividerLine: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: Spacing.lg,
  },

  sectionWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    marginBottom: Spacing.lg,
  },
  equipmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  equipmentItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  equipmentText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
  },

  // Targets
  targetsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: Spacing.lg,
  },
  targetsList: {
    flex: 1,
    gap: 8,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  targetDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  targetRowText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
    flex: 1,
  },

  breakdownHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  breakdownGroupTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 1.8,
  },
  breakdownGroupSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
  },

  breakdownCard: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    overflow: 'hidden',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  exerciseInfoCol: {
    flex: 1,
  },
  exerciseNameText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
    marginBottom: 2,
  },
  exerciseStatsText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
  },
  expandedContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  rowDivider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: Spacing.lg,
  },

  // Superset
  supersetContainer: {
    borderLeftWidth: 3,
    borderLeftColor: CoachColors.accent,
    marginVertical: 4,
  },
  supersetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  supersetHeaderText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.accent,
  },

  // Bottom CTA
  bottomCTAWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    backgroundColor: 'transparent',
  },
  bottomBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.accent,
    paddingVertical: 16,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
  },
  bottomBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.sm,
    color: CoachColors.onAccent,
  },

  // Video Modal
  videoModalOverlay: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  videoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 60,
    paddingBottom: Spacing.md,
  },
  videoCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoModalTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  videoModalTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  videoModalContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayer: {
    width: '100%',
    height: 300,
  },
  videoModalHint: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textMuted,
    textAlign: 'center',
  },

  // Assign UI
  assignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backBtnDark: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignHeaderTitle: {
    flex: 1,
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    textAlign: 'center',
  },
  assignList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
  },
  assignItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  assignName: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: FontSize.base,
    color: CoachColors.textPrimary,
  },
  assignMeta: {
    fontFamily: CoachFonts.body,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  assignedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    borderRadius: 4,
    borderCurve: 'continuous',
  },
  assignedBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.accent,
    letterSpacing: 0.3,
  },
  assignAddBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: FontSize.sm,
    color: CoachColors.textPrimary,
    padding: 0,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['4xl'],
    gap: Spacing.md,
  },
  emptyTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: FontSize.lg,
    color: CoachColors.textPrimary,
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: FontSize.sm,
    color: CoachColors.textMuted,
  },

  // Loading Overlay
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16,18,16,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: CoachColors.surfaceRaised,
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingVertical: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
  },
  loadingTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textMuted,
    textAlign: 'center',
    lineHeight: 22.5,
    marginBottom: 20,
  },
  loadingCancel: {
    marginTop: 18,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loadingCancelText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    textAlign: 'center',
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 8,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
});
