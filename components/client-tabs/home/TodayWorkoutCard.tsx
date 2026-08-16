import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
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
        <Text style={st.sectionTag}>Today</Text>
        <Text style={st.emptyHero}>Rest day.</Text>
        <Text style={st.emptyContext}>No prescription. Move if you want — or don't.</Text>
        <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
          style={st.browseBtn}
          activeOpacity={0.85}
          onPress={() => router.push(ClientRoute.workouts as any)}
        >
          <Text style={st.browseBtnText}>Explore catalog</Text>
          <Ionicons name="arrow-forward" size={14} color={CoachColors.onAccent} />
        </TouchableOpacity>
        {/* §11 Accent line */}
        <View style={[st.accentLine, { backgroundColor: CoachColors.borderMuted }]} />
      </View>
    );
  }

  const workoutName = workout.title || workout.name || 'Push power';
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
          <Text style={st.sectionTag}>Today</Text>
          <View style={st.completedPill}>
            <Ionicons name="checkmark-circle" size={12} color={CoachColors.accent} />
            <Text style={st.completedPillText}>Done</Text>
          </View>
        </View>
        {/* §1 Workout name = hero at 28px */}
        <Text style={st.workoutTitle}>{workoutName}</Text>
        <Text style={st.completedSub}>Logged. Recovery protocol in progress.</Text>
        <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
          style={st.logSessionBtn}
          activeOpacity={0.8}
          onPress={() => router.push(ClientRoute.myProgress as any)}
        >
          <Ionicons name="create-outline" size={14} color={CoachColors.textSecondary} />
          <Text style={st.logSessionBtnText}>Rate your session</Text>
        </TouchableOpacity>
        {/* §11 Accent line = done state */}
        <View style={[st.accentLine, { backgroundColor: CoachColors.accent }]} />
      </View>
    );
  }

  const isTrack = workout.source === 'track';

  return (
    <View style={[st.card, isTrack && { borderColor: 'rgba(198,242,78,0.3)' }]}>
      <View style={st.topTagRow}>
        <Text style={st.sectionTag}>
          {isTrack
            ? `Pass track · day ${workout.trackPosition + 1} of ${workout.trackTotal}`
            : "Today's plan"}
        </Text>
      </View>

      <Text style={st.workoutTitle} numberOfLines={2}>{workoutName}</Text>
      <Text style={st.workoutSubtitle}>{durationMin} min</Text>

      {/* Action Button */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {isTrack && onSkip && (
          <TouchableOpacity
            style={[st.startBtn, { flex: 0, paddingHorizontal: 16, backgroundColor: CoachColors.accentSofter, borderWidth: 1, borderColor: 'rgba(198,242,78,0.3)' }]}
            activeOpacity={0.85}
            onPress={onSkip}
          >
            <Text style={[st.startBtnText, { color: CoachColors.accent }]}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            st.startBtn,
            { flex: 1, backgroundColor: CoachColors.accent },
            !isTrack && {
              paddingVertical: 16,
              // shadow* is iOS only — without elevation the primary CTA sits
              // completely flat on Android.
              shadowColor: CoachColors.accent,
              shadowOpacity: 0.3,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 12,
              elevation: 6,
            }
          ]}
          activeOpacity={0.85}
          onPress={() => router.push(ClientRoute.workouts as any)}
        >
          <Text style={[st.startBtnText, { color: CoachColors.onAccent }]}>
            Start workout
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
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
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
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11, // raised from 9pt — track position ("day 3 of 10") is unique info
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  workoutTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,        // Up from 22px — this is what they came to see
    color: CoachColors.textPrimary,
    letterSpacing: -0.8, // Tight tracking = premium
    marginBottom: 4,
    lineHeight: 32,
  },
  workoutSubtitle: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    color: CoachColors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 20,
  },

  startBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  startBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.onAccent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  completedCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.3)',
    padding: 18,
  },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.3)',
  },
  completedPillText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  completedSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
    lineHeight: 16,
  },
  logSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: CoachColors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignSelf: 'flex-start',
  },
  logSessionBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.textSecondary,
  },
  // §2 Empty card: card surface, left-aligned editorial (not centred — centred = generic)
  emptyCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    padding: 20,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    overflow: 'hidden',
  },
  // §1 Empty hero: 32px direct statement — "Rest day." not "NO ASSIGNED WORKOUT TODAY"
  emptyHero: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -0.8,
    marginTop: 6,
    marginBottom: 6,
    lineHeight: 36,
  },
  emptyContext: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13,
    color: CoachColors.textMuted,
    lineHeight: 18,
    marginBottom: 18,
  },
  // §14 Browse btn: min 44pt height, accent bg for contrast
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  browseBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.onAccent,
    letterSpacing: 0.3,
  },
});
