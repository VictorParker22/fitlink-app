import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Modal, ActivityIndicator, Image as RNImage, ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';

import { supabase, SUPABASE_URL } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { Spacing, FontFamily, Radius } from '../constants/theme';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useAlert } from '../context/AlertContext';
import { proxyGifUrl, proxyGifStill } from '../lib/exercisedb';
import { REGIONS, normalizeMuscle } from '../lib/muscles';
import MuscleMap from '../components/anatomy/MuscleMap';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Audio } from 'expo-av';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useReducedMotion } from '../lib/useReducedMotion';
import { getWorkoutEmblem } from '../utils/workoutEmblems';
import { WizardTopBar, WizardHeading, GhostSlot } from '../components/wizard/WizardChrome';

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

const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

type Mode = 'setup' | 'describe' | 'builder';

// One quiet materialization — cubic-bezier(0.22,1,0.36,1), no bounce.
const EMBLEM_EASING = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * The workout's emblem, derived from the coach's real current state. When the
 * resolved badge identity changes it materializes: scale 0.85→1 with a slight
 * -4deg→0 rotate settle. Skipped entirely under Reduce Motion (DESIGN.md law).
 */
function MaterializingEmblem({ source }: { source: ImageSourcePropType }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const prevSource = useRef(source);

  useEffect(() => {
    if (prevSource.current === source) return;
    prevSource.current = source;
    if (reduced) return;
    scale.value = 0.85;
    rotate.value = -4;
    scale.value = withTiming(1, { duration: 700, easing: EMBLEM_EASING });
    rotate.value = withTiming(0, { duration: 700, easing: EMBLEM_EASING });
  }, [source, reduced, scale, rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Animated.View style={[s.emblemWrap, animatedStyle]}>
      <Image source={source} style={{ width: '100%', height: '100%' }} contentFit="cover" />
    </Animated.View>
  );
}

export default function CreateWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const editId = params.editId as string | undefined;

  const insets = useSafeAreaInsets();
  const { exercises, workouts, createWorkout, updateWorkout, importExercise, autoAddExerciseId, setAutoAddExerciseId, activeClients, plans, assignWorkout } = useApp();
  const { showAlert } = useAlert();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // Picker state
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);
  const [failedGifs, setFailedGifs] = useState<Set<string>>(new Set());
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [showBodyMap, setShowBodyMap] = useState(false);

  const toggleMuscleFilter = (id: string) => {
    setSelectedMuscles(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

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

  // ── FLOW STATE ──
  const [mode, setMode] = useState<Mode>(editId ? 'builder' : 'setup');
  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);

  // ── AI DESCRIBE STATE ──
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // ── SAVE / ASSIGN STATE ──
  const [saving, setSaving] = useState(false);
  const [savedWorkout, setSavedWorkout] = useState<{ id: string; name: string } | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [enrollmentByClient, setEnrollmentByClient] = useState<Record<string, { planName: string; position: number } | null>>({});

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

      // Match exercises to database entries by name similarity — never invent, only match the coach's library
      let matchedCount = 0;
      if (data.exercises && Array.isArray(data.exercises)) {
        const matched: SelectedExercise[] = [];
        for (const aiEx of data.exercises) {
          const exName = (aiEx.exercise_name || '').toLowerCase();
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
        matchedCount = matched.length;
      }

      setAiPrompt('');
      setMode('builder');
      showAlert({
        type: 'success',
        title: 'Workout ready',
        message: `Matched ${matchedCount} exercise${matchedCount === 1 ? '' : 's'} from your library.`,
      });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Couldn’t generate', message: err.message || 'Failed to generate workout' });
    } finally {
      setAiLoading(false);
    }
  };

  const BODY_FOCUS = [
    { key: 'chest', label: 'Chest', filter: 'chest' },
    { key: 'back', label: 'Back', filter: 'back' },
    { key: 'legs', label: 'Legs', filter: 'upper legs' },
    { key: 'arms', label: 'Arms', filter: 'upper arms' },
    { key: 'shoulders', label: 'Shoulders', filter: 'shoulders' },
    { key: 'core', label: 'Core', filter: 'waist' },
    { key: 'cardio', label: 'Cardio', filter: 'cardio' },
    { key: 'fullbody', label: 'Full body', filter: null },
  ] as const;

  const EQUIPMENT_TAGS = [
    { key: 'barbell', label: 'Barbell' },
    { key: 'dumbbell', label: 'Dumbbell' },
    { key: 'cable', label: 'Cable' },
    { key: 'machine', label: 'Machine' },
    { key: 'bodyweight', label: 'Bodyweight' },
    { key: 'bands', label: 'Bands' },
    { key: 'kettlebell', label: 'Kettlebell' },
  ];

  const focusLabel = (key: string) => BODY_FOCUS.find(b => b.key === key)?.label || key;
  const equipmentLabel = (key: string) => EQUIPMENT_TAGS.find(e => e.key === key)?.label || key;

  const NAME_TEMPLATES: Record<string, string[]> = {
    'chest': ['Chest crusher', 'Push day power', 'Pec blaster', 'Chest pump'],
    'back': ['Pull day fury', 'Back builder', 'Lat attack', 'Row rampage'],
    'legs': ['Leg day destroyer', 'Lower body blitz', 'Squat storm', 'Quad quake'],
    'arms': ['Arm assault', 'Gun show', 'Bicep & tricep blast', 'Arm day finisher'],
    'shoulders': ['Boulder shoulders', 'Delt domination', 'Shoulder sculptor', 'Press protocol'],
    'core': ['Core crusher', 'Ab inferno', 'Midline mayhem', 'Core strength circuit'],
    'cardio': ['Cardio blitz', 'HIIT fury', 'Endurance engine', 'Heart rate spike'],
    'fullbody': ['Total body burn', 'Full body fury', 'Compound crusher', 'Functional fitness'],
    'chest,back': ['Push-pull power', 'Upper body domination'],
    'chest,shoulders': ['Press day protocol', 'Chest & shoulders blast'],
    'chest,arms': ['Chest & arms pump', 'Upper push finisher'],
    'back,arms': ['Pull & curl power', 'Back & biceps day'],
    'legs,core': ['Legs & core circuit', 'Lower body & abs'],
  };

  const suggestedNames = useMemo(() => {
    if (selectedFocus.length === 0) return [];
    const key = selectedFocus.slice(0, 2).sort().join(',');
    const singleKey = selectedFocus[0];
    const combos = NAME_TEMPLATES[key] || [];
    const singles = NAME_TEMPLATES[singleKey] || [];
    const all = [...new Set([...combos, ...singles])];
    return all.slice(0, 3);
  }, [selectedFocus]);

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

  const goToBuilder = () => {
    // Pre-fill the body part filter for the picker
    if (selectedFocus.length > 0) {
      const firstFocus = BODY_FOCUS.find(b => b.key === selectedFocus[0]);
      setSelectedBodyPart(firstFocus?.filter ?? null);
    } else {
      setSelectedBodyPart(null);
    }
    // Auto-fill description from equipment
    if (selectedEquipment.length > 0 && !description) {
      setDescription(selectedEquipment.map(equipmentLabel).join(', '));
    }
    setMode('builder');
  };

  const skipSetup = () => {
    setSelectedFocus([]);
    setSelectedEquipment([]);
    setSelectedBodyPart(null);
    setMode('builder');
  };

  // Filter exercises from Supabase (already loaded via AppContext)
  const filteredPickerExercises = useMemo(() => {
    let filtered = exercises;

    if (selectedBodyPart) {
      const categories = bodyPartCategoryMap[selectedBodyPart] || [selectedBodyPart];
      filtered = filtered.filter(e => categories.includes(e.category?.toLowerCase()));
    }

    if (selectedMuscles.length > 0) {
      filtered = filtered.filter(e => {
        const region = normalizeMuscle(e.muscle_group || '');
        return region !== null && selectedMuscles.includes(region);
      });
    }

    if (exerciseSearch.trim()) {
      const q = exerciseSearch.toLowerCase();
      filtered = filtered.filter(e =>
        e.name?.toLowerCase().includes(q) ||
        e.muscle_group?.toLowerCase().includes(q) ||
        e.equipment?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [exercises, selectedBodyPart, exerciseSearch, selectedMuscles]);

  const [videoModalExercise, setVideoModalExercise] = useState<string | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [speakingExerciseId, setSpeakingExerciseId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [showNotesExerciseId, setShowNotesExerciseId] = useState<string | null>(null);
  const [soundRef, setSoundRef] = useState<Audio.Sound | null>(null);

  const handleSpeak = useCallback(async (exerciseId: string, text?: string) => {
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
      showAlert({ type: 'info', title: 'No instructions', message: 'This exercise has no instructions to read aloud yet.' });
      return;
    }

    if (soundRef) {
      await soundRef.stopAsync();
      await soundRef.unloadAsync();
      setSoundRef(null);
    }

    try {
      setLoadingAudioId(exerciseId);

      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { exercise_id: exerciseId, text: plainText }
      });

      if (error || !data?.audio_url) {
        throw new Error(error?.message || 'Failed to generate audio');
      }

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: data.audio_url },
        { shouldPlay: true }
      );
      setSoundRef(sound);
      setSpeakingExerciseId(exerciseId);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setSpeakingExerciseId(null);
          sound.unloadAsync();
          setSoundRef(null);
        }
      });
    } catch (err: any) {
      console.error('TTS error:', err);
      showAlert({ type: 'error', title: 'Voice error', message: String(err?.message || 'Could not generate voice audio') });
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
                name: baseEx?.name || 'Unknown exercise',
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
          title: 'Added',
          message: `"${match.name}" was added to your workout.`
        });
      }
      setAutoAddExerciseId(null);
    }
  }, [autoAddExerciseId, exercises]);

  const addExercise = (exercise: typeof exercises[0]) => {
    setSelectedExercises((prev) => {
      if (prev.find((e) => e.exercise_id === exercise.id)) return prev;
      return [...prev, {
        exercise_id: exercise.id,
        name: exercise.name,
        muscle_group: exercise.muscle_group,
        instructions: exercise.instructions,
        sets: 3,
        reps: 10,
        rest_seconds: 60,
        image_url: exercise.image_url,
        notes: stripHtml(exercise.instructions),
      }];
    });
  };

  const toggleExerciseInPicker = (exercise: typeof exercises[0]) => {
    const isAdded = selectedExercises.some(e => e.exercise_id === exercise.id);
    if (isAdded) {
      setSelectedExercises(prev => prev.filter(e => e.exercise_id !== exercise.id));
    } else {
      addExercise(exercise);
      setExpandedExerciseId(exercise.id);
    }
  };

  const removeExercise = (id: string) => {
    showAlert({
      type: 'confirm',
      title: 'Remove exercise',
      message: 'Are you sure you want to remove this exercise?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => {
          setSelectedExercises((prev) => prev.filter((e) => e.exercise_id !== id));
          if (expandedExerciseId === id) setExpandedExerciseId(null);
        }},
      ],
    });
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
    const mimeType = asset.mimeType || 'video/mp4';

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('You are signed out. Sign in and try again.');

    const objectName = `exercise-${videoModalExercise}-${Date.now()}.${ext}`;
    // exercise-videos only accepts writes under `{auth uid}/…`.
    const fileName = `${session.user.id}/${objectName}`;

    const formData = new FormData();
    // Field name must be non-empty — '' is rejected by the storage API.
    formData.append('file', {
      uri: asset.uri,
      name: objectName,
      type: mimeType,
    } as any);

    // `(supabase as any).supabaseUrl` is not public API and can be undefined,
    // producing a request to "undefined/storage/v1/...".
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/exercise-videos/${fileName}`,
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
      showAlert({ type: 'error', title: 'Upload failed', message: err.message || 'Failed to upload video' });
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleRecordVideo = async () => {
    if (!videoModalExercise) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert({ type: 'warning', title: 'Permission needed', message: 'Camera access is required to record videos' });
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
      showAlert({ type: 'error', title: 'Upload failed', message: err.message || 'Failed to upload video' });
    } finally {
      setUploadingVideo(false);
    }
  };

  // ── Stats (shared between builder header and the assign sheet) ──
  const totalSets = selectedExercises.reduce((acc, e) => acc + e.sets, 0);
  const estMinutes = selectedExercises.length === 0 ? 0 : Math.max(1, Math.round(
    selectedExercises.reduce((acc, e) => acc + e.sets * (e.rest_seconds + 40), 0) / 60
  ));
  const statsLine = `${selectedExercises.length} exercise${selectedExercises.length === 1 ? '' : 's'} · ${totalSets} set${totalSets === 1 ? '' : 's'} · ~${estMinutes} min`;
  const summaryLine = [
    selectedFocus.length ? selectedFocus.map(focusLabel).join(', ') : null,
    selectedEquipment.length ? selectedEquipment.map(equipmentLabel).join(', ') : null,
  ].filter(Boolean).join(' · ');

  // ── Emblem — derived from REAL current state (focus + added exercises +
  // name) so it matches exactly what the library and the athlete will show.
  const emblemSource = useMemo(() => {
    const muscleGroups = [
      ...selectedFocus,
      ...selectedExercises.map(e => e.muscle_group).filter(Boolean),
    ];
    return getWorkoutEmblem(editId ?? 'new-workout', name.trim() || undefined, muscleGroups);
  }, [editId, name, selectedFocus, selectedExercises]);

  // ── Load enrollment info for the assign sheet (best-effort; falls back to name-only) ──
  const loadEnrollments = useCallback(async () => {
    if (activeClients.length === 0) return;
    try {
      const clientIds = activeClients.map(c => c.id);
      const { data, error } = await supabase
        .from('client_plan_enrollments')
        .select('client_id, plan_id, track_position, status')
        .in('client_id', clientIds);
      if (error || !data) return;
      const byClient: Record<string, { planName: string; position: number } | null> = {};
      data.forEach((row: any) => {
        if (row.status === 'completed') return;
        const plan = plans.find(p => p.id === row.plan_id);
        if (!plan) return;
        // Keep the first active enrollment found per client
        if (!byClient[row.client_id]) {
          byClient[row.client_id] = { planName: plan.name, position: row.track_position || 0 };
        }
      });
      setEnrollmentByClient(byClient);
    } catch {
      // Non-fatal — the sheet just shows client names without a pass subtitle.
    }
  }, [activeClients, plans]);

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert({ type: 'warning', title: 'Missing name', message: 'Please enter a name for the workout.' });
      return;
    }
    if (selectedExercises.length === 0) {
      showAlert({ type: 'warning', title: 'No exercises', message: 'Please add at least one exercise to the workout.' });
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
        router.back();
      } else {
        const created = await createWorkout(name.trim(), description.trim(), exercisePayload);
        setSavedWorkout({ id: created.id, name: name.trim() });
        setSelectedClientId(activeClients[0]?.id ?? null);
        loadEnrollments();
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Save failed', message: err.message || 'Failed to save workout' });
    } finally {
      setSaving(false);
    }
  };

  const closeAssignSheet = () => {
    setSavedWorkout(null);
    // Let the native Modal dismiss before navigating away.
    setTimeout(() => router.back(), 300);
  };

  const handleAssign = async () => {
    if (!savedWorkout || !selectedClientId) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      await assignWorkout(savedWorkout.id, selectedClientId, today);
      showAlert({ type: 'success', title: 'Assigned', message: 'The workout was added to their plan.' });
      closeAssignSheet();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Assign failed', message: err.message || 'Could not assign the workout' });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Exercise picker (18e)
  // ─────────────────────────────────────────────────────────────────────────
  if (showPicker) {
    const pickerCategories = [
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
    ];
    const activeCategoryLabel = pickerCategories.find(c => c.key === selectedBodyPart)?.label || 'All';

    return (
      <GestureHandlerRootView style={s.container}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={s.pickerHeader}>
            <TouchableOpacity onPress={() => { setShowPicker(false); setExerciseSearch(''); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={27} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <Text style={s.pickerTitle}>Add exercises</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.pickerDone}>Done · {selectedExercises.length}</Text>
            </TouchableOpacity>
          </View>

          <View style={s.searchBox}>
            <Ionicons name="search" size={20} color={CoachColors.textFaint} />
            <TextInput
              style={s.searchInput}
              placeholder={`Search ${exercises.length} exercises`}
              placeholderTextColor={CoachColors.textFaint}
              value={exerciseSearch}
              onChangeText={setExerciseSearch}
              selectionColor={CoachColors.accent}
            />
            {exerciseSearch.length > 0 && (
              <TouchableOpacity hitSlop={12} onPress={() => setExerciseSearch('')}>
                <Ionicons name="close-circle" size={20} color={CoachColors.textFaint} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingVertical: 8, alignItems: 'center' }}
          >
            {pickerCategories.map((bp, i) => (
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }}
                key={bp.label}
                onPress={() => setSelectedBodyPart(bp.key)}
                style={[s.filterChip, selectedBodyPart === bp.key && s.filterChipActive, i > 0 && { marginLeft: 8 }]}
                activeOpacity={0.7}
              >
                <Text style={[s.filterChipText, selectedBodyPart === bp.key && s.filterChipTextActive]}>{bp.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 8, alignItems: 'center' }}
          >
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }}
              onPress={() => setShowBodyMap(prev => !prev)}
              style={[s.filterChip, s.bodyMapChip, showBodyMap && s.filterChipActive]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showBodyMap ? 'Hide body map' : 'Show body map'}
            >
              <Ionicons name="body-outline" size={15} color={showBodyMap ? CoachColors.accent : CoachColors.textSecondary} />
              <Text style={[s.filterChipText, showBodyMap && s.filterChipTextActive]}>Body map</Text>
            </TouchableOpacity>
            {REGIONS.map((region) => {
              const isActive = selectedMuscles.includes(region.id);
              return (
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }}
                  key={region.id}
                  onPress={() => toggleMuscleFilter(region.id)}
                  style={[s.filterChip, isActive && s.filterChipActive, { marginLeft: 8 }]}
                  activeOpacity={0.7}
                >
                  <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>{region.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {showBodyMap && (
            <View style={s.bodyMapWrap}>
              <MuscleMap
                view="both"
                height={260}
                selected={selectedMuscles}
                onToggle={toggleMuscleFilter}
              />
              <Text style={s.bodyMapHint}>
                {selectedMuscles.length > 0
                  ? `Filtering by ${selectedMuscles.length} muscle group${selectedMuscles.length === 1 ? '' : 's'}`
                  : 'Tap a muscle group to filter'}
              </Text>
            </View>
          )}

          <Text style={s.resultCount}>{filteredPickerExercises.length} in {activeCategoryLabel}</Text>

          <FlatList keyboardShouldPersistTaps="handled"
            data={filteredPickerExercises}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            windowSize={5}
            ListEmptyComponent={() => (
              <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
                <Ionicons name="search-outline" size={54} color={CoachColors.borderMuted} />
                <Text style={{ fontFamily: CoachFonts.bodyMedium, fontSize: 18, color: CoachColors.textMuted, marginTop: 16, textAlign: 'center' }}>
                  No exercises found.
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const isAdded = selectedExercises.some(e => e.exercise_id === item.id);
              const equipLabelText = !item.equipment || item.equipment === 'bodyweight' ? 'Bodyweight' : cap(item.equipment);
              const diffLabel = item.difficulty ? cap(item.difficulty) : null;
              const subtitle = [item.muscle_group || 'Full body', equipLabelText, diffLabel].filter(Boolean).join(' · ');

              return (
                <TouchableOpacity
                  style={s.exercisePickItem}
                  onPress={() => toggleExerciseInPicker(item)}
                  activeOpacity={0.7}
                >
                  <View style={[s.exercisePickIcon, item.image_url && !failedGifs.has(item.image_url) && s.thumbPaper]}>
                    {item.image_url && !failedGifs.has(item.image_url) ? (
                      <Image
                        source={{ uri: proxyGifStill(item.image_url)! }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        cachePolicy="disk"
                        onError={() => setFailedGifs(prev => new Set(prev).add(item.image_url!))}
                      />
                    ) : (
                      <Ionicons name="barbell-outline" size={20} color={CoachColors.textFaint} />
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.exercisePickName} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.exercisePickSub} numberOfLines={1}>{subtitle}</Text>
                  </View>
                  {isAdded ? (
                    <View style={s.addCircleActive}>
                      <Ionicons name="checkmark" size={18} color={CoachColors.onAccent} />
                    </View>
                  ) : (
                    <View style={s.addCircle}>
                      <Ionicons name="add" size={20} color={CoachColors.textSecondary} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={s.separatorModal} />}
            ListFooterComponent={
              <TouchableOpacity
                style={s.createExerciseRow}
                onPress={() => {
                  setShowPicker(false);
                  router.push({
                    pathname: '/create-exercise',
                    params: { initialName: exerciseSearch, autoGenerate: 'true' }
                  });
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={20} color={CoachColors.accent} />
                <Text style={s.createExerciseRowText}>Not here? Create an exercise</Text>
              </TouchableOpacity>
            }
          />
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI describe-it flow (18c)
  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'describe') {
    const examplePrompts = [
      'Full body HIIT, 30 min',
      'Back and biceps, heavy',
      'Push day, dumbbells only, 45 min',
    ];

    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.setupHeader}>
          <TouchableOpacity onPress={() => setMode('setup')} style={s.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={19} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.setupScroll} keyboardShouldPersistTaps="handled">
            <WizardHeading kicker="New workout · Describe it" title="Describe the workout" />
            <Text style={[s.subtitle, { marginTop: Spacing.sm }]}>Exercises are picked from your library — nothing invented that you can't assign.</Text>

            <View style={[s.describeInputWrap, aiLoading && { opacity: 0.5 }]}>
              <TextInput
                style={s.describeInput}
                placeholder="Push day for an intermediate lifter, dumbbells only, 45 minutes"
                placeholderTextColor={CoachColors.textFaint}
                value={aiPrompt}
                onChangeText={setAiPrompt}
                multiline
                editable={!aiLoading}
                selectionColor={CoachColors.accent}
              />
            </View>

            <View style={s.chipRow}>
              {examplePrompts.map(ex => (
                <TouchableOpacity hitSlop={{ top: 7, bottom: 7 }}
                  key={ex}
                  style={s.exampleChip}
                  onPress={() => !aiLoading && setAiPrompt(ex)}
                  activeOpacity={0.7}
                  disabled={aiLoading}
                >
                  <Text style={s.exampleChipText}>{ex}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={[s.primaryBtn, (!aiPrompt.trim() || aiLoading) && { opacity: 0.5 }]}
              onPress={handleAiGenerate}
              disabled={!aiPrompt.trim() || aiLoading}
              activeOpacity={0.85}
            >
              {aiLoading ? (
                <>
                  <ActivityIndicator size="small" color={CoachColors.onAccent} />
                  <Text style={s.primaryBtnText}>Matching your exercises…</Text>
                </>
              ) : (
                <Text style={s.primaryBtnText}>Generate workout</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup screen (18b) — single screen, skippable, never blocks
  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'setup') {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.setupHeader}>
          <View style={{ flex: 1 }}>
            <WizardTopBar step={1} totalSteps={2} onBack={() => router.back()} />
          </View>
          <TouchableOpacity onPress={skipSetup} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.skipText}>Skip setup</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.setupScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <WizardHeading kicker="New workout · Identity" title={'Name it.\nWatch it earn its badge.'} />

            <View style={s.nameRow}>
              <MaterializingEmblem source={emblemSource} />
              <View style={s.nameFieldWrap}>
                <Text style={s.nameMicroLabel} maxFontSizeMultiplier={1.4}>Workout name</Text>
                <TextInput
                  style={s.nameInput}
                  placeholder="Name your workout"
                  placeholderTextColor={CoachColors.textFaint}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  selectionColor={CoachColors.accent}
                />
              </View>
            </View>
            {suggestedNames.length > 0 && (
              <View style={[s.chipRow, { marginTop: Spacing.sm }]}>
                {suggestedNames.map(n => (
                  <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                    key={n}
                    style={[s.chip, name === n && s.chipActive]}
                    onPress={() => setName(n)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, name === n && s.chipTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[s.subtitle, { marginTop: Spacing.xl, marginBottom: Spacing.md }]}>Focus and equipment only pre-filter the exercise list — change anything later in the builder.</Text>

            <Text style={s.sectionLabel}>Focus</Text>
            <View style={s.chipGrid}>
              {BODY_FOCUS.map(bp => {
                const isActive = selectedFocus.includes(bp.key);
                return (
                  <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                    key={bp.key}
                    style={[s.chip, isActive && s.chipActive]}
                    onPress={() => toggleFocus(bp.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, isActive && s.chipTextActive]}>{bp.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[s.sectionLabel, { marginTop: Spacing.xl }]}>Equipment available</Text>
            <View style={s.chipGrid}>
              {EQUIPMENT_TAGS.map(eq => {
                const isActive = selectedEquipment.includes(eq.key);
                return (
                  <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                    key={eq.key}
                    style={[s.chip, isActive && s.chipActive]}
                    onPress={() => toggleEquipment(eq.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, isActive && s.chipTextActive]}>{eq.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={s.describeCard} onPress={() => setMode('describe')} activeOpacity={0.8}>
              <View style={s.describeCardIcon}>
                <Ionicons name="chatbubble-outline" size={22} color={CoachColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.describeCardTitle}>Describe it instead</Text>
                <Text style={s.describeCardHint} numberOfLines={1}>"Push day for an intermediate lifter, dumbbells only, 45 minutes"</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={CoachColors.textFaint} />
            </TouchableOpacity>
          </ScrollView>

          <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={s.primaryBtn} onPress={goToBuilder} activeOpacity={0.85}>
              <Text style={s.primaryBtnText}>Start building</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Builder screen (18d)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <GestureHandlerRootView style={s.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={s.builderHeader}>
            <View style={{ flex: 1 }}>
              <WizardTopBar
                step={editId ? 1 : 2}
                totalSteps={editId ? 1 : 2}
                onBack={() => router.back()}
              />
            </View>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={s.createBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={CoachColors.onAccent} />
              ) : (
                <Text style={s.createBtnText}>{editId ? 'Save' : 'Create'}</Text>
              )}
            </TouchableOpacity>
          </View>

          <DraggableFlatList
            data={selectedExercises}
            onDragEnd={({ data }) => setSelectedExercises(data)}
            keyExtractor={(item) => item.exercise_id}
            contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={s.builderIntro}>
                <View style={s.nameRow}>
                  <MaterializingEmblem source={emblemSource} />
                  <View style={s.nameFieldWrap}>
                    <Text style={s.nameMicroLabel} maxFontSizeMultiplier={1.4}>Workout name</Text>
                    <TextInput
                      style={s.nameInput}
                      placeholder="Workout name"
                      placeholderTextColor={CoachColors.textFaint}
                      value={name}
                      onChangeText={setName}
                      selectionColor={CoachColors.accent}
                      autoFocus={!name}
                    />
                  </View>
                </View>
                {summaryLine ? <Text style={s.summaryLine}>{summaryLine}</Text> : null}
                <Text style={[s.statsLine, !summaryLine && { marginTop: 12 }]}>{statsLine}</Text>
              </View>
            }
            ListEmptyComponent={
              <View style={s.emptyBuilder}>
                <Ionicons name="barbell-outline" size={31} color={CoachColors.borderMuted} />
                <Text style={s.emptyBuilderText}>No exercises yet — add your first one below.</Text>
              </View>
            }
            ListFooterComponent={
              <>
                <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xl }}>
                  <GhostSlot label="Add exercise" onPress={() => setShowPicker(true)} />
                </View>
              </>
            }
            renderItem={({ item: ex, drag, isActive, getIndex }) => {
              const index = getIndex();
              const isExpanded = expandedExerciseId === ex.exercise_id;
              const isGrouped = ex.group_id !== null && ex.group_id !== undefined;
              const isLinkedToPrev = !!(ex.group_id && index !== undefined && index > 0 && selectedExercises[index - 1].group_id === ex.group_id);
              return (
                <ScaleDecorator>
                  <View style={[
                    s.accordionContainer,
                    isActive && { backgroundColor: CoachColors.surface },
                    isGrouped && { borderLeftWidth: 3, borderLeftColor: CoachColors.accent, marginLeft: Spacing.sm }
                  ]}>
                    <TouchableOpacity
                      style={s.accordionHeader}
                      onPress={() => setExpandedExerciseId(isExpanded ? null : ex.exercise_id)}
                      onLongPress={drag}
                      activeOpacity={0.7}
                    >
                      <TouchableOpacity onPressIn={drag} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: Spacing.sm }}>
                        <Ionicons name="reorder-three-outline" size={25} color={CoachColors.textFaint} />
                      </TouchableOpacity>
                      <View style={[s.accordionThumb, ex.image_url && !failedGifs.has(ex.image_url) && s.thumbPaper]}>
                        {ex.image_url && !failedGifs.has(ex.image_url) ? (
                          <Image
                            source={proxyGifStill(ex.image_url)}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                            cachePolicy="disk"
                            onError={() => setFailedGifs(prev => new Set(prev).add(ex.image_url!))}
                          />
                        ) : (
                          <Ionicons name="barbell" size={22} color={CoachColors.textFaint} />
                        )}
                      </View>
                      <View style={s.accordionInfo}>
                        <Text style={s.accordionName} numberOfLines={1}>{ex.name}</Text>
                        <Text style={s.accordionSub}>{ex.sets} × {ex.reps} · {ex.rest_seconds}s rest</Text>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={CoachColors.textSecondary} />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={s.expandedContent}>
                        {index !== undefined && index > 0 && (
                          <TouchableOpacity
                            style={s.linkGroupBtn}
                            onPress={() => {
                              const prev = selectedExercises[index - 1];
                              if (ex.group_id && prev.group_id === ex.group_id) {
                                const orphanGroupId = ex.group_id;
                                updateExercise(ex.exercise_id, 'group_id', null);
                                const remaining = selectedExercises.filter(
                                  e => e.group_id === orphanGroupId && e.exercise_id !== ex.exercise_id
                                );
                                if (remaining.length === 1) {
                                  updateExercise(remaining[0].exercise_id, 'group_id', null);
                                }
                              } else {
                                const newGroupId = prev.group_id || `ss-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
                                if (!prev.group_id) updateExercise(prev.exercise_id, 'group_id', newGroupId);
                                updateExercise(ex.exercise_id, 'group_id', newGroupId);
                              }
                            }}
                          >
                            <Ionicons name={isLinkedToPrev ? 'link' : 'link-outline'} size={20} color={CoachColors.accent} />
                            <Text style={s.linkGroupText}>
                              {isLinkedToPrev ? 'Unlink from previous' : 'Link with previous (superset)'}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {(() => {
                          const baseExercise = exercises.find(e => e.id === ex.exercise_id);
                          if (!baseExercise?.description && !baseExercise?.difficulty && !baseExercise?.secondary_muscles?.length) return null;
                          return (
                            <View style={s.infoCard}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                {baseExercise?.difficulty && (
                                  <View style={s.metaTag}>
                                    <Text style={s.metaTagText}>{cap(baseExercise.difficulty)}</Text>
                                  </View>
                                )}
                                {baseExercise?.secondary_muscles?.map((m, i) => (
                                  <View key={i} style={s.metaTag}>
                                    <Text style={s.metaTagText}>{cap(m)}</Text>
                                  </View>
                                ))}
                              </View>
                              {baseExercise?.description && (
                                <Text style={s.infoCardDesc}>{baseExercise.description}</Text>
                              )}
                            </View>
                          );
                        })()}

                        <TouchableOpacity
                          style={s.mediaPlaceholder}
                          onPress={() => {
                            setVideoModalExercise(ex.exercise_id);
                            setVideoUrlInput(ex.video_url || '');
                          }}
                          activeOpacity={0.8}
                        >
                          {ex.video_url ? (
                            <View style={s.mediaPresent}>
                              <Ionicons name="play-circle-outline" size={49} color={CoachColors.textPrimary} />
                              <Text style={s.mediaLabel}>Demo video added</Text>
                            </View>
                          ) : ex.image_url && !failedGifs.has(ex.image_url) ? (
                            <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                              <RNImage
                                source={{ uri: proxyGifUrl(ex.image_url)! }}
                                style={{ width: '100%', height: '100%', borderRadius: 12 }}
                                resizeMode="cover"
                                onError={() => setFailedGifs(prev => new Set(prev).add(ex.image_url!))}
                              />
                              <View style={s.mediaOverlayBar}>
                                <Text style={s.mediaOverlayText}>Demo video</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Ionicons name="camera-outline" size={16} color={CoachColors.textSecondary} />
                                  <Text style={s.mediaOverlayText}>Replace</Text>
                                </View>
                              </View>
                            </View>
                          ) : (
                            <View style={s.mediaEmpty}>
                              <Ionicons name="videocam-outline" size={31} color={CoachColors.textFaint} />
                              <Text style={s.mediaLabel}>Demo video</Text>
                            </View>
                          )}
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                          <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                            style={s.voiceBtn}
                            onPress={() => handleSpeak(ex.exercise_id, ex.notes || ex.instructions)}
                            activeOpacity={0.7}
                            disabled={loadingAudioId !== null && loadingAudioId !== ex.exercise_id}
                          >
                            {loadingAudioId === ex.exercise_id ? (
                              <ActivityIndicator size="small" color={CoachColors.textSecondary} />
                            ) : (
                              <Ionicons
                                name={speakingExerciseId === ex.exercise_id ? 'stop-circle' : 'volume-high-outline'}
                                size={16}
                                color={CoachColors.textSecondary}
                              />
                            )}
                            <Text style={s.voiceBtnText}>
                              {loadingAudioId === ex.exercise_id ? 'Generating…' : speakingExerciseId === ex.exercise_id ? 'Stop' : 'Listen'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                            style={s.voiceBtn}
                            onPress={() => setShowNotesExerciseId(prev => prev === ex.exercise_id ? null : ex.exercise_id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name={showNotesExerciseId === ex.exercise_id ? 'eye-off-outline' : 'create-outline'} size={18} color={CoachColors.textSecondary} />
                            <Text style={s.voiceBtnText}>
                              {showNotesExerciseId === ex.exercise_id ? 'Hide note' : 'Note for the athlete'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {showNotesExerciseId === ex.exercise_id && (
                          <View style={{ marginBottom: Spacing.lg }}>
                            <TextInput
                              style={s.notesInput}
                              placeholder="Add a workout-specific note or modify instructions…"
                              placeholderTextColor={CoachColors.textFaint}
                              value={ex.notes}
                              onChangeText={(text) => updateExercise(ex.exercise_id, 'notes', text)}
                              multiline
                              textAlignVertical="top"
                              selectionColor={CoachColors.accent}
                            />
                          </View>
                        )}

                        <View style={s.inlineControlsRow}>
                          {[
                            { label: 'Sets', field: 'sets', value: ex.sets, step: 1 },
                            { label: 'Reps', field: 'reps', value: ex.reps, step: 1 },
                            { label: 'Rest (s)', field: 'rest_seconds', value: ex.rest_seconds, step: 15 },
                          ].map((param) => (
                            <View key={param.field} style={s.inlineControl}>
                              <Text style={s.inlineControlLabel}>{param.label}</Text>
                              <View style={s.inlineControlStepper}>
                                <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }}
                                  style={s.stepperBtn}
                                  onPress={() => updateExercise(ex.exercise_id, param.field, Math.max(1, (param.value as number) - param.step))}
                                >
                                  <Ionicons name="remove" size={18} color={CoachColors.textPrimary} />
                                </TouchableOpacity>
                                <Text style={s.inlineControlValue}>{param.value}</Text>
                                <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }}
                                  style={s.stepperBtn}
                                  onPress={() => updateExercise(ex.exercise_id, param.field, (param.value as number) + param.step)}
                                >
                                  <Ionicons name="add" size={18} color={CoachColors.textPrimary} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                        </View>

                        <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }} style={s.removeBtn} onPress={() => removeExercise(ex.exercise_id)}>
                          <Text style={s.removeBtnText}>Remove exercise</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={s.separator} />
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
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Add demo video</Text>
              <TouchableOpacity hitSlop={12} onPress={() => { setVideoModalExercise(null); setVideoUrlInput(''); }}>
                <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {uploadingVideo ? (
              <View style={s.uploadingContainer}>
                <ActivityIndicator size="large" color={CoachColors.accent} />
                <Text style={s.uploadingText}>Uploading video…</Text>
              </View>
            ) : (
              <>
                <Text style={s.modalLabel}>Paste a video link</Text>
                <View style={s.urlInputRow}>
                  <TextInput
                    style={s.urlInput}
                    placeholder="YouTube, Instagram, or any video URL"
                    placeholderTextColor={CoachColors.textFaint}
                    value={videoUrlInput}
                    onChangeText={setVideoUrlInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    selectionColor={CoachColors.accent}
                  />
                  <TouchableOpacity
                    style={[s.urlPasteBtn, !videoUrlInput.trim() && { opacity: 0.5 }]}
                    onPress={handlePasteVideoUrl}
                    disabled={!videoUrlInput.trim()}
                  >
                    <Ionicons name="checkmark" size={22} color={CoachColors.onAccent} />
                  </TouchableOpacity>
                </View>

                <View style={s.dividerRow}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerText}>or</Text>
                  <View style={s.dividerLine} />
                </View>

                <TouchableOpacity style={s.videoOptionBtn} onPress={handlePickVideo}>
                  <View style={s.videoOptionIcon}>
                    <Ionicons name="cloud-upload-outline" size={22} color={CoachColors.textPrimary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.videoOptionTitle}>Upload from gallery</Text>
                    <Text style={s.videoOptionSub}>Choose a video from your phone</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={CoachColors.textFaint} />
                </TouchableOpacity>

                <TouchableOpacity style={s.videoOptionBtn} onPress={handleRecordVideo}>
                  <View style={s.videoOptionIcon}>
                    <Ionicons name="recording-outline" size={22} color={CoachColors.textPrimary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.videoOptionTitle}>Record a demo</Text>
                    <Text style={s.videoOptionSub}>Film the exercise with your camera</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={CoachColors.textFaint} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Saved → assign sheet (18g) */}
      <Modal visible={savedWorkout !== null} transparent animationType="slide" onRequestClose={closeAssignSheet}>
        <View style={s.modalOverlay}>
          <View style={s.assignSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.assignTitle}>{savedWorkout?.name} is saved</Text>
            <Text style={s.assignSubtitle}>{statsLine}. Assign it now or leave it in the library.</Text>

            {activeClients.length === 0 ? (
              <Text style={s.assignEmptyText}>No active clients yet.</Text>
            ) : (
              <View style={{ gap: 4, marginTop: Spacing.md }}>
                {activeClients.slice(0, 6).map(client => {
                  const enrollment = enrollmentByClient[client.id];
                  const subtitle = enrollment ? `${enrollment.planName} · week ${enrollment.position}` : 'On-demand pass';
                  const initials = client.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                  const isSelected = selectedClientId === client.id;
                  return (
                    <TouchableOpacity
                      key={client.id}
                      style={s.clientRow}
                      onPress={() => setSelectedClientId(client.id)}
                      activeOpacity={0.7}
                    >
                      {client.avatar_url ? (
                        <Image source={{ uri: client.avatar_url }} style={s.clientAvatarImg} contentFit="cover" />
                      ) : (
                        <View style={s.clientAvatar}>
                          <Text style={s.clientAvatarText}>{initials}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={s.clientName}>{client.name}</Text>
                        <Text style={s.clientSub}>{subtitle}</Text>
                      </View>
                      <View style={[s.radioCircle, isSelected && s.radioCircleActive]}>
                        {isSelected && <View style={s.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={s.passTrackRow}
              onPress={() => { setSavedWorkout(null); setTimeout(() => router.push('/(tabs)/programs'), 350); }}
              activeOpacity={0.7}
            >
              <Text style={s.passTrackRowText}>Add to a pass track instead</Text>
              <Ionicons name="chevron-forward" size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: Spacing.lg }, !selectedClientId && { opacity: 0.5 }]}
              onPress={handleAssign}
              disabled={!selectedClientId}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>
                Assign to {activeClients.find(c => c.id === selectedClientId)?.name.split(' ')[0] || '…'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={closeAssignSheet} style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Text style={s.notNowText}>Not now</Text>
            </TouchableOpacity>

            <Text style={s.assignFootnote}>
              Try next: 'supersets in the builder' · 'duplicate a workout' · 'exercises tab of the library'
            </Text>
          </View>
        </View>
      </Modal>

      {/* Loading Overlay */}
      <Modal
        visible={loadingAudioId !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLoadingAudioId(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.loadingCard}>
            <ActivityIndicator size="large" color={CoachColors.accent} style={{ marginBottom: 16 }} />
            <Text style={s.loadingTitle}>Generating voice</Text>
            <Text style={s.loadingSubtitle}>Creating a natural voice guide for this exercise. This only happens once.</Text>
            {/* A blocking overlay must never trap the user — if the request
                stalls, this is the visible way back out. */}
            <TouchableOpacity
              onPress={() => setLoadingAudioId(null)}
              hitSlop={12}
              style={s.loadingCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel voice generation"
            >
              <Text style={s.loadingCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  // Matches WizardTopBar's close/back circle so the describe branch wears
  // the same chrome as the stepped screens.
  iconBtn: {
    width: 40, height: 40, borderRadius: 999, borderCurve: 'continuous', backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Identity row — emblem + name (canvas · Creation flows) ──
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  emblemWrap: {
    width: 64, height: 64, borderRadius: 16, borderCurve: 'continuous', overflow: 'hidden',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  nameFieldWrap: {
    flex: 1, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.accent,
    borderRadius: 16, borderCurve: 'continuous',
    paddingHorizontal: 14, paddingVertical: 10, gap: 2,
  },
  nameMicroLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase', color: CoachColors.accent,
  },
  nameInput: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary, padding: 0,
  },

  // ── Setup / describe screens ──
  setupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  skipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textSecondary },
  setupScroll: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  subtitle: {
    fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted,
    lineHeight: 20, marginBottom: 24,
  },
  sectionLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textSecondary,
    marginBottom: 10,
  },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Selection pills — 36pt, radius 999 (canvas · Creation flows).
  chip: {
    height: 36, paddingHorizontal: 14, borderRadius: 999, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  chipActive: {
    backgroundColor: CoachColors.accentSoft,
    borderColor: CoachColors.accent,
  },
  chipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },
  chipTextActive: { color: CoachColors.accent, fontFamily: CoachFonts.bodySemiBold },

  describeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: Radius.md, borderCurve: 'continuous', padding: 14, marginTop: Spacing.xl,
  },
  describeCardIcon: {
    width: 36, height: 36, borderRadius: Radius.xs, borderCurve: 'continuous', backgroundColor: CoachColors.accentSofter,
    alignItems: 'center', justifyContent: 'center',
  },
  describeCardTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 2 },
  describeCardHint: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, fontStyle: 'italic' },

  describeInputWrap: {
    backgroundColor: CoachColors.surface, borderRadius: Radius.sm, borderCurve: 'continuous',
    borderWidth: 1, borderColor: CoachColors.border,
    paddingHorizontal: 14, marginBottom: 16,
  },
  describeInput: {
    fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary,
    paddingVertical: 14, minHeight: 108, textAlignVertical: 'top',
  },
  exampleChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  exampleChipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textSecondary },

  // ── Footer / primary CTA (shared) ──
  footer: { paddingHorizontal: Spacing.lg, paddingTop: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.full, borderCurve: 'continuous', backgroundColor: CoachColors.accent, height: 52,
  },
  primaryBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.onAccent },

  // ── Builder ──
  builderHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  createBtn: { paddingVertical: 8, paddingHorizontal: 18, backgroundColor: CoachColors.accent, borderRadius: Radius.full, borderCurve: 'continuous', minWidth: 64, alignItems: 'center' },
  createBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.onAccent },

  // Bottom clearance is applied inline from insets — the builder has no sticky
  // footer (Save lives in the header) and no tab bar renders over this screen.
  scrollContent: {},
  builderIntro: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  summaryLine: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, marginTop: 12, marginBottom: 4 },
  statsLine: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },

  emptyBuilder: { alignItems: 'center', paddingVertical: 40, gap: 10, paddingHorizontal: Spacing.lg },
  emptyBuilderText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, textAlign: 'center' },

  accordionContainer: { backgroundColor: 'transparent' },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  accordionThumb: {
    width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', backgroundColor: CoachColors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md, overflow: 'hidden',
  },
  // The stills are line drawings on white — the tile keeps that paper white
  // so `cover` never letterboxes a white box against the dark card
  // (WeekSection.tsx precedent).
  thumbPaper: { backgroundColor: '#FFFFFF' },
  accordionInfo: { flex: 1 },
  accordionName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textPrimary, marginBottom: 3 },
  accordionSub: { fontFamily: CoachFonts.mono, fontSize: 12.5, color: CoachColors.textMuted, fontVariant: ['tabular-nums'] },

  expandedContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },

  linkGroupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md,
    backgroundColor: CoachColors.accentSofter, borderRadius: Radius.sm, borderCurve: 'continuous', marginBottom: Spacing.lg,
  },
  linkGroupText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.accent },

  infoCard: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', padding: 14, marginBottom: Spacing.md, gap: 10 },
  metaTag: { backgroundColor: CoachColors.borderMuted, paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.full, borderCurve: 'continuous' },
  metaTagText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textSecondary },
  infoCardDesc: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, lineHeight: 20 },

  mediaPlaceholder: {
    width: '100%', aspectRatio: 16 / 9, backgroundColor: CoachColors.surface, borderRadius: Radius.sm, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md, overflow: 'hidden',
  },
  mediaEmpty: { alignItems: 'center' },
  mediaPresent: { alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', backgroundColor: CoachColors.surface },
  mediaLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary, marginTop: 8 },
  mediaOverlayBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  mediaOverlayText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textSecondary },

  voiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: Radius.full, borderCurve: 'continuous', backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
  },
  voiceBtnText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textSecondary },

  notesInput: {
    fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, lineHeight: 21.5,
    padding: Spacing.sm, backgroundColor: CoachColors.surface, borderRadius: Radius.sm, borderCurve: 'continuous', minHeight: 96,
  },

  inlineControlsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  inlineControl: { flex: 1, backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: Radius.md, borderCurve: 'continuous', paddingVertical: Spacing.sm, alignItems: 'center' },
  inlineControlLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 12.5, color: CoachColors.textFaint, marginBottom: 8 },
  inlineControlStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 4 },
  stepperBtn: { padding: 4 },
  inlineControlValue: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary },

  removeBtn: { alignItems: 'center', paddingVertical: 12, marginTop: Spacing.sm, backgroundColor: CoachColors.dangerSoft, borderRadius: Radius.md, borderCurve: 'continuous' },
  removeBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.danger },

  separator: { height: 1, backgroundColor: CoachColors.borderMuted, marginHorizontal: Spacing.lg },
  separatorModal: { height: 1, backgroundColor: CoachColors.borderMuted },

  // ── Picker ──
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  pickerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 19, color: CoachColors.textPrimary },
  pickerDone: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.accent },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, borderRadius: Radius.sm, borderCurve: 'continuous',
    paddingHorizontal: 12, height: 53,
  },
  searchInput: { flex: 1, fontFamily: CoachFonts.body, fontSize: 17, color: CoachColors.textPrimary, height: '100%' },

  filterChip: {
    flexShrink: 0, height: 36, paddingHorizontal: 12, borderRadius: 999, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
  },
  filterChipActive: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  filterChipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textSecondary },
  filterChipTextActive: { color: CoachColors.accent, fontFamily: CoachFonts.bodySemiBold },
  bodyMapChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bodyMapWrap: {
    alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    paddingVertical: Spacing.md, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: Radius.md, borderCurve: 'continuous',
  },
  bodyMapHint: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint, marginTop: 8 },

  resultCount: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint, paddingHorizontal: Spacing.lg, paddingBottom: 8 },

  exercisePickItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md },
  exercisePickIcon: {
    width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  exercisePickName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textPrimary },
  exercisePickSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2 },

  addCircle: {
    width: 30, height: 30, borderRadius: 15, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  addCircleActive: {
    width: 30, height: 30, borderRadius: 15, borderCurve: 'continuous', backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },

  createExerciseRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, marginTop: 8,
  },
  createExerciseRowText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.accent },

  // ── Modals shared ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: CoachColors.bg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.lg, paddingBottom: Spacing['3xl'], borderWidth: 1, borderColor: CoachColors.border, borderBottomWidth: 0,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary },
  modalLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textMuted, marginBottom: 8 },
  urlInputRow: { flexDirection: 'row', gap: 8 },
  urlInput: {
    flex: 1, backgroundColor: CoachColors.surface, borderRadius: Radius.sm, borderCurve: 'continuous', paddingHorizontal: Spacing.md, paddingVertical: 14,
    fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary, borderWidth: 1, borderColor: CoachColors.border,
  },
  urlPasteBtn: { width: 44, height: 44, borderRadius: Radius.sm, borderCurve: 'continuous', backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.xl },
  dividerLine: { flex: 1, height: 1, backgroundColor: CoachColors.borderMuted },
  dividerText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint },
  videoOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted },
  videoOptionIcon: { width: 38, height: 38, borderRadius: Radius.sm, borderCurve: 'continuous', backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  videoOptionTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  videoOptionSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2 },
  uploadingContainer: { alignItems: 'center', paddingVertical: Spacing['2xl'], gap: Spacing.md },
  uploadingText: { fontFamily: CoachFonts.bodyMedium, fontSize: 17, color: CoachColors.textSecondary },

  loadingCard: {
    backgroundColor: CoachColors.surface, borderRadius: Radius.lg, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border,
    paddingVertical: 36, paddingHorizontal: 32, alignItems: 'center', width: '80%', maxWidth: 320, alignSelf: 'center', marginBottom: 'auto', marginTop: 'auto',
  },
  loadingTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, marginBottom: 8, textAlign: 'center' },
  loadingSubtitle: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 20 },
  loadingCancel: { marginTop: 18, minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 },
  loadingCancelText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textSecondary, textAlign: 'center' },

  // ── Assign sheet (18g) ──
  assignSheet: {
    backgroundColor: CoachColors.bg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.lg, paddingBottom: Spacing['2xl'], borderWidth: 1, borderColor: CoachColors.border, borderBottomWidth: 0,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, borderCurve: 'continuous', backgroundColor: CoachColors.border, alignSelf: 'center', marginBottom: 18 },
  assignTitle: { fontFamily: CoachFonts.headingBold, fontSize: 21.5, color: CoachColors.textPrimary, marginBottom: 6 },
  assignSubtitle: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, lineHeight: 20 },
  assignEmptyText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, marginTop: Spacing.lg },

  clientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  clientAvatar: { width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous', backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  clientAvatarImg: { width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous' },
  clientAvatarText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textSecondary },
  clientName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  clientSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2 },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderCurve: 'continuous', borderWidth: 1.5, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  radioCircleActive: { borderColor: CoachColors.accent },
  radioDot: { width: 11, height: 11, borderRadius: 6, borderCurve: 'continuous', backgroundColor: CoachColors.accent },

  passTrackRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, marginTop: 8, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  passTrackRowText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },

  notNowText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },
  assignFootnote: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint, textAlign: 'center', lineHeight: 18, marginTop: 4 },
});
