import { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Alert, Modal, ActivityIndicator, useWindowDimensions, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import RenderHtml from 'react-native-render-html';
import { useLocalSearchParams } from 'expo-router';

import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { Spacing, FontFamily, Radius } from '../constants/theme';
import { useAlert } from '../context/AlertContext';
import { getWorkoutEmblem, getWorkoutEmblemGlow, EMBLEM_IMAGES } from '../utils/workoutEmblems';
import { proxyGifUrl, proxyGifStill } from '../lib/exercisedb';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Audio } from 'expo-av';

interface SelectedExercise {
  exercise_id: string;
  name: string;
  muscle_group: string;
  instructions?: string;
  sets: number;
  reps: number;
  rest_seconds: number;
  video_url?: string;
  image_url?: string;
  notes?: string;
  group_id?: string;
  group_type?: string;
}

const stripHtml = (html?: string) => {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
};

export default function CreateWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const editId = params.editId as string | undefined;
  
  const insets = useSafeAreaInsets();
  const { exercises, workouts, createWorkout, updateWorkout, importExercise, autoAddExerciseId, setAutoAddExerciseId } = useApp();
  const { showAlert } = useAlert();
  const { width } = useWindowDimensions();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  
  // Picker state
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>('chest');
  const [failedGifs, setFailedGifs] = useState<Set<string>>(new Set());

  // Body part -> category mapping for filtering
  const bodyPartCategoryMap: Record<string, string[]> = {
    'chest': ['chest'],
    'back': ['back'],
    'upper legs': ['legs'],
    'shoulders': ['shoulders'],
    'upper arms': ['arms'],
    'waist': ['core'],
    'lower arms': ['arms'],
    'lower legs': ['legs'],
    'cardio': ['cardio'],
    'neck': ['shoulders'],
  };

  // ── WIZARD STATE ──
  const [wizardStep, setWizardStep] = useState<number>(editId ? -1 : 1);
  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);

  // ── AI GENERATE STATE ──
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      // Send condensed exercise list so AI picks from real DB entries
      const condensedExercises = exercises.slice(0, 200).map(e => ({
        name: e.name, muscle_group: e.muscle_group, equipment: e.equipment || 'bodyweight',
      }));

      const { data, error } = await supabase.functions.invoke('generate-workout', {
        body: { prompt: aiPrompt.trim(), availableExercises: condensedExercises }
      });

      if (error) throw new Error(error.message || 'Failed to generate workout');
      if (!data) throw new Error('No response from AI');

      // Apply the generated workout
      if (data.name) setName(data.name);
      if (data.description) setDescription(data.description);

      // Map body parts
      if (data.bodyParts && Array.isArray(data.bodyParts)) {
        setSelectedFocus(data.bodyParts.filter((bp: string) =>
          ['chest', 'back', 'legs', 'arms', 'shoulders', 'core', 'cardio', 'fullbody'].includes(bp)
        ));
      }

      // Map equipment
      if (data.equipment && Array.isArray(data.equipment)) {
        setSelectedEquipment(data.equipment.filter((eq: string) =>
          ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'bands', 'kettlebell'].includes(eq)
        ));
      }

      // Match exercises to database entries by name similarity
      if (data.exercises && Array.isArray(data.exercises)) {
        const matched: SelectedExercise[] = [];
        for (const aiEx of data.exercises) {
          const exName = (aiEx.exercise_name || '').toLowerCase();
          // Find exact or closest match
          let match = exercises.find(e => e.name.toLowerCase() === exName);
          if (!match) {
            match = exercises.find(e => e.name.toLowerCase().includes(exName) || exName.includes(e.name.toLowerCase()));
          }
          if (match && !matched.find(m => m.exercise_id === match!.id)) {
            matched.push({
              exercise_id: match.id,
              name: match.name,
              muscle_group: match.muscle_group,
              instructions: match.instructions,
              image_url: match.image_url,
              sets: aiEx.sets || 3,
              reps: aiEx.reps || 10,
              rest_seconds: aiEx.rest_seconds || 60,
              notes: stripHtml(match.instructions),
            });
          }
        }
        if (matched.length > 0) setSelectedExercises(matched);
      }

      setShowAiSheet(false);
      setAiPrompt('');
      setWizardStep(-1); // Skip to builder
      showAlert({ type: 'success', title: '✨ Workout Generated!', message: `"${data.name}" with ${data.exercises?.length || 0} exercises` });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'AI Error', message: err.message || 'Failed to generate workout' });
    } finally {
      setAiLoading(false);
    }
  };

  const BODY_FOCUS = [
    { key: 'chest', label: 'Chest', emblem: EMBLEM_IMAGES.chest, glow: '#EF4444', filter: 'chest' },
    { key: 'back', label: 'Back', emblem: EMBLEM_IMAGES.back, glow: '#06B6D4', filter: 'back' },
    { key: 'legs', label: 'Legs', emblem: EMBLEM_IMAGES.legs, glow: '#A855F7', filter: 'upper legs' },
    { key: 'arms', label: 'Arms', emblem: EMBLEM_IMAGES.arms, glow: '#3B82F6', filter: 'upper arms' },
    { key: 'shoulders', label: 'Shoulders', emblem: EMBLEM_IMAGES.shoulders, glow: '#F59E0B', filter: 'shoulders' },
    { key: 'core', label: 'Core', emblem: EMBLEM_IMAGES.core, glow: '#22C55E', filter: 'waist' },
    { key: 'cardio', label: 'Cardio', emblem: EMBLEM_IMAGES.cardio, glow: '#EC4899', filter: 'cardio' },
    { key: 'fullbody', label: 'Full Body', emblem: EMBLEM_IMAGES.fullbody, glow: '#94A3B8', filter: null },
  ] as const;

  const EQUIPMENT_TAGS = [
    { key: 'barbell', label: 'Barbell', icon: 'barbell' as const },
    { key: 'dumbbell', label: 'Dumbbell', icon: 'fitness' as const },
    { key: 'cable', label: 'Cable', icon: 'git-pull-request' as const },
    { key: 'machine', label: 'Machine', icon: 'cog' as const },
    { key: 'bodyweight', label: 'Bodyweight', icon: 'body' as const },
    { key: 'bands', label: 'Bands', icon: 'link' as const },
    { key: 'kettlebell', label: 'Kettlebell', icon: 'ellipse' as const },
  ];

  const NAME_TEMPLATES: Record<string, string[]> = {
    'chest': ['Chest Crusher', 'Push Day Power', 'Pec Blaster', 'Chest Pump'],
    'back': ['Pull Day Fury', 'Back Builder', 'Lat Attack', 'Row Rampage'],
    'legs': ['Leg Day Destroyer', 'Lower Body Blitz', 'Squat Storm', 'Quad Quake'],
    'arms': ['Arm Assault', 'Gun Show', 'Bicep & Tricep Blast', 'Arm Day Finisher'],
    'shoulders': ['Boulder Shoulders', 'Delt Domination', 'Shoulder Sculptor', 'Press Protocol'],
    'core': ['Core Crusher', 'Ab Inferno', 'Midline Mayhem', 'Core Strength Circuit'],
    'cardio': ['Cardio Blitz', 'HIIT Fury', 'Endurance Engine', 'Heart Rate Spike'],
    'fullbody': ['Total Body Burn', 'Full Body Fury', 'Compound Crusher', 'Functional Fitness'],
    'chest,back': ['Push-Pull Power', 'Upper Body Domination'],
    'chest,shoulders': ['Press Day Protocol', 'Chest & Shoulders Blast'],
    'chest,arms': ['Chest & Arms Pump', 'Upper Push Finisher'],
    'back,arms': ['Pull & Curl Power', 'Back & Biceps Day'],
    'legs,core': ['Legs & Core Circuit', 'Lower Body & Abs'],
  };

  const suggestedNames = useMemo(() => {
    if (selectedFocus.length === 0) return [];
    const key = selectedFocus.slice(0, 2).sort().join(',');
    const singleKey = selectedFocus[0];
    const combos = NAME_TEMPLATES[key] || [];
    const singles = NAME_TEMPLATES[singleKey] || [];
    const all = [...new Set([...combos, ...singles])];
    return all.slice(0, 5);
  }, [selectedFocus]);

  const primaryEmblem = useMemo(() => {
    if (selectedFocus.length === 0) return null;
    const focus = BODY_FOCUS.find(b => b.key === selectedFocus[0]);
    return focus || null;
  }, [selectedFocus]);

  const suggestedExercises = useMemo(() => {
    if (selectedFocus.length === 0) return [];
    const focusFilters = selectedFocus
      .map(f => BODY_FOCUS.find(b => b.key === f)?.filter)
      .filter(Boolean) as string[];
    // If only "Full Body" was selected (filter is null), show all exercises
    if (focusFilters.length === 0) {
      const withImg = exercises.filter(e => e.image_url);
      const withoutImg = exercises.filter(e => !e.image_url);
      let all = [...withImg, ...withoutImg];
      if (selectedEquipment.length > 0) {
        all = all.filter(e => {
          const eq = (e.equipment || 'bodyweight').toLowerCase();
          return selectedEquipment.some(sel => eq.includes(sel));
        });
      }
      return all.slice(0, 8);
    }
    const categories = focusFilters.flatMap(f => (bodyPartCategoryMap as Record<string, string[]>)[f] || []);
    let filtered = exercises.filter(e => categories.includes(e.category?.toLowerCase()));
    if (selectedEquipment.length > 0) {
      filtered = filtered.filter(e => {
        const eq = (e.equipment || 'bodyweight').toLowerCase();
        return selectedEquipment.some(sel => eq.includes(sel));
      });
    }
    // Prioritize exercises with images, limit to 8
    const withImg = filtered.filter(e => e.image_url);
    const withoutImg = filtered.filter(e => !e.image_url);
    return [...withImg, ...withoutImg].slice(0, 8);
  }, [selectedFocus, selectedEquipment, exercises]);

  const toggleFocus = (key: string) => {
    setSelectedFocus(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleEquipment = (key: string) => {
    setSelectedEquipment(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleWizardComplete = () => {
    // Pre-fill the body part filter for the picker
    if (selectedFocus.length > 0) {
      const firstFocus = BODY_FOCUS.find(b => b.key === selectedFocus[0]);
      if (firstFocus?.filter) setSelectedBodyPart(firstFocus.filter);
    }
    // Auto-fill description from equipment
    if (selectedEquipment.length > 0 && !description) {
      setDescription(selectedEquipment.map(e => e.charAt(0).toUpperCase() + e.slice(1)).join(', '));
    }
    setWizardStep(-1);
  };

  const quickAddExercise = (exercise: typeof exercises[0]) => {
    if (selectedExercises.find(e => e.exercise_id === exercise.id)) return;
    setSelectedExercises(prev => [...prev, {
      exercise_id: exercise.id,
      name: exercise.name,
      muscle_group: exercise.muscle_group,
      instructions: exercise.instructions,
      sets: 3,
      reps: 10,
      rest_seconds: 60,
      image_url: exercise.image_url,
      notes: stripHtml(exercise.instructions),
    }]);
  };


  // Filter exercises from Supabase (already loaded via AppContext)
  const filteredPickerExercises = useMemo(() => {
    let filtered = exercises;

    // Filter by body part/category
    if (selectedBodyPart) {
      const categories = bodyPartCategoryMap[selectedBodyPart] || [selectedBodyPart];
      filtered = filtered.filter(e => categories.includes(e.category?.toLowerCase()));
    }

    // Filter by search
    if (exerciseSearch.trim()) {
      const q = exerciseSearch.toLowerCase();
      filtered = filtered.filter(e =>
        e.name?.toLowerCase().includes(q) ||
        e.muscle_group?.toLowerCase().includes(q) ||
        e.equipment?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [exercises, selectedBodyPart, exerciseSearch]);
  const [saving, setSaving] = useState(false);
  const [videoModalExercise, setVideoModalExercise] = useState<string | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [speakingExerciseId, setSpeakingExerciseId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [showNotesExerciseId, setShowNotesExerciseId] = useState<string | null>(null);
  const [soundRef, setSoundRef] = useState<Audio.Sound | null>(null);

  const handleSpeak = useCallback(async (exerciseId: string, text?: string) => {
    // If already playing this exercise, stop it
    if (speakingExerciseId === exerciseId) {
      if (soundRef) {
        await soundRef.stopAsync();
        await soundRef.unloadAsync();
        setSoundRef(null);
      }
      setSpeakingExerciseId(null);
      return;
    }

    const plainText = stripHtml(text);
    if (!plainText) {
      showAlert({ type: 'info', title: 'No Instructions', message: 'This exercise has no instructions to read aloud yet.' });
      return;
    }

    // Stop any currently playing audio
    if (soundRef) {
      await soundRef.stopAsync();
      await soundRef.unloadAsync();
      setSoundRef(null);
    }

    try {
      setLoadingAudioId(exerciseId);

      // Call edge function to generate/get cached audio
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { exercise_id: exerciseId, text: plainText }
      });

      if (error || !data?.audio_url) {
        throw new Error(error?.message || 'Failed to generate audio');
      }

      // Play the audio
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: data.audio_url },
        { shouldPlay: true }
      );
      setSoundRef(sound);
      setSpeakingExerciseId(exerciseId);

      // Listen for playback completion
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setSpeakingExerciseId(null);
          sound.unloadAsync();
          setSoundRef(null);
        }
      });
    } catch (err: any) {
      console.error('TTS error:', err);
      showAlert({ type: 'error', title: 'Voice Error', message: String(err?.message || 'Could not generate voice audio') });
      setSpeakingExerciseId(null);
    } finally {
      setLoadingAudioId(null);
    }
  }, [speakingExerciseId, soundRef]);

  useEffect(() => {
    if (editId && workouts.length > 0) {
      const existing = workouts.find(w => w.id === editId);
      if (existing) {
        setName(existing.name);
        setDescription(existing.description || '');
        if (existing.workout_exercises) {
          const mapped: SelectedExercise[] = existing.workout_exercises
            .sort((a, b) => a.order_index - b.order_index)
            .map(we => {
              const baseEx = exercises.find(e => e.id === we.exercise_id) || we.exercises;
              return {
                exercise_id: we.exercise_id,
                name: baseEx?.name || 'Unknown Exercise',
                muscle_group: baseEx?.muscle_group || '',
                instructions: baseEx?.instructions,
                image_url: baseEx?.image_url,
                sets: we.sets,
                reps: we.reps,
                rest_seconds: we.rest_seconds,
                video_url: we.video_url,
                notes: we.notes || stripHtml(baseEx?.instructions),
                group_id: we.group_id,
                group_type: we.group_type,
              };
            });
          setSelectedExercises(mapped);
        }
      }
    }
  }, [editId, workouts]);


  // Auto-add newly created custom exercises
  useEffect(() => {
    if (autoAddExerciseId && exercises.length > 0) {
      const match = exercises.find(e => e.id === autoAddExerciseId);
      if (match) {
        addExercise(match);
        showAlert({
          type: 'success',
          title: 'Added!',
          message: `"${match.name}" was added to your workout.`
        });
      }
      setAutoAddExerciseId(null);
    }
  }, [autoAddExerciseId, exercises]);

  const addExercise = (exercise: typeof exercises[0]) => {
    if (selectedExercises.find((e) => e.exercise_id === exercise.id)) return;
    setSelectedExercises((prev) => [...prev, {
      exercise_id: exercise.id,
      name: exercise.name,
      muscle_group: exercise.muscle_group,
      instructions: exercise.instructions,
      sets: 3,
      reps: 10,
      rest_seconds: 60,
      image_url: exercise.image_url,
      notes: stripHtml(exercise.instructions),
    }]);
    setShowPicker(false);
    setExerciseSearch('');
    setExpandedExerciseId(exercise.id);
  };



  const removeExercise = (id: string) => {
    Alert.alert('Remove Exercise', 'Are you sure you want to remove this exercise?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        setSelectedExercises((prev) => prev.filter((e) => e.exercise_id !== id));
        if (expandedExerciseId === id) setExpandedExerciseId(null);
      }},
    ]);
  };

  const updateExercise = (id: string, field: string, value: number | string | null) => {
    setSelectedExercises((prev) =>
      prev.map((e) => e.exercise_id === id ? { ...e, [field]: value } : e)
    );
  };

  const setVideoUrl = (exerciseId: string, url: string) => {
    setSelectedExercises((prev) =>
      prev.map((e) => e.exercise_id === exerciseId ? { ...e, video_url: url } : e)
    );
  };

  const handlePasteVideoUrl = () => {
    if (!videoModalExercise || !videoUrlInput.trim()) return;
    setVideoUrl(videoModalExercise, videoUrlInput.trim());
    setVideoModalExercise(null);
    setVideoUrlInput('');
  };

  const uploadVideoFile = async (asset: ImagePicker.ImagePickerAsset) => {
    const ext = asset.uri.split('.').pop() || 'mp4';
    const fileName = `exercise-${videoModalExercise}-${Date.now()}.${ext}`;
    const mimeType = asset.mimeType || 'video/mp4';

    const response = await fetch(asset.uri);
    const blob = await response.blob();

    const formData = new FormData();
    formData.append('', {
      uri: asset.uri,
      name: fileName,
      type: mimeType,
    } as any);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const uploadRes = await fetch(
      `${(supabase as any).supabaseUrl}/storage/v1/object/exercise-videos/${fileName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'x-upsert': 'true',
        },
        body: formData,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      throw new Error(err.message || 'Upload failed');
    }

    const { data: urlData } = supabase.storage.from('exercise-videos').getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const handlePickVideo = async () => {
    if (!videoModalExercise) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.7,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingVideo(true);
    try {
      const publicUrl = await uploadVideoFile(result.assets[0]);
      setVideoUrl(videoModalExercise, publicUrl);
      setVideoModalExercise(null);
      setVideoUrlInput('');
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Upload Failed', message: err.message || 'Failed to upload video' });
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleRecordVideo = async () => {
    if (!videoModalExercise) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert({ type: 'warning', title: 'Permission Needed', message: 'Camera access is required to record videos' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      quality: 0.7,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingVideo(true);
    try {
      const publicUrl = await uploadVideoFile(result.assets[0]);
      setVideoUrl(videoModalExercise, publicUrl);
      setVideoModalExercise(null);
      setVideoUrlInput('');
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Upload Failed', message: err.message || 'Failed to upload video' });
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert({ type: 'warning', title: 'Missing Name', message: 'Please enter a name for the workout.' });
      return;
    }
    if (selectedExercises.length === 0) {
      showAlert({ type: 'warning', title: 'No Exercises', message: 'Please add at least one exercise to the workout.' });
      return;
    }

    setSaving(true);
    try {
      const exercisePayload = selectedExercises.map(e => ({
        exercise_id: e.exercise_id,
        sets: e.sets,
        reps: e.reps,
        rest_seconds: e.rest_seconds,
        ...(e.video_url ? { video_url: e.video_url } : {}),
        ...(e.notes ? { notes: e.notes } : {}),
        ...(e.group_id ? { group_id: e.group_id } : {}),
        ...(e.group_type ? { group_type: e.group_type } : {}),
      }));
      if (editId) {
        await updateWorkout(editId, name.trim(), description.trim(), exercisePayload);
      } else {
        await createWorkout(name.trim(), description.trim(), exercisePayload);
      }
      router.back();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Save Failed', message: err.message || 'Failed to save workout' });
    } finally {
      setSaving(false);
    }
  };

  // Exercise picker modal
  if (showPicker) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => { setShowPicker(false); setExerciseSearch(''); }}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Global Database</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.6)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={exerciseSearch}
              onChangeText={setExerciseSearch}
              selectionColor="#FFFFFF"
            />
            {exerciseSearch.length > 0 && (
              <TouchableOpacity onPress={() => setExerciseSearch('')}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>

          {/* Body Part Filter Chips */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingVertical: 8, alignItems: 'center' }}
          >
            {[
              { key: null, label: 'All' },
              { key: 'chest', label: 'Chest' },
              { key: 'back', label: 'Back' },
              { key: 'upper legs', label: 'Legs' },
              { key: 'shoulders', label: 'Shoulders' },
              { key: 'upper arms', label: 'Arms' },
              { key: 'waist', label: 'Core' },
              { key: 'lower arms', label: 'Forearms' },
              { key: 'lower legs', label: 'Calves' },
              { key: 'cardio', label: 'Cardio' },
              { key: 'neck', label: 'Neck' },
            ].map((bp, i) => (
              <TouchableOpacity
                key={bp.label}
                onPress={() => setSelectedBodyPart(bp.key)}
                style={[
                  styles.bodyPartChip,
                  selectedBodyPart === bp.key && styles.bodyPartChipActive,
                  i > 0 && { marginLeft: 8 },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.bodyPartChipText,
                  selectedBodyPart === bp.key && styles.bodyPartChipTextActive,
                ]}>{bp.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredPickerExercises}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              initialNumToRender={20}
              maxToRenderPerBatch={15}
              windowSize={5}
              ListEmptyComponent={() => (
                <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
                  <Ionicons name="search-outline" size={48} color="rgba(255,255,255,0.2)" />
                  <Text style={{ fontFamily: FontFamily.bodyMedium, fontSize: 16, color: 'rgba(255,255,255,0.6)', marginTop: 16, textAlign: 'center' }}>
                    No exercises found.
                  </Text>
                  {exerciseSearch.trim() && (
                    <TouchableOpacity 
                      style={{ marginTop: 24, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                      onPress={() => {
                        setShowPicker(false);
                        router.push({ 
                          pathname: '/create-exercise', 
                          params: { initialName: exerciseSearch, autoGenerate: 'true' } 
                        });
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="sparkles" size={16} color="#000000" />
                      <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: '#000000' }}>
                        Auto-Create with AI
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              ListHeaderComponent={
                <Text style={{ fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.35)', paddingBottom: 8 }}>
                  {filteredPickerExercises.length} exercises
                </Text>
              }
              renderItem={({ item }) => {
                const isAdded = selectedExercises.some(e => e.exercise_id === item.id);
                const equipLabel = !item.equipment || item.equipment === 'bodyweight' ? 'Bodyweight' : (item.equipment.charAt(0).toUpperCase() + item.equipment.slice(1));
                const difficultyColors: Record<string, string> = {
                  'beginner': '#34D399',
                  'intermediate': '#FBBF24',
                  'expert': '#F87171',
                };
                const diffColor = difficultyColors[item.difficulty || ''] || 'rgba(255,255,255,0.3)';
                const diffLabel = item.difficulty ? item.difficulty.charAt(0).toUpperCase() + item.difficulty.slice(1) : null;
                
                return (
                  <TouchableOpacity
                    style={[styles.exercisePickItem, isAdded && styles.exercisePickItemAdded]}
                    onPress={() => addExercise(item)}
                    disabled={isAdded}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.exercisePickIcon, { backgroundColor: isAdded ? 'rgba(255,255,255,0.2)' : 'rgba(255,107,53,0.08)', overflow: 'hidden' }]}>
                      {item.image_url && !failedGifs.has(item.image_url) ? (
                        <Image 
                          source={{ uri: item.image_url }} 
                          style={{ width: '100%', height: '100%', borderRadius: 8 }} 
                          contentFit="cover"
                          cachePolicy="disk"
                          onError={() => setFailedGifs(prev => new Set(prev).add(item.image_url!))}
                        />
                      ) : (
                        <Ionicons name="barbell-outline" size={20} color={isAdded ? '#FFFFFF' : '#FF6B35'} />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.exercisePickName, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
                        {diffLabel && (
                          <View style={{ backgroundColor: diffColor + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                            <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: diffColor }}>{diffLabel}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.exerciseTags}>
                        <Text style={styles.exerciseTag}>{item.muscle_group || 'Full Body'}</Text>
                        <Text style={styles.exerciseTagDot}>·</Text>
                        <Text style={styles.exerciseTag}>{equipLabel}</Text>
                        {item.secondary_muscles && item.secondary_muscles.length > 0 ? (
                          <><Text style={styles.exerciseTagDot}>·</Text><Text style={styles.exerciseTag}>{item.secondary_muscles.slice(0, 2).join(', ')}</Text></>
                        ) : null}
                      </View>
                      {item.description ? (
                        <Text style={{ fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }} numberOfLines={1}>
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    {isAdded ? (
                      <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                    ) : (
                      <Ionicons name="add-circle-outline" size={22} color="rgba(255,255,255,0.8)" />
                    )}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separatorModal} />}
            />
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  // ── WIZARD UI ──
  if (wizardStep > 0) {
    const progressPct = (wizardStep / 3) * 100;
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Progress Bar */}
        <View style={wz.progressBar}>
          <View style={[wz.progressFill, { width: `${progressPct}%` }]} />
        </View>

        {/* Header */}
        <View style={wz.header}>
          <TouchableOpacity
            onPress={() => wizardStep === 1 ? router.back() : setWizardStep(wizardStep - 1)}
            style={wz.backBtn}
          >
            <Ionicons name={wizardStep === 1 ? 'close' : 'chevron-back'} size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={wz.stepLabel}>Step {wizardStep} of 3</Text>
          {wizardStep < 3 ? (
            <TouchableOpacity onPress={() => { handleWizardComplete(); }} style={wz.skipBtn}>
              <Text style={wz.skipText}>Skip</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 50 }} />}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={wz.scroll} keyboardShouldPersistTaps="handled">

          {/* ── STEP 1: BODY FOCUS ── */}
          {wizardStep === 1 && (
            <>
              <Text style={wz.title}>What will this{'\n'}workout target?</Text>
              <View style={wz.subtitleRow}>
                <Text style={wz.subtitle}>Select one or more body parts</Text>
                <TouchableOpacity style={wz.aiGenerateBtn} onPress={() => setShowAiSheet(true)} activeOpacity={0.7}>
                  <Ionicons name="sparkles" size={14} color="#FBBF24" />
                  <Text style={wz.aiGenerateBtnText}>AI Generate</Text>
                </TouchableOpacity>
              </View>

              <View style={wz.focusGrid}>
                {BODY_FOCUS.map(bp => {
                  const isActive = selectedFocus.includes(bp.key);
                  return (
                    <TouchableOpacity
                      key={bp.key}
                      style={[wz.focusCard, isActive && { borderColor: bp.glow + '60', backgroundColor: bp.glow + '08' }]}
                      onPress={() => toggleFocus(bp.key)}
                      activeOpacity={0.7}
                    >
                      <Image source={bp.emblem} style={[wz.focusEmblem, !isActive && { opacity: 0.35 }]} contentFit="cover" />
                      <Text style={[wz.focusLabel, isActive && { color: '#FFF' }]}>{bp.label}</Text>
                      {isActive && (
                        <View style={[wz.focusCheck, { backgroundColor: bp.glow }]}>
                          <Ionicons name="checkmark" size={12} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* ── STEP 2: NAME & EQUIPMENT ── */}
          {wizardStep === 2 && (
            <>
              {/* Emblem preview */}
              {primaryEmblem && (
                <View style={wz.emblemPreview}>
                  <View style={[wz.emblemGlow, { shadowColor: primaryEmblem.glow, backgroundColor: primaryEmblem.glow }]} />
                  <Image source={primaryEmblem.emblem} style={wz.emblemImage} contentFit="cover" />
                </View>
              )}

              <Text style={wz.title}>Name your workout</Text>

              {/* Suggested names */}
              {suggestedNames.length > 0 && (
                <View style={wz.nameChips}>
                  <View style={wz.aiLabel}>
                    <Ionicons name="sparkles" size={12} color="#FBBF24" />
                    <Text style={wz.aiLabelText}>SUGGESTED</Text>
                  </View>
                  <View style={wz.chipRow}>
                    {suggestedNames.map(n => (
                      <TouchableOpacity
                        key={n}
                        style={[wz.nameChip, name === n && { backgroundColor: (primaryEmblem?.glow || '#3B82F6') + '20', borderColor: (primaryEmblem?.glow || '#3B82F6') + '40' }]}
                        onPress={() => setName(n)}
                        activeOpacity={0.7}
                      >
                        <Text style={[wz.nameChipText, name === n && { color: '#FFF' }]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Custom name input */}
              <View style={wz.nameInputWrap}>
                <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.2)" />
                <TextInput
                  style={wz.nameInput}
                  placeholder="Or type your own name..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
                {name.length > 0 && (
                  <TouchableOpacity onPress={() => setName('')}>
                    <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.2)" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Equipment */}
              <Text style={wz.sectionLabel}>EQUIPMENT</Text>
              <View style={wz.equipGrid}>
                {EQUIPMENT_TAGS.map(eq => {
                  const isActive = selectedEquipment.includes(eq.key);
                  return (
                    <TouchableOpacity
                      key={eq.key}
                      style={[wz.equipTag, isActive && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }]}
                      onPress={() => toggleEquipment(eq.key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={eq.icon} size={14} color={isActive ? '#FFF' : 'rgba(255,255,255,0.3)'} />
                      <Text style={[wz.equipTagText, isActive && { color: '#FFF' }]}>{eq.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* ── STEP 3: SMART SUGGESTIONS ── */}
          {wizardStep === 3 && (
            <>
              <Text style={wz.title}>Quick-add exercises</Text>
              <Text style={wz.subtitle}>
                Based on your selections · Tap to add
              </Text>

              {suggestedExercises.length === 0 ? (
                <View style={wz.emptyExercises}>
                  <Ionicons name="barbell-outline" size={32} color="rgba(255,255,255,0.08)" />
                  <Text style={wz.emptyText}>No exercises match your filters</Text>
                  <Text style={wz.emptySubtext}>You can add exercises from the full library in the builder</Text>
                </View>
              ) : (
                <View style={wz.exerciseList}>
                  {suggestedExercises.map(ex => {
                    const isAdded = selectedExercises.some(e => e.exercise_id === ex.id);
                    return (
                      <TouchableOpacity
                        key={ex.id}
                        style={[wz.exerciseCard, isAdded && { opacity: 0.4 }]}
                        onPress={() => quickAddExercise(ex)}
                        disabled={isAdded}
                        activeOpacity={0.7}
                      >
                        <View style={wz.exerciseThumb}>
                          {ex.image_url && !failedGifs.has(ex.image_url) ? (
                            <Image
                              source={{ uri: ex.image_url }}
                              style={{ width: '100%', height: '100%', borderRadius: 10 }}
                              contentFit="cover"
                              cachePolicy="disk"
                              onError={() => setFailedGifs(prev => new Set(prev).add(ex.image_url!))}
                            />
                          ) : (
                            <Ionicons name="barbell-outline" size={20} color="rgba(255,255,255,0.15)" />
                          )}
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={wz.exerciseName} numberOfLines={1}>{ex.name}</Text>
                          <Text style={wz.exerciseMeta}>
                            {ex.muscle_group} · {ex.equipment || 'Bodyweight'}
                          </Text>
                        </View>
                        {isAdded ? (
                          <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
                        ) : (
                          <View style={wz.quickAddBtn}>
                            <Ionicons name="add" size={18} color="#FFFFFF" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {selectedExercises.length > 0 && (
                <View style={wz.addedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                  <Text style={wz.addedText}>{selectedExercises.length} EXERCISE{selectedExercises.length !== 1 ? 'S' : ''} ADDED</Text>
                </View>
              )}
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Footer CTA */}
        <View style={[wz.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[wz.nextBtn, selectedFocus.length === 0 && wizardStep === 1 && { opacity: 0.4 }]}
            onPress={() => {
              if (wizardStep < 3) {
                setWizardStep(wizardStep + 1);
              } else {
                handleWizardComplete();
              }
            }}
            disabled={wizardStep === 1 && selectedFocus.length === 0}
            activeOpacity={0.85}
          >
            <View style={wz.nextBtnGradient}>
              <Text style={wz.nextBtnText}>
                {wizardStep === 3 ? 'START BUILDING' : 'CONTINUE'}
              </Text>
              <Ionicons name={wizardStep === 3 ? 'hammer' : 'arrow-forward'} size={16} color="#000000" />
            </View>
          </TouchableOpacity>
        </View>

        {/* AI Generate Bottom Sheet */}
        <Modal visible={showAiSheet} transparent animationType="slide" onRequestClose={() => !aiLoading && setShowAiSheet(false)}>
          <TouchableOpacity style={wz.sheetOverlay} activeOpacity={1} onPress={() => !aiLoading && setShowAiSheet(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TouchableOpacity activeOpacity={1} style={wz.sheetContent}>
                <View style={wz.sheetHandle} />
                <View style={wz.sheetHeader}>
                  <Ionicons name="sparkles" size={24} color="#FBBF24" />
                  <Text style={wz.sheetTitle}>AI Workout Generator</Text>
                </View>
                <Text style={wz.sheetDesc}>Describe the workout and AI will build it for you</Text>

                {/* Example prompts */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={wz.exampleScroll}>
                  {[
                    'Push day, intermediate, dumbbells',
                    'Full body HIIT, 30 min, bodyweight',
                    'Back and biceps, heavy, barbell'
                  ].map(ex => (
                    <TouchableOpacity
                      key={ex}
                      style={wz.exampleChip}
                      onPress={() => setAiPrompt(ex)}
                      activeOpacity={0.7}
                    >
                      <Text style={wz.exampleChipText}>{ex}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={wz.aiInputRow}>
                  <TextInput
                    style={wz.aiInput}
                    placeholder="e.g. Leg day for beginner, machines only, 45 min"
                    placeholderTextColor="rgba(255,255,255,0.15)"
                    value={aiPrompt}
                    onChangeText={setAiPrompt}
                    multiline
                    editable={!aiLoading}
                  />
                </View>

                <TouchableOpacity
                  style={[wz.aiSubmitBtn, (!aiPrompt.trim() || aiLoading) && { opacity: 0.4 }]}
                  onPress={handleAiGenerate}
                  disabled={!aiPrompt.trim() || aiLoading}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#FBBF24', '#F59E0B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={wz.aiSubmitGradient}>
                    {aiLoading ? (
                      <><ActivityIndicator size="small" color="#000" /><Text style={wz.aiSubmitText}>Generating...</Text></>
                    ) : (
                      <><Ionicons name="sparkles" size={18} color="#000" /><Text style={wz.aiSubmitText}>Generate Workout</Text></>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{editId ? 'Edit Workout' : 'Build Workout'}</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.saveBtnText}>{editId ? 'Save' : 'Create'}</Text>
              )}
            </TouchableOpacity>
          </View>

          <DraggableFlatList
            data={selectedExercises}
            onDragEnd={({ data }) => setSelectedExercises(data)}
            keyExtractor={(item) => item.exercise_id}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <>
                <View style={styles.wysiwygHeader}>
                  {/* Emblem + Title Row */}
                  {primaryEmblem && (
                    <View style={wz.builderEmblemRow}>
                      <View style={wz.builderEmblemWrap}>
                        <View style={[wz.builderEmblemGlow, { backgroundColor: primaryEmblem.glow, shadowColor: primaryEmblem.glow }]} />
                        <Image source={primaryEmblem.emblem} style={wz.builderEmblemImg} contentFit="cover" />
                      </View>
                      <View style={wz.builderFocusTags}>
                        {selectedFocus.map(f => {
                          const bp = BODY_FOCUS.find(b => b.key === f);
                          return bp ? (
                            <View key={f} style={[wz.builderFocusTag, { backgroundColor: bp.glow + '15', borderColor: bp.glow + '30' }]}>
                              <Text style={[wz.builderFocusTagText, { color: bp.glow }]}>{bp.label}</Text>
                            </View>
                          ) : null;
                        })}
                      </View>
                    </View>
                  )}
                  <TextInput
                    style={styles.titleInput}
                    placeholder="Workout Title"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={name}
                    onChangeText={setName}
                    selectionColor="#FFFFFF"
                    autoFocus={!name}
                  />
                  <TextInput
                    style={styles.subtitleInput}
                    placeholder="Equipment: e.g. Open Space, Bodyweight"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={description}
                    onChangeText={setDescription}
                    selectionColor="#FFFFFF"
                    multiline
                  />
                </View>
                <View style={[styles.blockHeader, { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md }]}>
                  <Text style={styles.blockHeaderText}>Workout Flow</Text>
                </View>
              </>
            }
            ListFooterComponent={
              <>
                <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl }}>
                  <TouchableOpacity 
                    style={styles.addExerciseGhost} 
                    onPress={() => setShowPicker(true)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.accordionThumb, { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderStyle: 'dashed' }]}>
                      <Ionicons name="add" size={24} color="rgba(255,255,255,0.5)" />
                    </View>
                    <Text style={styles.addExerciseGhostText}>Add Exercise...</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 120 }} />
              </>
            }
            renderItem={({ item: ex, drag, isActive, getIndex }) => {
              const index = getIndex();
              const isExpanded = expandedExerciseId === ex.exercise_id;
              const isGrouped = ex.group_id !== null && ex.group_id !== undefined;
              return (
                <ScaleDecorator>
                  <View style={[
                    styles.accordionContainer, 
                    isActive && { backgroundColor: 'rgba(255,255,255,0.05)' },
                    isGrouped && { borderLeftWidth: 3, borderLeftColor: '#EF4444', marginLeft: Spacing.sm }
                  ]}>
                    <TouchableOpacity 
                      style={styles.accordionHeader} 
                      onPress={() => setExpandedExerciseId(isExpanded ? null : ex.exercise_id)}
                      onLongPress={drag}
                      activeOpacity={0.7}
                    >
                      <TouchableOpacity onPressIn={drag} style={{ marginRight: Spacing.sm }}>
                        <Ionicons name="menu" size={24} color="rgba(255,255,255,0.3)" />
                      </TouchableOpacity>
                      <View style={[styles.accordionThumb, ex.image_url && !failedGifs.has(ex.image_url) ? { backgroundColor: 'transparent', padding: 0, overflow: 'hidden' } : {}]}>
                        {ex.image_url && !failedGifs.has(ex.image_url) ? (
                          <Image 
                            source={proxyGifStill(ex.image_url)} 
                            style={{ width: '100%', height: '100%', borderRadius: 8 }} 
                            contentFit="cover"
                            cachePolicy="disk"
                            onError={() => setFailedGifs(prev => new Set(prev).add(ex.image_url!))}
                          />
                        ) : (
                          <Ionicons name="barbell" size={24} color="rgba(255,255,255,0.4)" />
                        )}
                      </View>
                      <View style={styles.accordionInfo}>
                        <Text style={styles.accordionName}>{ex.name}</Text>
                        <Text style={styles.accordionSub}>{ex.reps} reps</Text>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#FFFFFF" />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.expandedContent}>
                        {/* Link to Previous */}
                        {index !== undefined && index > 0 && (
                          <TouchableOpacity 
                            style={styles.linkGroupBtn} 
                            onPress={() => {
                              const prev = selectedExercises[index - 1];
                              if (ex.group_id && prev.group_id === ex.group_id) {
                                // Unlink — and clean up orphan if only 1 member remains
                                const orphanGroupId = ex.group_id;
                                updateExercise(ex.exercise_id, 'group_id', null);
                                const remaining = selectedExercises.filter(
                                  e => e.group_id === orphanGroupId && e.exercise_id !== ex.exercise_id
                                );
                                if (remaining.length === 1) {
                                  updateExercise(remaining[0].exercise_id, 'group_id', null);
                                }
                              } else {
                                // Link
                                const newGroupId = prev.group_id || `ss-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
                                if (!prev.group_id) updateExercise(prev.exercise_id, 'group_id', newGroupId);
                                updateExercise(ex.exercise_id, 'group_id', newGroupId);
                              }
                            }}
                          >
                            <Ionicons name={(ex.group_id && index > 0 && selectedExercises[index-1].group_id === ex.group_id) ? "link" : "link-outline"} size={20} color="#EF4444" />
                            <Text style={styles.linkGroupText}>
                              {(ex.group_id && index > 0 && selectedExercises[index-1].group_id === ex.group_id) ? "Unlink from Previous" : "Link with Previous (Superset)"}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Exercise Info: Description, Difficulty, Secondary Muscles */}
                        {(() => {
                          const baseExercise = exercises.find(e => e.id === ex.exercise_id);
                          if (!baseExercise?.description && !baseExercise?.difficulty && !baseExercise?.secondary_muscles?.length) return null;
                          
                          const diffColors: Record<string, string> = { 'beginner': '#34D399', 'intermediate': '#FBBF24', 'expert': '#F87171' };
                          const dc = diffColors[baseExercise?.difficulty || ''] || 'rgba(255,255,255,0.4)';
                          
                          return (
                            <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 12, gap: 10 }}>
                              {/* Difficulty + Secondary Muscles row */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                {baseExercise?.difficulty && (
                                  <View style={{ backgroundColor: dc + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dc }} />
                                    <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: dc }}>
                                      {baseExercise.difficulty.charAt(0).toUpperCase() + baseExercise.difficulty.slice(1)}
                                    </Text>
                                  </View>
                                )}
                                {baseExercise?.secondary_muscles?.map((m, i) => (
                                  <View key={i} style={{ backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                    <Text style={{ fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                                      {m.charAt(0).toUpperCase() + m.slice(1)}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                              {/* Description */}
                              {baseExercise?.description && (
                                <Text style={{ fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 18 }}>
                                  {baseExercise.description}
                                </Text>
                              )}
                            </View>
                          );
                        })()}

                        {/* Media Placeholder */}
                        <TouchableOpacity 
                          style={styles.mediaPlaceholder} 
                          onPress={() => {
                            setVideoModalExercise(ex.exercise_id);
                            setVideoUrlInput(ex.video_url || '');
                          }}
                          activeOpacity={0.8}
                        >
                          {ex.video_url ? (
                            <View style={styles.mediaPresent}>
                              <Ionicons name="play-circle-outline" size={48} color="#FFFFFF" />
                              <Text style={styles.mediaLabel}>Video Added</Text>
                            </View>
                          ) : ex.image_url && !failedGifs.has(ex.image_url) ? (
                            <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                              <RNImage 
                                source={{ uri: proxyGifUrl(ex.image_url)! }} 
                                style={{ width: '100%', height: '100%', borderRadius: 12 }} 
                                resizeMode="cover"
                                onError={() => setFailedGifs(prev => new Set(prev).add(ex.image_url!))}
                              />
                              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>ExerciseDB Demo</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Ionicons name="camera-outline" size={14} color="rgba(255,255,255,0.7)" />
                                  <Text style={{ fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Replace</Text>
                                </View>
                              </View>
                            </View>
                          ) : (
                            <View style={styles.mediaEmpty}>
                              <Ionicons name="videocam-outline" size={32} color="rgba(255,255,255,0.4)" />
                              <Text style={styles.mediaLabel}>Add Demo Media</Text>
                            </View>
                          )}
                        </TouchableOpacity>

                        {/* Voice + Text Controls */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                          <TouchableOpacity
                            style={[styles.voiceBtn, (speakingExerciseId === ex.exercise_id || loadingAudioId === ex.exercise_id) && styles.voiceBtnActive]}
                            onPress={() => handleSpeak(ex.exercise_id, ex.notes || ex.instructions)}
                            activeOpacity={0.7}
                            disabled={loadingAudioId !== null && loadingAudioId !== ex.exercise_id}
                          >
                            {loadingAudioId === ex.exercise_id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Ionicons 
                                name={speakingExerciseId === ex.exercise_id ? 'stop-circle' : 'volume-high'} 
                                size={18} 
                                color={(speakingExerciseId === ex.exercise_id || loadingAudioId === ex.exercise_id) ? '#FFFFFF' : '#FF6B35'} 
                              />
                            )}
                            <Text style={[styles.voiceBtnText, (speakingExerciseId === ex.exercise_id || loadingAudioId === ex.exercise_id) && styles.voiceBtnTextActive]}>
                              {loadingAudioId === ex.exercise_id ? 'Generating...' : speakingExerciseId === ex.exercise_id ? 'Stop' : 'Listen'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.showTextBtn}
                            onPress={() => setShowNotesExerciseId(prev => prev === ex.exercise_id ? null : ex.exercise_id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name={showNotesExerciseId === ex.exercise_id ? 'eye-off-outline' : 'create-outline'} size={16} color="rgba(255,255,255,0.5)" />
                            <Text style={styles.showTextBtnText}>
                              {showNotesExerciseId === ex.exercise_id ? 'Hide' : 'Edit Text'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {showNotesExerciseId === ex.exercise_id && (
                          <View style={{ marginBottom: Spacing.xl }}>
                            <TextInput
                              style={[styles.exerciseDescription, { padding: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: Radius.sm, minHeight: 80 }]}
                              placeholder="Add a workout-specific note or modify instructions..."
                              placeholderTextColor="rgba(255,255,255,0.3)"
                              value={ex.notes}
                              onChangeText={(text) => updateExercise(ex.exercise_id, 'notes', text)}
                              multiline
                              textAlignVertical="top"
                              selectionColor="#FFFFFF"
                            />
                          </View>
                        )}

                        <View style={styles.inlineControlsRow}>
                          {[
                            { label: 'Sets', field: 'sets', value: ex.sets },
                            { label: 'Reps', field: 'reps', value: ex.reps },
                            { label: 'Rest (s)', field: 'rest_seconds', value: ex.rest_seconds },
                          ].map((param) => (
                            <View key={param.field} style={styles.inlineControl}>
                              <Text style={styles.inlineControlLabel}>{param.label}</Text>
                              <View style={styles.inlineControlStepper}>
                                <TouchableOpacity 
                                  style={styles.stepperBtn}
                                  onPress={() => updateExercise(ex.exercise_id, param.field, Math.max(1, (param.value as number) - (param.field === 'rest_seconds' ? 15 : 1)))}
                                >
                                  <Ionicons name="remove" size={16} color="#FFFFFF" />
                                </TouchableOpacity>
                                <Text style={styles.inlineControlValue}>{param.value}</Text>
                                <TouchableOpacity 
                                  style={styles.stepperBtn}
                                  onPress={() => updateExercise(ex.exercise_id, param.field, (param.value as number) + (param.field === 'rest_seconds' ? 15 : 1))}
                                >
                                  <Ionicons name="add" size={16} color="#FFFFFF" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                        </View>

                        <TouchableOpacity style={styles.removeBtn} onPress={() => removeExercise(ex.exercise_id)}>
                          <Text style={styles.removeBtnText}>Remove Exercise</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={styles.separator} />
                  </View>
                </ScaleDecorator>
              );
            }}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Video Attachment Modal */}
      <Modal
        visible={videoModalExercise !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { setVideoModalExercise(null); setVideoUrlInput(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Demo Video</Text>
              <TouchableOpacity onPress={() => { setVideoModalExercise(null); setVideoUrlInput(''); }}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {uploadingVideo ? (
              <View style={styles.uploadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.uploadingText}>Uploading video...</Text>
              </View>
            ) : (
              <>
                {/* Paste URL Option */}
                <Text style={styles.modalLabel}>Paste a video link</Text>
                <View style={styles.urlInputRow}>
                  <TextInput
                    style={styles.urlInput}
                    placeholder="YouTube, Instagram, or any video URL"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={videoUrlInput}
                    onChangeText={setVideoUrlInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    selectionColor="#FFFFFF"
                  />
                  <TouchableOpacity
                    style={[styles.urlPasteBtn, !videoUrlInput.trim() && { opacity: 0.5 }]}
                    onPress={handlePasteVideoUrl}
                    disabled={!videoUrlInput.trim()}
                  >
                    <Ionicons name="checkmark" size={20} color="#000000" />
                  </TouchableOpacity>
                </View>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Upload / Record Options */}
                <TouchableOpacity style={styles.videoOptionBtn} onPress={handlePickVideo}>
                  <View style={styles.videoOptionIcon}>
                    <Ionicons name="cloud-upload-outline" size={22} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.videoOptionTitle}>Upload from gallery</Text>
                    <Text style={styles.videoOptionSub}>Choose a video from your phone</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.videoOptionBtn} onPress={handleRecordVideo}>
                  <View style={[styles.videoOptionIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                    <Ionicons name="recording-outline" size={22} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.videoOptionTitle}>Record a demo</Text>
                    <Text style={styles.videoOptionSub}>Film the exercise with your camera</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Loading Overlay */}
      <Modal
        visible={loadingAudioId !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#FF6B35" style={{ marginBottom: 16 }} />
            <Text style={styles.loadingTitle}>
              {loadingAudioId ? 'Generating Voice' : 'Importing Exercise'}
            </Text>
            <Text style={styles.loadingSubtitle}>
              {loadingAudioId
                ? 'Creating a natural voice guide for this exercise. This only happens once.'
                : 'Setting up exercise details with AI. Hang tight...'}
            </Text>
            <View style={styles.loadingDots}>
              <View style={[styles.loadingDot, { opacity: 0.4 }]} />
              <View style={[styles.loadingDot, { opacity: 0.7 }]} />
              <View style={[styles.loadingDot, { opacity: 1 }]} />
            </View>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000000' 
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.full,
  },
  saveBtnText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 14,
    color: '#000000',
  },

  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 120,
  },

  // WYSIWYG Headers
  wysiwygHeader: {
    marginBottom: Spacing.xl,
  },
  titleInput: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 28,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitleInput: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#9CA3AF',
  },

  // Workout Block Container
  workoutBlock: {
    backgroundColor: '#1C1C1E',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  blockHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  blockHeaderText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },

  // Accordion Items
  accordionContainer: {
    backgroundColor: 'transparent',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  accordionThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  accordionInfo: {
    flex: 1,
  },
  accordionName: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  accordionSub: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },

  // Expanded View
  expandedContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  mediaPlaceholder: {
    width: '100%',
    aspectRatio: 16/9,
    backgroundColor: '#000000',
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  mediaEmpty: {
    alignItems: 'center',
  },
  mediaPresent: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  mediaLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
  },
  exerciseDescription: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  voiceBtnActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  voiceBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#FF6B35',
  },
  voiceBtnTextActive: {
    color: '#FFFFFF',
  },
  showTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  showTextBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  inlineControlsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  inlineControl: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
  },
  inlineControlLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inlineControlStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
  },
  stepperBtn: {
    padding: 4,
  },
  inlineControlValue: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  removeBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: Spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: Radius.md,
  },
  removeBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#EF4444',
  },

  // Add Exercise Ghost
  addExerciseGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  addExerciseGhostText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
  },

  linkGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: Radius.sm,
    marginBottom: Spacing.xl,
  },
  linkGroupText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    color: '#EF4444',
  },

  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: Spacing.lg,
  },
  separatorModal: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // Picker styling preserved from previous layout
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  pickerTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: '#0A0A0A',
    borderRadius: Radius.xs,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 4,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: '#000000',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: 0,
    paddingVertical: 8,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: '#FFFFFF',
    height: '100%',
  },
  createExercisePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.xs,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  createExercisePromptText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  exercisePickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  exercisePickItemAdded: {
    opacity: 0.5,
  },
  exercisePickIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exercisePickName: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  exerciseTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  exerciseTag: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  exerciseTagDot: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },

  // Modal styling preserved
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  modalLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
    letterSpacing: 1,
  },
  urlInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  urlInput: {
    flex: 1,
    backgroundColor: '#050505',
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  urlPasteBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.xs,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dividerText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.5,
  },
  videoOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  videoOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.xs,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoOptionTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  videoOptionSub: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  uploadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    gap: Spacing.md,
  },
  uploadingText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },

  // Loading Overlay
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
  },
  loadingTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  loadingSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 8,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },

  // Body Part Filter Chips
  bodyPartChip: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bodyPartChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  bodyPartChipText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  bodyPartChipTextActive: {
    color: '#000000',
    fontFamily: FontFamily.headingExtraBold,
  },
});

// ── WIZARD STYLES ──
const wz = StyleSheet.create({
  progressBar: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 20, marginTop: 8, borderRadius: 2,
  },
  progressFill: {
    height: '100%', borderRadius: 2, backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: Radius.xs, backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepLabel: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
  },
  skipBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  skipText: { fontFamily: FontFamily.heading, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  scroll: { paddingHorizontal: 24 },
  title: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 26, color: '#FFF',
    lineHeight: 32, marginBottom: 8, marginTop: 8, letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.4)',
    marginBottom: 24,
  },

  // Step 1: Focus grid
  focusGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  focusCard: {
    width: '47%' as any, aspectRatio: 1.3,
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    position: 'relative', overflow: 'hidden',
  },
  focusEmblem: { width: 48, height: 48, borderRadius: Radius.xs },
  focusLabel: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5,
  },
  focusCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },

  // Step 2: Name & Equipment
  emblemPreview: {
    alignItems: 'center', justifyContent: 'center',
    height: 100, marginBottom: 8, marginTop: 12,
  },
  emblemGlow: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    opacity: 0.12,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 24,
  },
  emblemImage: { width: 72, height: 72, borderRadius: 36 },
  nameChips: { marginBottom: 16 },
  aiLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10,
  },
  aiLabelText: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: '#FBBF24',
    letterSpacing: 1.2,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nameChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4,
    backgroundColor: '#0A0A0A',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  nameChipText: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5,
  },
  nameInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'transparent',
    borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 0,
    marginBottom: 28,
  },
  nameInput: {
    flex: 1, fontFamily: FontFamily.body, fontSize: 16, color: '#FFF', paddingVertical: 12,
  },
  sectionLabel: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1.5, marginBottom: 12,
  },
  equipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  equipTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4,
    backgroundColor: '#0A0A0A',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  equipTagText: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5,
  },

  // Step 3: Exercise suggestions
  exerciseList: { gap: 6 },
  exerciseCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm,
    padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  exerciseThumb: {
    width: 44, height: 44, borderRadius: Radius.xs,
    backgroundColor: '#111111',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  exerciseName: { fontFamily: FontFamily.headingSemiBold, fontSize: 14, color: '#FFF' },
  exerciseMeta: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  quickAddBtn: {
    width: 32, height: 32, borderRadius: Radius.xs,
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyExercises: {
    alignItems: 'center', paddingVertical: 48, gap: 8,
  },
  emptyText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 },
  emptySubtext: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center' },
  addedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 16, paddingVertical: 10, borderRadius: Radius.xs,
    backgroundColor: '#0F1A12', borderWidth: 1, borderColor: '#22C55E',
  },
  addedText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: '#22C55E', letterSpacing: 0.5 },

  // Footer
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  nextBtn: { borderRadius: Radius.sm, backgroundColor: '#FFFFFF', height: 50, justifyContent: 'center', alignItems: 'center' },
  nextBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  nextBtnText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#000000', letterSpacing: 1 },

  // Builder emblem in header
  builderEmblemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12,
  },
  builderEmblemWrap: {
    width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
  },
  builderEmblemGlow: {
    position: 'absolute', width: 48, height: 48, borderRadius: 24,
    opacity: 0.15,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12,
  },
  builderEmblemImg: { width: 44, height: 44, borderRadius: 22 },
  builderFocusTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  builderFocusTag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    borderWidth: 1,
  },
  builderFocusTagText: { fontFamily: FontFamily.headingExtraBold, fontSize: 9, letterSpacing: 0.5 },

  // AI Generate
  subtitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 28,
  },
  aiGenerateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.xs,
    backgroundColor: '#1C1505',
    borderWidth: 1, borderColor: '#FBBF24',
  },
  aiGenerateBtnText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: '#FBBF24', letterSpacing: 0.5 },

  // AI Bottom Sheet
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: '#0A0A0A', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetHandle: {
    width: 32, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center', marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6,
  },
  sheetTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: '#FFF', letterSpacing: 0.5 },
  sheetDesc: {
    fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16,
  },
  exampleScroll: { flexGrow: 0, marginBottom: 16 },
  exampleChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4,
    backgroundColor: '#121212',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginRight: 8,
  },
  exampleChipText: { fontFamily: FontFamily.headingSemiBold, fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  aiInputRow: {
    backgroundColor: '#050505', borderRadius: Radius.xs,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14, marginBottom: 16,
  },
  aiInput: {
    fontFamily: FontFamily.body, fontSize: 14, color: '#FFF',
    paddingVertical: 12, minHeight: 60, textAlignVertical: 'top',
  },
  aiSubmitBtn: { borderRadius: Radius.sm, backgroundColor: '#FFFFFF', height: 48, justifyContent: 'center', alignItems: 'center' },
  aiSubmitGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
  },
  aiSubmitText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#000', letterSpacing: 1 },
});
