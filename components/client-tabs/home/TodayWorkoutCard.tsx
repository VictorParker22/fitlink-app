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
      // §8 Empty state: direct, opinionated copy. §16 Always include CTA.
      <View style={st.emptyCard}>
        {/* §1 Editorial hierarchy: micro → hero → context → CTA */}
        <Text style={st.sectionTag}>TODAY</Text>
        <Text style={st.emptyHero}>Rest day.</Text>
        <Text style={st.emptyContext}>No prescription. Move if you want — or don't.</Text>
        <TouchableOpacity
          style={st.browseBtn}
          activeOpacity={0.85}
          onPress={() => router.push(ClientRoute.workouts as any)}
        >
          <Text style={st.browseBtnText}>Explore Catalog</Text>
          <Ionicons name="arrow-forward" size={14} color="#000" />
        </TouchableOpacity>
        {/* §11 Accent line */}
        <View style={[st.accentLine, { backgroundColor: '#1C1C1E' }]} />
      </View>
    );
  }

  const workoutName = (workout.title || workout.name || 'PUSH POWER').toUpperCase();
  const exerciseCount = workout.exercises?.length || workout.exercise_count || 6;
  const durationMin = workout.estimated_duration_min || workout.duration || 48;
  const coachNote = workout.notes || workout.coach_note || `Target maximal motor unit recruitment today!`;

  const mockExercises = [
    { id: 1, name: 'BARBELL BENCH PRESS', details: '4 x 6 • RPE 8', done: true, weight: '62.5 kg' },
    { id: 2, name: 'INCLINE DUMBBELL PRESS', details: '3 x 8-10', done: false, weight: '24 kg' },
    { id: 3, name: 'CABLE FLYES', details: '3 x 12-15', done: false, weight: '15 kg' },
  ];
  const exercisesToRender = workout.exercises?.length ? workout.exercises.slice(0, 4) : mockExercises;

  if (isCompleted) {
    return (
      <View style={st.completedCard}>
        <View style={st.topTagRow}>
          <Text style={st.sectionTag}>TODAY</Text>
          <View style={st.completedPill}>
            <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
            <Text style={st.completedPillText}>DONE</Text>
          </View>
        </View>
        {/* §1 Workout name = hero at 28px */}
        <Text style={st.workoutTitle}>{workoutName}</Text>
        <Text style={st.completedSub}>Logged. Recovery protocol in progress.</Text>
        <TouchableOpacity
          style={st.logSessionBtn}
          activeOpacity={0.8}
          onPress={() => router.push(ClientRoute.myProgress as any)}
        >
          <Ionicons name="create-outline" size={14} color="rgba(255,255,255,0.6)" />
          <Text style={st.logSessionBtnText}>Rate your session</Text>
        </TouchableOpacity>
        {/* §11 Green accent line = done state */}
        <View style={[st.accentLine, { backgroundColor: '#22C55E' }]} />
      </View>
    );
  }

  const isTrack = workout.source === 'track';

  return (
    <View style={[st.card, isTrack && { borderColor: 'rgba(168,85,247,0.3)' }]}>
      <View style={st.topTagRow}>
        <Text style={st.sectionTag}>
          {isTrack 
            ? `PASS TRACK • DAY ${workout.trackPosition + 1} OF ${workout.trackTotal}`
            : "TODAY'S PLAN"}
        </Text>
      </View>

      <Text style={st.workoutTitle} numberOfLines={2}>{workoutName}</Text>
      <Text style={st.workoutSubtitle}>{durationMin} MIN • 400 KCAL</Text>

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
          style={[
            st.startBtn,
            { flex: 1, backgroundColor: isTrack ? '#A855F7' : '#D9F95C' },
            !isTrack && {
              paddingVertical: 16,
              shadowColor: '#D9F95C',
              shadowOpacity: 0.3,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
            }
          ]}
          activeOpacity={0.85}
          onPress={() => router.push(ClientRoute.workouts as any)}
        >
          <Text style={[st.startBtnText, { color: '#000000' }]}>
            START WORKOUT
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  // §11 Accent line — shared across states
  accentLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    padding: 18,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  topTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11, // raised from 9pt — track position ("DAY 3 OF 10") is unique info
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
  statBadgePrimary: {
    backgroundColor: 'rgba(217, 249, 92, 0.1)',
    borderColor: 'rgba(217, 249, 92, 0.3)',
  },
  statBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11, // raised from 9pt — HIG minimum ("45 MINS / 6 EXERCISES" = sole info carrier)
    color: '#6C9BF2',
    letterSpacing: 1,
  },
  statBadgeTextPrimary: {
    color: '#D9F95C',
  },
  workoutTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,        // Up from 22px — this is what they came to see
    color: '#FFFFFF',
    letterSpacing: -0.8, // Tight tracking = premium
    marginBottom: 4,
    lineHeight: 32,
  },
  workoutSubtitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 20,
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
  logSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'flex-start',
  },
  logSessionBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  // §2 Empty card: Layer 1 surface, left-aligned editorial (not centred — centred = generic)
  emptyCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 20,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    overflow: 'hidden',
  },
  // §1 Empty hero: 32px direct statement — "Rest day." not "NO ASSIGNED WORKOUT TODAY"
  emptyHero: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginTop: 6,
    marginBottom: 6,
    lineHeight: 36,
  },
  emptyContext: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 18,
    marginBottom: 18,
  },
  // §14 Browse btn: min 44pt height, white bg for contrast
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  browseBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
    letterSpacing: 0.3,
  },
});
