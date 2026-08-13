import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';

interface TomorrowPreviewProps {
  tomorrowWorkout?: any;
}

export default function TomorrowPreview({ tomorrowWorkout }: TomorrowPreviewProps) {
  const router = useRouter();
  const title = tomorrowWorkout?.title || tomorrowWorkout?.name || 'Lower body strength & core';
  const duration = tomorrowWorkout?.duration || 45;

  return (
    <TouchableOpacity
      style={st.container}
      activeOpacity={0.85}
      onPress={() => {
        if (tomorrowWorkout?.id || tomorrowWorkout?.workout_id) {
          router.push({
            pathname: ClientRoute.strengthSession,
            params: { sessionId: tomorrowWorkout.workout_id || tomorrowWorkout.id }
          });
        } else {
          router.push({ pathname: ClientRoute.workouts, params: { view: 'workouts_list' } });
        }
      }}
    >
      <View style={st.leftCol}>
        <Text style={st.sectionTag}>Tomorrow's plan // preview</Text>
        <Text style={st.title} numberOfLines={1}>{title}</Text>
        <Text style={st.subtitle}>{duration} mins · prescribed program</Text>
      </View>

      <View style={st.actionBtn}>
        <Ionicons name="chevron-forward" size={16} color={CoachColors.textPrimary} />
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  leftCol: {
    flex: 1,
  },
  sectionTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
