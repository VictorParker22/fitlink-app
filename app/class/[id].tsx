import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, Linking, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';

import { useApp } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { getCategoryColor } from '../../data/categoryColors';

const ClassVideoPlayer = ({ url }: { url: string }) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.videoPlayer}
      nativeControls={true}
      contentFit="contain"
    />
  );
};

export default function TrainerClassDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { classes, deleteClass, publishClass, workouts } = useApp();
  const { showAlert } = useAlert();

  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const classItem = useMemo(() => classes.find((c) => c.id === id), [classes, id]);

  const linkedWorkout = useMemo(() => {
    if (!classItem?.workout_id) return null;
    return workouts.find((w) => w.id === classItem.workout_id);
  }, [classItem, workouts]);

  if (!classItem) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyTitle}>CLASS NOT FOUND</Text>
          <Text style={styles.emptySubtitle}>This class may have been deleted or doesn't exist.</Text>
        </View>
      </View>
    );
  }

  const categoryColor = getCategoryColor(classItem.category);
  const isExternalVideo = classItem.video_url?.includes('youtube.com') || 
                          classItem.video_url?.includes('youtu.be') || 
                          classItem.video_url?.includes('vimeo.com') ||
                          classItem.video_url?.includes('instagram.com');

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showAlert({
      type: 'warning',
      title: 'Delete Class',
      message: `Are you sure you want to delete "${classItem.title}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteClass(classItem.id);
              router.back();
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete class' });
              setDeleting(false);
            }
          },
        },
      ],
    });
  };

  const handleTogglePublish = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPublishing(true);
    try {
      if (classItem.status === 'draft') {
        await publishClass(classItem.id);
        showAlert({ type: 'success', title: 'Published', message: 'Class is now live for clients!' });
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to update class status' });
    } finally {
      setPublishing(false);
    }
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Check out my on-demand class "${classItem.title}" on FitLink!`,
      });
    } catch (e) {}
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Custom Header Row */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{classItem.title.toUpperCase()}</Text>
          <View style={styles.headerRightActions}>
            <TouchableOpacity 
              onPress={() => router.push(`/create-class?editId=${classItem.id}` as any)} 
              style={styles.navBtn} 
              accessibilityLabel="Edit"
            >
              <Ionicons name="pencil" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.navBtn} accessibilityLabel="Share">
              <Ionicons name="share-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.navBtn} accessibilityLabel="Delete" disabled={deleting}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          {/* Media Header (Video or Thumbnail) */}
          <View style={styles.mediaContainer}>
            {classItem.video_url && !isExternalVideo ? (
              <ClassVideoPlayer url={classItem.video_url} />
            ) : classItem.thumbnail_url ? (
              <View style={styles.thumbWrapper}>
                <Image source={{ uri: classItem.thumbnail_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                {isExternalVideo && (
                  <TouchableOpacity 
                    style={styles.playExternalOverlay} 
                    onPress={() => Linking.openURL(classItem.video_url!)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.playExternalIcon}>
                      <Ionicons name="play" size={32} color="#000000" />
                    </View>
                    <Text style={styles.playExternalText}>Watch External Video</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.placeholderMedia}>
                <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.3)" />
                {isExternalVideo && (
                  <TouchableOpacity 
                    style={styles.externalLinkBtn}
                    onPress={() => Linking.openURL(classItem.video_url!)}
                  >
                    <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.externalLinkText}>Open Video Link</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Main Info Section */}
          <View style={styles.infoSection}>
            <View style={styles.categoryBadgeRow}>
              <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
                <Text style={styles.categoryBadgeText}>{classItem.category.toUpperCase()}</Text>
              </View>
              <View style={[styles.statusBadge, { borderColor: classItem.status === 'published' ? '#10B981' : '#9CA3AF' }]}>
                <Text style={[styles.statusBadgeText, { color: classItem.status === 'published' ? '#10B981' : '#9CA3AF' }]}>
                  {classItem.status.toUpperCase()}
                </Text>
              </View>
              {classItem.is_free ? (
                <View style={styles.freeBadge}>
                  <Text style={styles.freeBadgeText}>FREE PREVIEW</Text>
                </View>
              ) : (
                <View style={styles.passBadge}>
                  <Ionicons name="lock-closed" size={10} color="#FFD700" />
                  <Text style={styles.passBadgeText}>SUBSCRIBERS ONLY</Text>
                </View>
              )}
            </View>

            <Text style={styles.classTitle}>{classItem.title}</Text>
            
            {classItem.description ? (
              <Text style={styles.classDesc}>{classItem.description}</Text>
            ) : null}

            {/* Quick Metrics Bar */}
            <View style={styles.metricsContainer}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{classItem.duration_minutes}</Text>
                <Text style={styles.metricLabel}>MINUTES</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{classItem.difficulty.toUpperCase()}</Text>
                <Text style={styles.metricLabel}>LEVEL</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{classItem.take_count || 0}</Text>
                <Text style={styles.metricLabel}>TOTAL TAKES</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{(classItem.avg_rating || 0).toFixed(1)} ★</Text>
                <Text style={styles.metricLabel}>RATING</Text>
              </View>
            </View>
          </View>

          <View style={styles.dividerLine} />

          {/* Linked Workout Section */}
          {linkedWorkout && (
            <View style={styles.sectionWrap}>
              <Text style={styles.tagHeader}>LINKED WORKOUT ROUTINE</Text>
              <TouchableOpacity 
                style={styles.workoutCard}
                onPress={() => router.push(`/workout/${linkedWorkout.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.workoutIconWrap}>
                  <Ionicons name="barbell" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutTitle}>{linkedWorkout.name}</Text>
                  <Text style={styles.workoutSubtitle}>
                    {linkedWorkout.workout_exercises?.length || 0} Exercises • Tap to view structure
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>
          )}

          {/* Equipment & Tags */}
          <View style={styles.sectionWrap}>
            {classItem.equipment && classItem.equipment.length > 0 && (
              <View style={{ marginBottom: Spacing.xl }}>
                <Text style={styles.tagHeader}>EQUIPMENT REQUIRED</Text>
                <View style={styles.chipRow}>
                  {classItem.equipment.map((eq, i) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipText}>{eq}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {classItem.tags && classItem.tags.length > 0 && (
              <View>
                <Text style={styles.tagHeader}>TAGS</Text>
                <View style={styles.chipRow}>
                  {classItem.tags.map((tag, i) => (
                    <View key={i} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>#{tag.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Watch Time & Stats Breakdown */}
          <View style={styles.sectionWrap}>
            <Text style={styles.tagHeader}>ANALYTICS & CONSUMPTION</Text>
            <View style={styles.statsCard}>
              <View style={styles.statRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="time-outline" size={18} color="#FFD700" />
                  <Text style={styles.statLabel}>Total Watch Time</Text>
                </View>
                <Text style={styles.statValue}>{classItem.total_watch_minutes || 0} mins</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="people-outline" size={18} color="#10B981" />
                  <Text style={styles.statLabel}>Completions</Text>
                </View>
                <Text style={styles.statValue}>{classItem.take_count || 0}</Text>
              </View>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Footer CTA */}
        {classItem.status === 'draft' && (
          <View style={[styles.bottomCTAWrapper, { paddingBottom: insets.bottom || Spacing.xl }]}>
            <TouchableOpacity
              style={[styles.publishBtn, { backgroundColor: categoryColor }]}
              onPress={handleTogglePublish}
              disabled={publishing}
              activeOpacity={0.85}
            >
              {publishing ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.publishBtnText}>PUBLISH CLASS NOW</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  navBtn: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginHorizontal: 12,
    letterSpacing: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    marginTop: 16,
    letterSpacing: 1,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 8,
  },

  scrollContent: {
    paddingBottom: 40,
  },

  // Media
  mediaContainer: {
    width: '100%',
    height: 220,
    backgroundColor: '#0C0C0E',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  thumbWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  playExternalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  playExternalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  playExternalText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  placeholderMedia: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  externalLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.xs,
    backgroundColor: '#1C1C1E',
  },
  externalLinkText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFFFFF',
  },

  // Info
  infoSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  categoryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  categoryBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: '#000000',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.xs,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  freeBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  freeBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: '#10B981',
    letterSpacing: 0.5,
  },
  passBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  passBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: '#FFD700',
    letterSpacing: 0.5,
  },
  classTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  classDesc: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },

  // Metrics
  metricsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  metricLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#1C1C1E',
  },

  dividerLine: {
    height: 1,
    backgroundColor: '#1C1C1E',
    marginHorizontal: Spacing.lg,
  },

  sectionWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  tagHeader: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },

  // Workout Card
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: Spacing.md,
    gap: 12,
  },
  workoutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  workoutSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.xs,
  },
  chipText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  tagChip: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.xs,
  },
  tagChipText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
  },

  // Stats Card
  statsCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: Spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  statLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  statValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  statDivider: {
    height: 1,
    backgroundColor: '#1C1C1E',
    marginVertical: 10,
  },

  // Bottom CTA
  bottomCTAWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  publishBtn: {
    height: 48,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
    letterSpacing: 1,
  },
});
