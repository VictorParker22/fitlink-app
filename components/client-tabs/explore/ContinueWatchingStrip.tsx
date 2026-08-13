import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useWorkout } from '../../../context/WorkoutContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';

export function ContinueWatchingStrip() {
  const router = useRouter();
  const { workoutHistory } = useWorkout();

  // Deduplicate and separate into in-progress and completed
  const inProgressMap = new Map();
  const completedMap = new Map();

  workoutHistory.forEach(entry => {
    if (entry.completed) {
      if (!completedMap.has(entry.classId)) completedMap.set(entry.classId, entry);
    } else {
      if (!inProgressMap.has(entry.classId)) inProgressMap.set(entry.classId, entry);
    }
  });

  const inProgress = Array.from(inProgressMap.values()).slice(0, 5);
  const completed = Array.from(completedMap.values()).slice(0, 5);

  const combined = [...inProgress, ...completed].slice(0, 5);

  if (combined.length === 0) return null;

  const renderItem = ({ item }: { item: any }) => {
    const isCompleted = item.completed;
    const progressPercent = item.targetDurationSec > 0
      ? Math.min(100, (item.durationSec / item.targetDurationSec) * 100)
      : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: ClientRoute.classDetail, params: { id: item.classId, title: item.classTitle, category: item.category, thumbnail: item.thumbnail } } as any);
        }}
      >
        <View style={styles.topLine} />
        <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
        <View style={styles.overlay}>
          <Text style={styles.title} numberOfLines={2}>{item.classTitle}</Text>

          {isCompleted ? (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={CoachColors.accent} />
            </View>
          ) : (
            <View style={styles.progressContainer}>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
              <Ionicons name="play-circle" size={24} color={CoachColors.textPrimary} style={styles.playIcon} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tag}>Resume // your classes</Text>
        <Text style={styles.sectionTitle}>Continue watching</Text>
      </View>
      <FlatList
        data={combined}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 2,
    color: CoachColors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 200,
    height: 130,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 12,
    overflow: 'hidden',
  },
  topLine: {
    height: 4,
    width: '100%',
    zIndex: 2,
    backgroundColor: CoachColors.accent,
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  overlay: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBg: {
    flex: 1,
    height: 3,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: CoachColors.accent,
  },
  playIcon: {
    opacity: 0.8,
  },
  completedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 2,
  },
});
