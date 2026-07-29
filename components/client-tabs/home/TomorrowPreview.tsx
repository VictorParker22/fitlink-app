import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FontFamily } from '../../../constants/theme';
import { ClientRoute } from '../../../types/routes';

interface TomorrowPreviewProps {
  tomorrowWorkout?: any;
}

export default function TomorrowPreview({ tomorrowWorkout }: TomorrowPreviewProps) {
  const router = useRouter();
  const title = (tomorrowWorkout?.title || tomorrowWorkout?.name || 'Lower Body Strength & Core').toUpperCase();
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
        <Text style={st.sectionTag}>TOMORROW'S PLAN // PREVIEW</Text>
        <Text style={st.title} numberOfLines={1}>{title}</Text>
        <Text style={st.subtitle}>{duration} MINS • PRESCRIBED PROGRAM</Text>
      </View>

      <View style={st.actionBtn}>
        <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
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
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  leftCol: {
    flex: 1,
  },
  sectionTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#6C9BF2',
    letterSpacing: 1,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
