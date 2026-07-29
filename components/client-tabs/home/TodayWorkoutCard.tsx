import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FontFamily, FontSize } from '../../../constants/theme';
import { ClientRoute } from '../../../types/routes';

interface TodayWorkoutCardProps {
  workout?: any;
  trainerName?: string;
  isCompleted?: boolean;
  onSkip?: () => void;
}

export default function TodayWorkoutCard({ workout, trainerName = 'COACH', isCompleted, onSkip }: TodayWorkoutCardProps) {
  const router = useRouter();

  if (!workout) {
    return (
      <View style={st.emptyCard}>
        <View style={st.emptyIconBox}>
          <Ionicons name="sparkles-outline" size={24} color="#6C9BF2" />
        </View>
        <Text style={st.sectionTag}>REST & RECOVERY</Text>
        <Text style={st.emptyTitle}>NO ASSIGNED WORKOUT TODAY</Text>
        <Text style={st.emptySubtitle}>Take a recovery protocol day or explore self-guided routines in the library.</Text>
        <TouchableOpacity
          style={st.browseBtn}
          activeOpacity={0.8}
          onPress={() => router.push(ClientRoute.workouts as any)}
        >
          <Text style={st.browseBtnText}>EXPLORE CATALOG →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const workoutName = (workout.title || workout.name || 'Daily Prescription').toUpperCase();
  const exerciseCount = workout.exercises?.length || workout.exercise_count || 6;
  const durationMin = workout.estimated_duration_min || workout.duration || 45;
  const coachNote = workout.notes || workout.coach_note || `Target maximal motor unit recruitment today!`;

  if (isCompleted) {
    return (
      <View style={st.completedCard}>
        <View style={st.topTagRow}>
          <Text style={st.sectionTag}>PROGRAMMED PRESCRIPTION</Text>
          <View style={st.completedPill}>
            <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
            <Text style={st.completedPillText}>COMPLETED TODAY</Text>
          </View>
        </View>
        <Text style={st.workoutTitle}>{workoutName}</Text>
        <Text style={st.completedSub}>Session logged. Muscle recovery and adaptation protocol in progress.</Text>
      </View>
    );
  }

  const isTrack = workout.source === 'track';
  const tagColor = isTrack ? '#A855F7' : '#6C9BF2';

  return (
    <View style={[st.card, isTrack && { borderColor: 'rgba(168,85,247,0.3)' }]}>
      <View style={st.topTagRow}>
        <Text style={st.sectionTag}>
          {isTrack 
            ? `PASS TRACK // DAY ${workout.trackPosition + 1} OF ${workout.trackTotal}`
            : 'PROGRAMMED PRESCRIPTION'}
        </Text>
        <View style={st.badgeGroup}>
          <View style={[st.statBadge, isTrack && { borderColor: 'rgba(168,85,247,0.2)' }]}>
            <Text style={[st.statBadgeText, isTrack && { color: tagColor }]}>{durationMin} MINS</Text>
          </View>
          <View style={[st.statBadge, isTrack && { borderColor: 'rgba(168,85,247,0.2)' }]}>
            <Text style={[st.statBadgeText, isTrack && { color: tagColor }]}>{exerciseCount} EXERCISES</Text>
          </View>
        </View>
      </View>

      <Text style={st.workoutTitle} numberOfLines={2}>{workoutName}</Text>

      {/* Coach Prescription Speech Box */}
      {coachNote && (
        <View style={st.coachBox}>
          <Text style={st.coachBoxTag}>{trainerName.toUpperCase()}'S DIRECTIVE:</Text>
          <Text style={st.coachNoteText} numberOfLines={2}>
            "{coachNote}"
          </Text>
        </View>
      )}

      {/* Action Button */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {isTrack && onSkip && (
          <TouchableOpacity
            style={[st.startBtn, { flex: 0, paddingHorizontal: 16, backgroundColor: 'rgba(168,85,247,0.1)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' }]}
            activeOpacity={0.85}
            onPress={onSkip}
          >
            <Text style={[st.startBtnText, { color: '#A855F7' }]}>SKIP →</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[st.startBtn, { flex: 1, backgroundColor: isTrack ? '#A855F7' : '#FFFFFF' }]}
          activeOpacity={0.85}
          onPress={() => router.push(ClientRoute.workouts as any)}
        >
          <Text style={[st.startBtnText, { color: isTrack ? '#FFFFFF' : '#000000' }]}>START SESSION</Text>
          <Ionicons name="arrow-forward" size={18} color={isTrack ? '#FFFFFF' : '#000000'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    padding: 18,
  },
  topTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statBadge: {
    backgroundColor: '#16161A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  statBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#6C9BF2',
    letterSpacing: 1,
  },
  workoutTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 14,
    lineHeight: 28,
  },
  coachBox: {
    backgroundColor: '#141418',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#22222A',
    borderLeftWidth: 3,
    borderLeftColor: '#6C9BF2',
    marginBottom: 16,
  },
  coachBoxTag: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#6C9BF2',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  coachNoteText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 17,
  },
  startBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  startBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#000000',
    letterSpacing: 1.5,
  },
  completedCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    padding: 18,
  },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  completedPillText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#22C55E',
    letterSpacing: 1,
  },
  completedSub: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 16,
  },
  emptyCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    alignItems: 'center',
  },
  emptyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#121624',
    borderWidth: 1,
    borderColor: '#6C9BF2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 17,
  },
  browseBtn: {
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  browseBtnText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});
