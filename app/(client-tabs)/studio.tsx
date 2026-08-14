import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BoltEmptyState from '../../components/mascot/BoltEmptyState';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';

import { useGlobalStudio } from '../../hooks/useGlobalStudio';
import { Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

export default function GlobalStudioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { liveClasses, vodClasses, loading, refreshData } = useGlobalStudio();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // Sort and filter live classes
  const liveNow = useMemo(() => {
    return liveClasses?.filter(c => c.status === 'live') || [];
  }, [liveClasses]);

  const upcomingLive = useMemo(() => {
    const now = Date.now();
    return liveClasses?.filter(c => {
    if (c.status !== 'scheduled' && c.status !== 'live') return false;
        // Hide ghost streams that were scheduled more than 1 hour ago but never went live/ended
        const schedTime = new Date(c.scheduled_for).getTime();
        return schedTime > now - 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()) || [];
  }, [liveClasses]);

  const handleJoinLive = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/live-player/${id}` as any);
  };

  const handleOpenVOD = (item: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/class-detail',
      params: {
        id: item.id,
        title: item.title,
        category: item.category,
        durationMin: item.duration_minutes,
        level: item.difficulty,
        thumbnail: item.thumbnail_url,
        video_url: item.video_url,
        instructor: item.trainer?.name,
        instructorAvatar: item.trainer?.avatar_url,
      }
    } as any);
  };

  const handleRemindMe = async (classItem: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await Notifications.requestPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Please enable notifications in your settings to get reminders.');
      return;
    }

    const scheduledDate = new Date(classItem.scheduled_for);
    const reminderDate = new Date(scheduledDate.getTime() - 15 * 60000); // 15 mins before

    // If the class is less than 15 mins away, just alert them
    if (reminderDate.getTime() < Date.now()) {
      Alert.alert('Class starts soon!', 'This class is starting in less than 15 minutes.');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Live Class: ${classItem.title}`,
        body: `${classItem.trainer?.name} is going live in 15 minutes! Tap to join.`,
        data: { url: `/live-player/${classItem.id}` },
      },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date: reminderDate },
    });

    Alert.alert('Reminder Set!', `We'll remind you 15 minutes before ${classItem.trainer?.name} goes live.`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Discover</Text>
          <Text style={styles.headerSubtitle}>Live and on-demand classes</Text>
        </View>
        <TouchableOpacity style={styles.searchBtn}>
          <Ionicons name="search" size={24} color={CoachColors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 90, Spacing['2xl'] * 2) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={CoachColors.accent}
            colors={[CoachColors.accent]}
          />
        }
      >
        {loading && !refreshing && liveClasses.length === 0 && vodClasses.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={CoachColors.accent} />
            <Text style={styles.loadingText}>Loading studio...</Text>
          </View>
        ) : (
          <>
            {/* LIVE NOW ACROSS FITLINK */}
        {liveNow.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Live now</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
              {liveNow.map((item) => (
                <View key={item.id} style={styles.liveNowCard}>
                  <View style={styles.liveHeader}>
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveBadgeText}>Live</Text>
                    </View>
                    {typeof item.viewer_count === 'number' && item.viewer_count > 0 && (
                      <View style={styles.viewerBadge}>
                        <Ionicons name="eye" size={12} color={CoachColors.textSecondary} />
                        <Text style={styles.viewerText}>{item.viewer_count} watching</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.liveContent}>
                    <Image source={{ uri: item.trainer?.avatar_url }} style={styles.liveAvatar} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.liveTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.liveCoachName}>{item.trainer?.name}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.joinBtn}
                    onPress={() => handleJoinLive(item.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.joinBtnText}>Join broadcast</Text>
                    <Ionicons name="arrow-forward" size={16} color={CoachColors.onAccent} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* UPCOMING DROPS */}
        {upcomingLive.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming streams</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
              {upcomingLive.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.upcomingCard}
                  onPress={() => handleJoinLive(item.id)}
                  activeOpacity={0.9}
                >
                  <View style={styles.upcomingHeader}>
                    <Image source={{ uri: item.trainer?.avatar_url }} style={styles.upcomingAvatar} contentFit="cover" />
                    <View style={styles.upcomingTimeBox}>
                      <Text style={styles.upcomingTime}>
                        {new Date(item.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={styles.upcomingDate}>
                        {new Date(item.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.upcomingInfo}>
                    <Text style={styles.upcomingTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.upcomingTrainer}>with {item.trainer?.name}</Text>
                  </View>

                  <View style={styles.upcomingActions}>
                    <TouchableOpacity
                      style={styles.remindBtn}
                      onPress={() => handleJoinLive(item.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="enter-outline" size={16} color={CoachColors.textPrimary} />
                      <Text style={styles.remindBtnText}>Enter waiting room</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Empty state if nothing is live or upcoming */}
        {!loading && liveNow.length === 0 && upcomingLive.length === 0 && (
          <View style={styles.section}>
            <View style={styles.noLiveState}>
              <Ionicons name="radio-outline" size={32} color={CoachColors.textFaint} />
              <Text style={styles.noLiveText}>No broadcasts right now.</Text>
              <Text style={styles.noLiveSubtext}>Check back later or explore on-demand classes below.</Text>
            </View>
          </View>
        )}

        {/* TRENDING ON-DEMAND */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trending classes</Text>
          {vodClasses.length === 0 ? (
            <BoltEmptyState
              pose="analyze"
              title="No classes yet"
              subtitle="Coaches are recording on-demand classes now — new ones land here as they publish."
            />
          ) : (
            <View style={styles.grid}>
              {vodClasses.map((item) => {
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.vodCard}
                    onPress={() => handleOpenVOD(item)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.vodThumb}>
                      {item.thumbnail_url ? (
                        <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                      ) : (
                        <View style={[StyleSheet.absoluteFillObject, styles.placeholderThumb]}>
                          <Ionicons name="play" size={24} color={CoachColors.textFaint} />
                        </View>
                      )}
                      <View style={styles.vodCategoryBadge}>
                        <Text style={styles.vodCategoryText}>{item.category || 'Class'}</Text>
                      </View>
                      <View style={styles.vodDurationBadge}>
                        <Text style={styles.vodDurationText}>{item.duration_minutes} min</Text>
                      </View>
                    </View>
                    <View style={styles.vodInfo}>
                      <View style={styles.vodAvatarContainer}>
                        <Image source={{ uri: item.trainer?.avatar_url }} style={styles.vodAvatar} contentFit="cover" />
                        <View style={styles.vodTextInfo}>
                          <Text style={styles.vodTitle} numberOfLines={2}>{item.title}</Text>
                          <Text style={styles.vodTrainerName}>{item.trainer?.name}</Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    marginTop: 2,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: Spacing.lg,
  },
  section: {
    marginBottom: Spacing['2xl'],
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.textSecondary,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  horizontalScroll: {
    paddingHorizontal: Spacing.xl,
    gap: 16,
  },

  /* LIVE NOW HERO CAROUSEL */
  liveNowCard: {
    width: 320,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.md,
    padding: Spacing.xl,
  },
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CoachColors.dangerSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CoachColors.danger,
  },
  liveBadgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12,
    color: CoachColors.danger,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.accentSofter,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  viewerText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textSecondary,
  },
  liveContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  liveAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: CoachColors.accent,
  },
  liveTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    lineHeight: 26,
    marginBottom: 4,
  },
  liveCoachName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoachColors.accent,
    paddingVertical: 14,
    borderRadius: Radius.xs,
  },
  joinBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },

  /* UPCOMING STREAMS */
  upcomingCard: {
    width: 280,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.sm,
    padding: Spacing.lg,
  },
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  upcomingAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  upcomingTimeBox: {
    alignItems: 'flex-end',
  },
  upcomingTime: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
  },
  upcomingDate: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.accent,
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  upcomingInfo: {
    marginBottom: 20,
  },
  upcomingTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  upcomingTrainer: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
  },
  upcomingActions: {
    marginTop: 10,
  },
  remindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoachColors.accentSoft,
    paddingVertical: 12,
    borderRadius: Radius.xs,
  },
  remindBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    color: CoachColors.textPrimary,
    letterSpacing: 0.5,
  },

  /* ON DEMAND GRID */
  grid: {
    paddingHorizontal: Spacing.xl,
    gap: 16,
  },
  vodCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.xs,
    overflow: 'hidden',
  },
  vodThumb: {
    width: '100%',
    height: 200,
    backgroundColor: CoachColors.borderMuted,
  },
  placeholderThumb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vodCategoryBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
    backgroundColor: CoachColors.accent,
  },
  vodCategoryText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 9,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  vodDurationBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  vodDurationText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  vodInfo: {
    padding: Spacing.md,
  },
  vodAvatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vodAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  vodTextInfo: {
    flex: 1,
  },
  vodTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  vodTrainerName: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
  },
  emptyState: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
  },
  loadingContainer: {
    padding: Spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },
  noLiveState: {
    marginHorizontal: Spacing.xl,
    padding: Spacing.xl,
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  noLiveText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  noLiveSubtext: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    textAlign: 'center',
  }
});
