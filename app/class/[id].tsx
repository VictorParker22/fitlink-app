import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';

import { useApp } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { isKnownVideoHost, isVimeoHost, isSafeMediaUrl, openExternalUrl } from '../../lib/safeUrl';
import { Spacing, Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

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
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={27} color={CoachColors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="videocam-outline" size={54} color={CoachColors.textFaint} />
          <Text style={styles.emptyTitle}>Class not found</Text>
          <Text style={styles.emptySubtitle}>This class may have been deleted or doesn't exist.</Text>
        </View>
      </View>
    );
  }

  // classes.video_url is coach-written content, so it is untrusted input.
  // These were substring tests, which `https://evil.tld/?ref=youtube.com`
  // passes, and the result was fed straight to Linking.openURL with no scheme
  // check at all. Now: parsed scheme + exact hostname (lib/safeUrl.ts).
  const isExternalVideo = isKnownVideoHost(classItem.video_url) || isVimeoHost(classItem.video_url);
  // Only an https URL may reach the inline expo-video player - a file: or
  // content: URI would otherwise hit a native media loader.
  const canPlayInline = !isExternalVideo && isSafeMediaUrl(classItem.video_url);

  const openExternalVideo = () => {
    openExternalUrl(classItem.video_url).then((opened) => {
      if (!opened) {
        showAlert({ type: 'error', title: 'Video unavailable', message: "This class's video link can't be opened." });
      }
    });
  };

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
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={27} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{classItem.title}</Text>
          <View style={styles.headerRightActions}>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => router.push(`/create-class?editId=${classItem.id}` as any)}
              style={styles.navBtn}
              accessibilityLabel="Edit"
            >
              <Ionicons name="pencil" size={22} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleShare} style={styles.navBtn} accessibilityLabel="Share">
              <Ionicons name="share-outline" size={22} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleDelete} style={styles.navBtn} accessibilityLabel="Delete" disabled={deleting}>
              <Ionicons name="trash-outline" size={22} color={CoachColors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom clearance is derived, not fixed: this is a root-stack screen so
            there is no tab bar. Only the absolutely-positioned draft CTA (its own
            paddingTop + button + insets.bottom) has to be cleared, and only when
            it actually renders. */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: classItem.status === 'draft' ? insets.bottom + 78 : insets.bottom + 24 },
          ]}
        >

          {/* Media Header (Video or Thumbnail) */}
          <View style={styles.mediaContainer}>
            {canPlayInline ? (
              <ClassVideoPlayer url={classItem.video_url!} />
            ) : classItem.thumbnail_url ? (
              <View style={styles.thumbWrapper}>
                <Image source={{ uri: classItem.thumbnail_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                {isExternalVideo && (
                  <TouchableOpacity
                    style={styles.playExternalOverlay}
                    onPress={openExternalVideo}
                    activeOpacity={0.8}
                  >
                    <View style={styles.playExternalIcon}>
                      <Ionicons name="play" size={36} color="#000000" />
                    </View>
                    <Text style={styles.playExternalText}>Watch external video</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.placeholderMedia}>
                <Ionicons name="videocam-outline" size={54} color={CoachColors.textFaint} />
                {isExternalVideo && (
                  <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }}
                    style={styles.externalLinkBtn}
                    onPress={openExternalVideo}
                  >
                    <Ionicons name="open-outline" size={18} color={CoachColors.textPrimary} />
                    <Text style={styles.externalLinkText}>Open video link</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Main Info Section */}
          <View style={styles.infoSection}>
            <View style={styles.categoryBadgeRow}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{classItem.category}</Text>
              </View>
              <View style={[styles.statusBadge, { borderColor: classItem.status === 'published' ? CoachColors.accent : CoachColors.textMuted }]}>
                <Text style={[styles.statusBadgeText, { color: classItem.status === 'published' ? CoachColors.accent : CoachColors.textMuted }]}>
                  {classItem.status}
                </Text>
              </View>
              {classItem.is_free ? (
                <View style={styles.freeBadge}>
                  <Text style={styles.freeBadgeText}>Free preview</Text>
                </View>
              ) : (
                <View style={styles.passBadge}>
                  <Ionicons name="lock-closed" size={11} color={CoachColors.warning} />
                  <Text style={styles.passBadgeText}>Subscribers only</Text>
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
                <Text style={styles.metricLabel}>Minutes</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{classItem.difficulty}</Text>
                <Text style={styles.metricLabel}>Level</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{classItem.take_count || 0}</Text>
                <Text style={styles.metricLabel}>Total takes</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{(classItem.avg_rating || 0).toFixed(1)} ★</Text>
                <Text style={styles.metricLabel}>Rating</Text>
              </View>
            </View>
          </View>

          <View style={styles.dividerLine} />

          {/* Linked Workout Section */}
          {linkedWorkout && (
            <View style={styles.sectionWrap}>
              <Text style={styles.tagHeader}>Linked workout routine</Text>
              <TouchableOpacity
                style={styles.workoutCard}
                onPress={() => router.push(`/workout/${linkedWorkout.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.workoutIconWrap}>
                  <Ionicons name="barbell" size={22} color={CoachColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutTitle}>{linkedWorkout.name}</Text>
                  <Text style={styles.workoutSubtitle}>
                    {linkedWorkout.workout_exercises?.length || 0} Exercises • Tap to view structure
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={CoachColors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Equipment & Tags */}
          <View style={styles.sectionWrap}>
            {classItem.equipment && classItem.equipment.length > 0 && (
              <View style={{ marginBottom: Spacing.xl }}>
                <Text style={styles.tagHeader}>Equipment required</Text>
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
                <Text style={styles.tagHeader}>Tags</Text>
                <View style={styles.chipRow}>
                  {classItem.tags.map((tag, i) => (
                    <View key={i} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Watch Time & Stats Breakdown */}
          <View style={styles.sectionWrap}>
            <Text style={styles.tagHeader}>Analytics and consumption</Text>
            <View style={styles.statsCard}>
              <View style={styles.statRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="time-outline" size={20} color={CoachColors.accent} />
                  <Text style={styles.statLabel}>Total watch time</Text>
                </View>
                <Text style={styles.statValue}>{classItem.total_watch_minutes || 0} mins</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="people-outline" size={20} color={CoachColors.accent} />
                  <Text style={styles.statLabel}>Completions</Text>
                </View>
                <Text style={styles.statValue}>{classItem.take_count || 0}</Text>
              </View>
            </View>
          </View>

        </ScrollView>

        {/* Footer CTA */}
        {classItem.status === 'draft' && (
          <View style={[styles.bottomCTAWrapper, { paddingBottom: insets.bottom || Spacing.xl }]}>
            <TouchableOpacity
              style={styles.publishBtn}
              onPress={handleTogglePublish}
              disabled={publishing}
              activeOpacity={0.85}
            >
              {publishing ? (
                <ActivityIndicator color={CoachColors.onAccent} />
              ) : (
                <Text style={styles.publishBtnText}>Publish class now</Text>
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
    backgroundColor: CoachColors.bg,
  },
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
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
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
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    marginTop: 16,
    letterSpacing: 1,
  },
  emptySubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },

  scrollContent: {},

  // Media
  mediaContainer: {
    width: '100%',
    height: 220,
    backgroundColor: '#000000', // video letterbox area — stays black behind footage
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
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
  // Overlay on top of thumbnail imagery — keeps black scrim + white text
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
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
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
    backgroundColor: CoachColors.surface,
  },
  externalLinkText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
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
    backgroundColor: CoachColors.accent,
  },
  categoryBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.xs,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  freeBadge: {
    backgroundColor: CoachColors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  freeBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.accent,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  passBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  passBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.warning,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  classTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24.5,
    color: CoachColors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  classDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    lineHeight: 22.5,
    marginBottom: Spacing.lg,
  },

  // Metrics
  metricsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
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
    fontFamily: CoachFonts.headingBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    marginBottom: 2,
  },
  metricLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: CoachColors.border,
  },

  dividerLine: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: Spacing.lg,
  },

  sectionWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  tagHeader: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },

  // Workout Card
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.xs,
    padding: Spacing.md,
    gap: 12,
  },
  workoutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
    marginBottom: 2,
  },
  workoutSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textSecondary,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.xs,
  },
  chipText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },
  tagChip: {
    backgroundColor: CoachColors.accentSofter,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.xs,
  },
  tagChipText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.textSecondary,
  },

  // Stats Card
  statsCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
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
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
  },
  statValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  statDivider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
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
    backgroundColor: CoachColors.bg,
    borderTopWidth: 1,
    borderTopColor: CoachColors.border,
  },
  publishBtn: {
    height: 48,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.accent,
  },
  publishBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14.5,
    color: CoachColors.onAccent,
    letterSpacing: 1,
  },
});
