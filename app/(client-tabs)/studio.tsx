import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Bolt } from '../../components/mascot/Bolt';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

import { useGlobalStudio } from '../../hooks/useGlobalStudio';
import { FontFamily, Radius, Spacing } from '../../constants/theme';
import { getCategoryColor } from '../../data/categoryColors';

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
        if (c.status !== 'scheduled' && c.status !== 'starting') return false;
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
      trigger: { date: reminderDate },
    });

    Alert.alert('Reminder Set!', `We'll remind you 15 minutes before ${classItem.trainer?.name} goes live.`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>DISCOVER</Text>
          <Text style={styles.headerSubtitle}>Live & On-Demand Classes</Text>
        </View>
        <TouchableOpacity style={styles.searchBtn}>
          <Ionicons name="search" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 90, Spacing.xxl * 2) }]}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#FFFFFF" 
            colors={['#5B7FFF']} 
          />
        }
      >
        {loading && !refreshing && liveClasses.length === 0 && vodClasses.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>Loading studio...</Text>
          </View>
        ) : (
          <>
            {/* LIVE NOW ACROSS FITLINK */}
        {liveNow.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LIVE NOW</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
              {liveNow.map((item) => (
                <View key={item.id} style={styles.liveNowCard}>
                  <View style={styles.liveHeader}>
                    <View style={styles.liveBadgeRow}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                    <View style={styles.viewerBadge}>
                      <Ionicons name="eye" size={12} color="#FFFFFF" />
                      <Text style={styles.viewerText}>{item.viewer_count || 12} joining</Text>
                    </View>
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
                    <Text style={styles.joinBtnText}>JOIN BROADCAST</Text>
                    <Ionicons name="arrow-forward" size={16} color="#000000" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* UPCOMING DROPS */}
        {upcomingLive.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>UPCOMING STREAMS</Text>
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
                        {new Date(item.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
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
                      <Ionicons name="enter-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.remindBtnText}>ENTER WAITING ROOM</Text>
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
              <Ionicons name="radio-outline" size={32} color="rgba(255,255,255,0.2)" />
              <Text style={styles.noLiveText}>No broadcasts right now.</Text>
              <Text style={styles.noLiveSubtext}>Check back later or explore on-demand classes below.</Text>
            </View>
          </View>
        )}

        {/* TRENDING ON-DEMAND */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TRENDING CLASSES</Text>
          {vodClasses.length === 0 ? (
            <View style={styles.emptyState}>
              <Bolt pose="Analyze" size={80} />
              <Text style={styles.emptyText}>No classes available yet.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {vodClasses.map((item) => {
                const categoryColor = getCategoryColor(item.category);
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
                          <Ionicons name="play" size={24} color="rgba(255,255,255,0.2)" />
                        </View>
                      )}
                      <View style={[styles.vodCategoryBadge, { backgroundColor: categoryColor }]}>
                        <Text style={styles.vodCategoryText}>{item.category?.toUpperCase() || 'CLASS'}</Text>
                      </View>
                      <View style={styles.vodDurationBadge}>
                        <Text style={styles.vodDurationText}>{item.duration_minutes} MIN</Text>
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
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    letterSpacing: 1,
  },
  horizontalScroll: {
    paddingHorizontal: Spacing.xl,
    gap: 16,
  },
  
  /* LIVE NOW HERO CAROUSEL */
  liveNowCard: {
    width: 320,
    backgroundColor: '#EF4444', 
    borderRadius: Radius.md,
    padding: Spacing.xl,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  liveBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  viewerText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: '#FFFFFF',
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
    borderColor: '#FFFFFF',
  },
  liveTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    lineHeight: 26,
    marginBottom: 4,
  },
  liveCoachName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: Radius.xs,
  },
  joinBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#000000',
    letterSpacing: 1,
  },

  /* UPCOMING STREAMS */
  upcomingCard: {
    width: 280,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  upcomingDate: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFD700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  upcomingInfo: {
    marginBottom: 20,
  },
  upcomingTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 4,
  },
  upcomingTrainer: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  remindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1C1C1E',
    paddingVertical: 12,
    borderRadius: Radius.xs,
  },
  remindBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  /* ON DEMAND GRID */
  grid: {
    paddingHorizontal: Spacing.xl,
    gap: 16,
  },
  vodCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    overflow: 'hidden',
  },
  vodThumb: {
    width: '100%',
    height: 200,
    backgroundColor: '#1C1C1E',
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
  },
  vodCategoryText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: '#000000',
    letterSpacing: 0.5,
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 4,
  },
  vodTrainerName: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: '#9CA3AF',
  },
  emptyState: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  loadingContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  noLiveState: {
    marginHorizontal: Spacing.xl,
    padding: Spacing.xl,
    backgroundColor: '#0C0C0E',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  noLiveText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  noLiveSubtext: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  }
});
