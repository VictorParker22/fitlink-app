import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, StatusBar, Platform, LayoutAnimation, UIManager, Alert, ActivityIndicator
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../constants/theme';
import { CATEGORY_COLORS } from '../../data/categoryColors';
import { ClientRoute } from '../../types/routes';
import { supabase } from '../../lib/supabase';

import ExerciseThumbnail from '../../components/shared/exercise/ExerciseThumbnail';
import ExerciseMediaDemo from '../../components/shared/exercise/ExerciseMediaDemo';
import ExerciseInstructions from '../../components/shared/exercise/ExerciseInstructions';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_W = Dimensions.get('window').width;
const HERO_H = 300;

export default function StrengthSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId: string }>();
  
  const [isFavorite, setIsFavorite] = useState(false);
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSession() {
      if (!params.sessionId) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('workouts')
          .select('*, workout_exercises(*, exercises(*)), trainers(*)')
          .eq('id', params.sessionId)
          .single();
          
        if (error) throw error;
        setSession(data);
      } catch (err) {
        console.error('Error fetching session:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [params.sessionId]);

  const toggleExercise = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.selectionAsync();
    setExpandedExercises(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (!session) return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <TouchableOpacity onPress={() => router.push(ClientRoute.workouts)} style={{ paddingHorizontal: 16, paddingVertical: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 }}>
          <Ionicons name="fitness-outline" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={{ fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFFFFF', marginTop: 16 }}>Session Not Found</Text>
          <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>This session may no longer be available.</Text>
        </View>
      </SafeAreaView>
    </View>
  );

  const heroImage = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1470&auto=format&fit=crop';
  const instructorName = session.trainers?.name || 'Your Coach';
  const instructorAvatar = session.trainers?.avatar_url || 'https://i.pravatar.cc/150?u=coach';
  const tags = session.tags || ['Strength', 'Full Body'];
  const duration = `${Math.max(15, (session.workout_exercises?.length || 0) * 5)} min`;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        {/* Hero */}
        <View style={s.hero}>
          <Image source={{ uri: heroImage }} style={s.heroImage} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`${session.name} hero image`} />
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.85)', '#000']}
            locations={[0, 0.25, 0.75, 1]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={s.heroNav} edges={['top']}>
            <TouchableOpacity onPress={() => router.push(ClientRoute.workouts)} style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Go back to workouts">
              <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={s.navRight}>
              <TouchableOpacity 
                style={s.navBtn} 
                activeOpacity={0.6} 
                accessibilityRole="button" 
                accessibilityLabel="Share session"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Alert.alert('Share', `Share link for ${session.name} copied to clipboard!`);
                }}
              >
                <Ionicons name="share-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.navBtn} activeOpacity={0.6}
                onPress={() => { setIsFavorite(!isFavorite); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={22} color={isFavorite ? '#FFCA28' : '#FFFFFF'} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>

        <View style={s.body}>
          {/* Session label */}
          <Text style={s.sessionLabel}>SELF GUIDED SESSION</Text>

          {/* Title */}
          <Text style={s.title} accessibilityRole="header">{session.name || 'Workout'}</Text>

          {/* Instructor */}
          <View style={s.instructorRow}>
            <Image source={{ uri: instructorAvatar }} style={s.avatar} cachePolicy="memory-disk" transition={200} />
            <Text style={s.instructorName}>{instructorName}</Text>
          </View>

          {/* Tags */}
          <View style={s.tagsRow}>
            <Ionicons name="layers-outline" size={16} color="rgba(255,255,255,0.4)" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tagsScroll}>
              {tags.map((tag: string, i: number) => (
                <Text key={tag} style={s.tagText}>
                  <Text style={{ color: CATEGORY_COLORS[tag] || '#5B7FFF' }}>{tag}</Text>
                  {i < tags.length - 1 ? '  •  ' : ''}
                </Text>
              ))}
            </ScrollView>
          </View>

          {/* Duration */}
          <View style={s.durationRow}>
            <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.4)" />
            <Text style={s.durationText}>{duration}</Text>
          </View>

          {/* Action buttons */}
          <View style={s.actionRow}>
            <TouchableOpacity 
              style={s.actionBtn} 
              activeOpacity={0.85} 
              accessibilityRole="button" 
              accessibilityLabel="Start session"
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.push({
                  pathname: ClientRoute.workouts,
                  params: { startWorkoutId: session.id }
                });
              }}
            >
              <Text style={s.actionBtnText}>Start Session</Text>
            </TouchableOpacity>
          </View>

          {/* Description */}
          {session.description && <Text style={s.description}>{session.description}</Text>}

          {/* Session Breakdown */}
          <View style={s.divider} />
          <Text style={s.sectionTitle}>Session Breakdown</Text>

          <View style={s.exerciseList}>
            {(session.workout_exercises || []).map((we: any) => {
              const exOpen = expandedExercises[we.id] || false;
              const instructionText = we.notes || we.exercises?.instructions;
              
              return (
                <View key={we.id}>
                  <TouchableOpacity
                    style={s.exerciseRow}
                    activeOpacity={0.85}
                    onPress={() => toggleExercise(we.id)}
                    accessibilityRole="button"
                  >
                    <ExerciseThumbnail 
                      imageUrl={we.exercises?.image_url} 
                      hasVideo={!!we.video_url} 
                      size={48} 
                    />
                    
                    <View style={s.exerciseMeta}>
                      <Text style={s.exerciseName}>{we.exercises?.name || 'Exercise'}</Text>
                      <Text style={s.exerciseReps}>
                        {we.sets} SETS • {we.reps} REPS {we.rest_seconds > 0 ? `• ${we.rest_seconds}s REST` : ''}
                      </Text>
                    </View>
                    <Ionicons
                      name={exOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="rgba(255,255,255,0.3)"
                    />
                  </TouchableOpacity>

                  {/* Expanded view */}
                  {exOpen && (
                    <View style={s.exerciseExpanded}>
                      <ExerciseMediaDemo 
                        imageUrl={we.exercises?.image_url}
                        videoUrl={we.video_url}
                        exerciseName={we.exercises?.name}
                      />
                      <ExerciseInstructions 
                        exerciseId={we.id}
                        instructionText={instructionText}
                        muscleGroup={we.exercises?.muscle_group}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { flex: 1 },

  // Hero
  hero: { width: SCREEN_W, height: HERO_H, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroNav: {
    position: 'absolute', top: 0, left: 12, right: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navRight: { flexDirection: 'row', gap: 4 },

  // Body
  body: { paddingHorizontal: 20, paddingTop: 24 },

  sessionLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2, marginBottom: 10,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 32, color: '#FFFFFF',
    lineHeight: 38, marginBottom: 16,
  },

  // Instructor
  instructorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#222' },
  instructorName: { fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.7)' },

  // Tags
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tagsScroll: { flex: 1 },
  tagText: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.5)' },

  // Duration
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  durationText: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.6)' },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  actionBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 0,
  },
  actionBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: 15, color: '#FFFFFF' },

  // Description
  description: {
    fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.55)',
    lineHeight: 23, fontStyle: 'italic',
  },

  // Divider
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 28,
  },

  // Sections
  sectionTitle: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFFFFF', marginBottom: 16,
  },

  // Exercise list
  exerciseList: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8, marginTop: 8, paddingHorizontal: 4,
    overflow: 'hidden',
  },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  exerciseMeta: { flex: 1 },
  exerciseName: { fontFamily: FontFamily.headingSemiBold, fontSize: 14, color: '#FFFFFF' },
  exerciseReps: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, textTransform: 'uppercase' },

  // Expanded exercise
  exerciseExpanded: { paddingHorizontal: 8, paddingBottom: 16 },
});
