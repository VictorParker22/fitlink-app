/**
 * WorkoutGridCard — 2-column library grid card for a workout.
 *
 * The workout's deterministic muscle-group emblem (utils/workoutEmblems.ts)
 * bleeds off the top-right corner; name + muscle summary + mono stats sit
 * bottom-left. Press edits, long-press (or the small trash) deletes — the
 * confirm dialog stays with the parent.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { getWorkoutEmblem } from '../../utils/workoutEmblems';

const titleCase = (s: string) =>
  s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface WorkoutGridCardProps {
  item: any; // Workout (AppContext) — id, name, workout_exercises
  onPress: () => void;
  onDelete: () => void;
}

export default function WorkoutGridCard({ item, onPress, onDelete }: WorkoutGridCardProps) {
  const exercises = item.workout_exercises || [];
  const exerciseCount = exercises.length;

  const muscleGroups = (exercises
    .map((we: any) => we.exercises?.muscle_group)
    .filter(Boolean)) as string[];
  const muscleSummary = muscleGroups.length > 0
    ? Array.from(new Set(muscleGroups.map((g) => titleCase(g.trim())))).slice(0, 3).join(' · ')
    : 'Full body';

  // Same estimate the workout builder shows (app/create-workout.tsx):
  // sets × (rest + ~40s of work) per exercise.
  const estMinutes = exerciseCount === 0 ? 0 : Math.max(1, Math.round(
    exercises.reduce((acc: number, e: any) => acc + (e.sets || 0) * ((e.rest_seconds || 0) + 40), 0) / 60
  ));
  const statLine = estMinutes > 0
    ? `${exerciseCount} ex · ~${estMinutes} min`
    : `${exerciseCount} ex`;

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.8}
      onPress={onPress}
      onLongPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. ${muscleSummary}. ${statLine}. Long press to delete.`}
    >
      <Image
        source={getWorkoutEmblem(item.id, item.name, muscleGroups)}
        style={s.emblem}
        contentFit="contain"
        recyclingKey={item.id}
        accessible={false}
      />
      <View style={s.bottom}>
        <Text style={s.name} numberOfLines={2} maxFontSizeMultiplier={1.4}>{item.name}</Text>
        <Text style={s.muscles} numberOfLines={1} maxFontSizeMultiplier={1.4}>{muscleSummary}</Text>
        <View style={s.statRow}>
          <Text style={s.stats} numberOfLines={1} maxFontSizeMultiplier={1.2}>{statLine}</Text>
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.name}`}
          >
            <Ionicons name="trash-outline" size={15} color={CoachColors.textFaint} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 168,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 14,
    justifyContent: 'flex-end',
  },
  emblem: {
    position: 'absolute',
    top: -22,
    right: -22,
    width: 108,
    height: 108,
    opacity: 0.9,
  },
  bottom: {
    gap: 3,
  },
  name: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    lineHeight: 21,
  },
  muscles: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  stats: {
    fontFamily: CoachFonts.mono,
    fontSize: 11,
    color: CoachColors.textFaint,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
});
