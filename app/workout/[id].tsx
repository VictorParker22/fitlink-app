import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Dimensions, TextInput, Modal, Linking, Share, ActivityIndicator, Image as RNImage } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import RenderHtml from 'react-native-render-html';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Audio } from 'expo-av';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { proxyGifUrl, proxyGifStill } from '../../lib/exercisedb';
import { useAlert } from '../../context/AlertContext';
import Avatar from '../../components/Avatar';
import { Spacing, FontFamily, FontSize, Radius, Colors } from '../../constants/theme';
import { getWorkoutEmblem } from '../../utils/workoutEmblems';
import ExerciseThumbnail from '../../components/shared/exercise/ExerciseThumbnail';
import ExerciseMediaDemo from '../../components/shared/exercise/ExerciseMediaDemo';
import ExerciseInstructions from '../../components/shared/exercise/ExerciseInstructions';

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
      style={{ width: '100%', height: 200, borderRadius: Radius.md, backgroundColor: '#000000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: Spacing.xl }} 
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
      console.error('TTS error:', err);
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
          <TouchableOpacity onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
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
    if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('instagram.com') || url.includes('tiktok.com')) {
      Linking.openURL(url);
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
          <TouchableOpacity onPress={() => { setShowAssign(false); setSearchQuery(''); }} style={styles.backBtnDark} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.assignHeaderTitle}>Assign to Client</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md }}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="rgba(255,255,255,0.6)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search clients..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              selectionColor="#FFFFFF"
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.assignList} showsVerticalScrollIndicator={false}>
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
                      <Ionicons name="add" size={16} color="#000000" />
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
          <TouchableOpacity onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{workout.name}</Text>
          <View style={styles.headerRightActions}>
            <TouchableOpacity onPress={() => router.push(`/create-workout?editId=${workout.id}` as any)} style={styles.navBtn} accessibilityLabel="Edit">
              <Ionicons name="pencil" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDuplicate} style={styles.navBtn} accessibilityLabel="Duplicate" disabled={duplicating}>
              <Ionicons name="copy-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.navBtn} accessibilityLabel="Share">
              <Ionicons name="share-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => { setIsFavorite(!isFavorite); }} 
              style={styles.navBtn} 
              accessibilityLabel="Favorite"
            >
              <Ionicons name={isFavorite ? "star" : "star-outline"} size={22} color={isFavorite ? "#FFD700" : "#FFFFFF"} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={[styles.navBtn, { marginLeft: 4 }]} accessibilityLabel="Delete" disabled={deleting}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Description */}
          <View style={styles.descSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <RNImage source={getWorkoutEmblem(workout.id, workout.name, exercises.map(e => e.exercises?.muscle_group).filter(Boolean) as string[])} style={{ width: 52, height: 52, borderRadius: Radius.xs }} />
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

          {/* Session Breakdown */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Session Breakdown</Text>
            
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
                          />
                        </View>
                        <View style={styles.exerciseInfoCol}>
                          <Text style={styles.exerciseNameText}>{we.exercises?.name || 'Exercise'}</Text>
                          <Text style={styles.exerciseStatsText}>
                            {we.sets} sets  {we.reps} reps {we.rest_seconds > 0 ? ` ${we.rest_seconds}s rest` : ''}
                          </Text>
                        </View>
                        
                        <Ionicons name={expandedExerciseId === we.id ? 'chevron-up' : 'chevron-down'} size={20} color="rgba(255,255,255,0.4)" />
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
                        <Ionicons name="link" size={16} color="#EF4444" />
                        <Text style={styles.supersetHeaderText}>SUPERSET</Text>
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

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Fixed Sticky CTA */}
      <View style={[styles.bottomCTAWrapper, { paddingBottom: insets.bottom || Spacing.xl }]}>
        <TouchableOpacity
          style={styles.bottomBtn}
          onPress={() => setShowAssign(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomBtnText}>Assign to Client</Text>
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
            <TouchableOpacity
              style={styles.videoCloseBtn}
              onPress={() => { setShowVideoModal(false); setVideoUrl(null); }}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.videoModalTitleWrap}>
              <Ionicons name="videocam" size={18} color="#FF6B35" />
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

          <Text style={styles.videoModalHint}>Tap fullscreen for a better view</Text>
        </View>
      </Modal>

      {/* Loading Overlay for Voice Generation */}
      <Modal
        visible={loadingAudioId !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#FF6B35" style={{ marginBottom: 16 }} />
            <Text style={styles.loadingTitle}>Generating Voice</Text>
            <Text style={styles.loadingSubtitle}>
              Creating a natural voice guide for this exercise. This only happens once.
            </Text>
            <View style={styles.loadingDots}>
              <View style={[styles.loadingDot, { opacity: 0.4 }]} />
              <View style={[styles.loadingDot, { opacity: 0.7 }]} />
              <View style={[styles.loadingDot, { opacity: 1 }]} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000000' 
  },
  
  // Custom Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  navBtn: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  scrollContent: {
    paddingBottom: 40,
  },

  // Description Section
  descSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  descText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  metaDot: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
  },

  dividerLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: Spacing.lg,
  },

  sectionWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  sectionTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  equipmentText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },

  breakdownHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  breakdownGroupTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  breakdownGroupSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },

  breakdownCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  exerciseThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255,107,53,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    overflow: 'hidden',
  },
  miniPlayIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseInfoCol: {
    flex: 1,
  },
  exerciseNameText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  exerciseStatsText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  expandedContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  exerciseDescription: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: Spacing.lg,
  },

  // Superset
  supersetContainer: {
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
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
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: '#EF4444',
    letterSpacing: 1.5,
  },

  // Voice & Text Controls
  instructionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  voiceBtnActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  voiceBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#FF6B35',
  },
  voiceBtnTextActive: {
    color: '#FFFFFF',
  },
  showTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  showTextBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  instructionTextWrap: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },

  // Watch Video
  watchVideoBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  watchVideoText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: Radius.sm,
  },
  bottomBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.sm,
    color: '#000000',
    letterSpacing: 1,
  },

  // Video Modal
  videoModalOverlay: {
    flex: 1,
    backgroundColor: '#000000',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
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
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    paddingBottom: 40,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignHeaderTitle: {
    flex: 1,
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
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
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  assignName: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.base,
    color: '#FFFFFF',
  },
  assignMeta: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  assignedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#0F1A12',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 4,
  },
  assignedBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 8,
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  assignAddBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: '#FFFFFF',
    padding: 0,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['4xl'],
    gap: Spacing.md,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.lg,
    color: '#FFFFFF',
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.5)',
  },

  // Loading Overlay
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
  },
  loadingTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 8,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B35',
  },
});
