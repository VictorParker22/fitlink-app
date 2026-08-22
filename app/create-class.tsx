import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Switch } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { WizardTopBar, WizardHeading, TakingShape, GhostSlot } from '../components/wizard/WizardChrome';
import CardImage from '../components/ui/CardImage';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useApp } from '../context/AppContext';
import { Spacing, Radius } from '../constants/theme';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useAlert } from '../context/AlertContext';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { useAndroidBack } from '../hooks/useAndroidBack';

const CLASS_CATEGORIES = [
  'Meditation', 'Strength', 'Pilates', 'Running', 'Yoga', 'HIIT',
  'Cycling', 'Boxing', 'Barre', 'Stretching', 'Recovery', 'Dance', 'Conditioning'
];

const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const TAGS_LIST = ['Full Body', 'Upper Body', 'Lower Body', 'Core', 'Cardio', 'Treadmill', 'Outdoor', 'Morning', 'Evening', 'No Equipment', 'Guided Audio'];
const EQUIPMENT_LIST = ['Bodyweight', 'Dumbbell', 'Barbell', 'Bands', 'Kettlebell', 'Mat', 'Foam Roller', 'Bike', 'Treadmill'];

const STEP_HEADINGS: Record<number, { kicker: string; title: string }> = {
  1: { kicker: 'New class · The basics', title: 'Name the class' },
  2: { kicker: 'New class · The footage', title: 'Put it on film' },
  3: { kicker: 'New class · The release', title: 'Who gets to press play?' },
};

export default function CreateClassScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();
  const { editId } = params;
  const insets = useSafeAreaInsets();

  const { classes, createClass, updateClass, workouts, plans, trainer } = useApp();
  const { showAlert } = useAlert();

  const reducedMotion = useReducedMotion();
  const [wizardStep, setWizardStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

  // Step 1
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CLASS_CATEGORIES[1]);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1]);
  const [duration, setDuration] = useState(30);
  const [tags, setTags] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);

  // Step 2
  const [videoUrl, setVideoUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [workoutId, setWorkoutId] = useState('');

  // Step 3
  const [isFree, setIsFree] = useState(false);
  const [planId, setPlanId] = useState('');

  // UI state
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState('');

  useEffect(() => {
    if (editId && classes.length > 0) {
      const existing = classes.find(c => c.id === editId);
      if (existing) {
        setTitle(existing.title);
        setDescription(existing.description || '');
        setCategory(existing.category);
        setDifficulty(existing.difficulty);
        setDuration(existing.duration_minutes);
        setTags(existing.tags || []);
        setEquipment(existing.equipment || []);
        setVideoUrl(existing.video_url || '');
        setThumbnailUrl(existing.thumbnail_url || '');
        setWorkoutId(existing.workout_id || '');
        setIsFree(existing.is_free || false);
        setPlanId(existing.plan_id || '');
      }
    }
  }, [editId, classes]);

  const toggleTag = (t: string) => {
    Haptics.selectionAsync();
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const toggleEquipment = (eq: string) => {
    Haptics.selectionAsync();
    setEquipment(prev => prev.includes(eq) ? prev.filter(x => x !== eq) : [...prev, eq]);
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (wizardStep === 1) {
      if (!title.trim()) {
        showAlert({ type: 'warning', title: 'Missing Details', message: 'Please provide a title for the class.' });
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      setWizardStep(3);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (wizardStep > 1) {
      setWizardStep(wizardStep - 1);
    } else {
      router.back();
    }
  };

  // Android hardware back steps the wizard back rather than discarding it.
  useAndroidBack(useCallback(() => {
    if (wizardStep <= 1) return false;
    setWizardStep(wizardStep - 1);
    return true;
  }, [wizardStep]));

  const MAX_BYTES: Record<'class-thumbnails' | 'class-videos', number> = {
    'class-videos': 500 * 1024 * 1024, // matches the bucket's file_size_limit
    'class-thumbnails': 10 * 1024 * 1024,
  };

  const uploadFile = async (asset: ImagePicker.ImagePickerAsset, bucket: 'class-thumbnails' | 'class-videos') => {
    const ext = (asset.uri.split('.').pop() || (bucket === 'class-videos' ? 'mp4' : 'jpg')).toLowerCase();
    const objectName = `${bucket}-${Date.now()}.${ext}`;

    // Refuse oversized files up front with a real number, rather than letting
    // the server reject them after a long upload.
    const size = (asset as any).fileSize as number | undefined;
    const limit = MAX_BYTES[bucket];
    if (typeof size === 'number' && size > limit) {
      const mb = (n: number) => Math.round(n / (1024 * 1024));
      throw new Error(
        `That file is ${mb(size)} MB and the limit is ${mb(limit)} MB. Trim it and try again.`,
      );
    }

    // NOTE: do NOT fetch(asset.uri).blob() here. That pulls the entire video
    // into JS memory before uploading — a phone-recorded clip is hundreds of
    // MB and it froze the app (the blob was never even used). FormData streams
    // straight from the file URI instead.
    const formData = new FormData();
    // The field name must be non-empty; it was '' before, which the storage
    // API rejects.
    formData.append('file', {
      uri: asset.uri,
      name: objectName,
      type: asset.mimeType || (bucket === 'class-videos' ? 'video/mp4' : 'image/jpeg'),
    } as any);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('You are signed out. Sign in and try again.');

    // class-videos / class-thumbnails only accept writes under `{auth uid}/…`.
    const fileName = `${session.user.id}/${objectName}`;

    // `(supabase as any).supabaseUrl` is not public API and can be undefined,
    // which produced a request to "undefined/storage/v1/...".
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${fileName}`,
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
      // Surface what the server actually said — "Upload failed" told the coach
      // nothing while the real answer was a missing bucket.
      let detail = `${uploadRes.status}`;
      try {
        const body = await uploadRes.json();
        if (body?.message) detail = body.message;
        else if (body?.error) detail = body.error;
      } catch {
        // non-JSON body — keep the status code
      }
      throw new Error(`Upload failed (${detail})`);
    }
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const handleThumbnailUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      aspect: [16, 9],
      allowsEditing: true,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploadingMedia(true);
    try {
      const url = await uploadFile(result.assets[0], 'class-thumbnails');
      setThumbnailUrl(url);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Upload Failed', message: err.message || 'Failed to upload image' });
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleVideoUpload = async (useCamera: boolean = false) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['videos'],
      quality: 0.7,
    };

    let result;
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showAlert({ type: 'warning', title: 'Permission needed', message: 'Camera permission is required.' });
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (result.canceled || !result.assets[0]) return;

    // Close the source sheet BEFORE the upload. Showing an alert while this
    // native Modal is still visible is the documented iOS double-modal freeze
    // this codebase has been bitten by before — and on failure the sheet used
    // to stay open underneath the alert.
    setShowVideoModal(false);
    setUploadingMedia(true);
    try {
      const url = await uploadFile(result.assets[0], 'class-videos');
      setVideoUrl(url);
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Video not uploaded',
        message: err.message || 'Failed to upload video',
      });
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSave = async (status: 'draft' | 'published') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!title.trim()) {
      showAlert({ type: 'warning', title: 'Missing Title', message: 'Please enter a title before saving.' });
      return;
    }

    // If publishing a Mux VOD, show special transferring state
    const isMuxTransfer = status === 'published' && videoUrl?.includes('stream.mux.com');

    setSaving(true);

    try {
      // Always save as draft first if it's a Mux transfer, let the Edge Function publish it
      const dbStatus = isMuxTransfer ? 'draft' : status;

      const payload = {
        title: title.trim(),
        description: description.trim(),
        category,
        difficulty,
        duration_minutes: duration,
        tags,
        equipment,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        workout_id: workoutId || undefined,
        is_free: isFree,
        plan_id: planId || undefined,
        status: dbStatus,
      };

      let classId = editId;
      if (editId) {
        await updateClass(editId, payload);
      } else {
        const newClass = await createClass(payload);
        classId = newClass.id;
      }

      if (isMuxTransfer && classId) {
        const { data, error } = await supabase.functions.invoke('transfer-vod', {
          body: { classId }
        });
        if (error || !data?.success) {
           throw new Error(error?.message || data?.error || 'Failed to start VOD processing. Class saved as draft.');
        }
        showAlert({ type: 'success', title: 'Processing', message: 'Your video is processing and will be published shortly!' });
      } else {
        showAlert({ type: 'success', title: editId ? 'Updated' : 'Created', message: `Class ${status === 'published' ? 'published' : 'saved as draft'}.` });
      }

      router.back();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to save class.' });
    } finally {
      setSaving(false);
    }
  };

  const stepInfo = STEP_HEADINGS[wizardStep];
  const entering = reducedMotion ? undefined : FadeInDown.duration(400);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        {/* Shared wizard chrome */}
        <View style={styles.chromeWrap}>
          <WizardTopBar step={wizardStep} totalSteps={3} onBack={handleBack} />
        </View>

        {/* Root-stack screen — no tab bar. Clear only the sticky footer (which
            renders on steps 1–2) plus the home indicator. */}
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: wizardStep < 3 ? Math.max(insets.bottom, Spacing.md) + 84 : insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {wizardStep === 1 && (
            <Animated.View entering={entering} style={styles.stepContainer}>
              <WizardHeading kicker={stepInfo.kicker} title={stepInfo.title} />

              <View style={[styles.inputGroup, { marginTop: 24 }]}>
                <View style={[styles.fieldWrap, titleFocused && styles.fieldWrapActive]}>
                  <Text style={[styles.fieldLabel, titleFocused && styles.fieldLabelActive]}>Title</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. 30 min full body HIIT"
                    placeholderTextColor={CoachColors.textFaint}
                    value={title}
                    onChangeText={setTitle}
                    onFocus={() => setTitleFocused(true)}
                    onBlur={() => setTitleFocused(false)}
                    selectionColor={CoachColors.accent}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={[styles.fieldWrap, descFocused && styles.fieldWrapActive]}>
                  <Text style={[styles.fieldLabel, descFocused && styles.fieldLabelActive]}>Description</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldTextArea]}
                    placeholder="What will athletes experience in this class?"
                    placeholderTextColor={CoachColors.textFaint}
                    value={description}
                    onChangeText={setDescription}
                    onFocus={() => setDescFocused(true)}
                    onBlur={() => setDescFocused(false)}
                    multiline
                    textAlignVertical="top"
                    selectionColor={CoachColors.accent}
                  />
                </View>
                <Text style={styles.charCount}>{description.length}/500</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Category</Text>
                <View style={styles.chipGrid}>
                  {CLASS_CATEGORIES.map(cat => {
                    const active = category === cat;
                    return (
                      <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                        key={cat}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => { Haptics.selectionAsync(); setCategory(cat); }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.rowGroup}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: Spacing.md }]}>
                  <Text style={styles.sectionLabel}>Difficulty</Text>
                  {DIFFICULTIES.map(diff => (
                    <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                      key={diff}
                      style={[styles.diffChip, difficulty === diff && styles.diffChipActive]}
                      onPress={() => { Haptics.selectionAsync(); setDifficulty(diff); }}
                    >
                      <Text style={[styles.diffChipText, difficulty === diff && styles.diffChipTextActive]}>{diff}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.sectionLabel}>Duration (min)</Text>
                  <View style={styles.stepperContainer}>
                    <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                      style={styles.stepperBtn}
                      onPress={() => { Haptics.selectionAsync(); setDuration(Math.max(5, duration - 5)); }}
                    >
                      <Ionicons name="remove" size={22} color={CoachColors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{duration}</Text>
                    <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                      style={styles.stepperBtn}
                      onPress={() => { Haptics.selectionAsync(); setDuration(Math.min(120, duration + 5)); }}
                    >
                      <Ionicons name="add" size={22} color={CoachColors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Equipment</Text>
                <View style={styles.chipGrid}>
                  {EQUIPMENT_LIST.map(eq => {
                    const active = equipment.includes(eq);
                    return (
                      <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                        key={eq}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleEquipment(eq)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{eq}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Tags</Text>
                <View style={styles.chipGrid}>
                  {TAGS_LIST.map(tag => {
                    const active = tags.includes(tag);
                    return (
                      <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                        key={tag}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleTag(tag)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{tag}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

            </Animated.View>
          )}

          {wizardStep === 2 && (
            <Animated.View entering={entering} style={styles.stepContainer}>
              <WizardHeading kicker={stepInfo.kicker} title={stepInfo.title} />

              <View style={[styles.inputGroup, { marginTop: 24 }]}>
                <Text style={styles.sectionLabel}>Class video</Text>
                {videoUrl ? (
                  <View style={styles.mediaContainer}>
                    <View style={styles.videoPreview}>
                      <View style={styles.videoPlayIcon}>
                        <Ionicons name="play" size={36} color={CoachColors.textPrimary} />
                      </View>
                      <Text style={styles.mediaUrlText} numberOfLines={1}>{videoUrl}</Text>
                      <TouchableOpacity style={styles.mediaClearBtn} onPress={() => setVideoUrl('')}>
                        <Ionicons name="close-circle" size={27} color={CoachColors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <GhostSlot label="Add class video" icon="videocam-outline" height={120} onPress={() => setShowVideoModal(true)} />
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Custom thumbnail (optional)</Text>
                {thumbnailUrl ? (
                  <View style={styles.mediaContainer}>
                    <View style={styles.thumbPreview}>
                      <Image source={{ uri: thumbnailUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                      <TouchableOpacity style={styles.mediaClearBtnAlt} onPress={() => setThumbnailUrl('')}>
                        <Ionicons name="close-circle" size={27} color={CoachColors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : uploadingMedia ? (
                  <View style={[styles.mediaContainer, { height: 120, alignItems: 'center', justifyContent: 'center' }]}>
                    <ActivityIndicator color={CoachColors.accent} />
                  </View>
                ) : (
                  <GhostSlot label="Upload thumbnail" icon="image-outline" height={120} onPress={handleThumbnailUpload} />
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Linked workout (optional)</Text>
                <Text style={styles.helperText}>Clients can view the structured workout alongside the video.</Text>
                {workouts && workouts.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {workouts.map(w => (
                      <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                        key={w.id}
                        style={[styles.workoutCard, workoutId === w.id && styles.workoutCardActive]}
                        onPress={() => setWorkoutId(workoutId === w.id ? '' : w.id)}
                      >
                        <Text style={[styles.workoutCardTitle, workoutId === w.id && styles.workoutCardTitleActive]}>{w.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.helperText}>You don't have any saved workouts yet.</Text>
                )}
              </View>
            </Animated.View>
          )}

          {wizardStep === 3 && (
            <Animated.View entering={entering} style={styles.stepContainer}>
              <WizardHeading kicker={stepInfo.kicker} title={stepInfo.title} />

              <View style={[styles.inputGroup, { marginTop: 24 }]}>
                <Text style={styles.sectionLabel}>Access level</Text>
                <View style={styles.rowGroup}>
                  <TouchableOpacity
                    style={[styles.accessCard, !isFree && styles.accessCardActive]}
                    onPress={() => setIsFree(false)}
                  >
                    <Ionicons name="lock-closed" size={27} color={!isFree ? CoachColors.accent : CoachColors.textFaint} />
                    <Text style={[styles.accessTitle, !isFree && styles.accessTitleActive]}>Subscribers only</Text>
                    <Text style={styles.accessSub}>Requires active pass</Text>
                  </TouchableOpacity>

                  <View style={{ width: Spacing.md }} />

                  <TouchableOpacity
                    style={[styles.accessCard, isFree && styles.accessCardActive]}
                    onPress={() => setIsFree(true)}
                  >
                    <Ionicons name="eye" size={27} color={isFree ? CoachColors.accent : CoachColors.textFaint} />
                    <Text style={[styles.accessTitle, isFree && styles.accessTitleActive]}>Free preview</Text>
                    <Text style={styles.accessSub}>Open to everyone</Text>
                  </TouchableOpacity>
                </View>
                {isFree && <Text style={styles.warningText}>Max 3 free classes allowed per coach.</Text>}
              </View>

              {/* The exact cinema card athletes see on the Explore shelf —
                  real state only; unset fields render as faint placeholders. */}
              <TakingShape />
              <View style={styles.cinemaCard}>
                <CardImage
                  source={thumbnailUrl ? { uri: thumbnailUrl } : require('../assets/images/session-bg.jpg')}
                  scrim="gradient"
                />
                <View style={styles.cinemaTopRow}>
                  <View style={styles.cinemaDraftPill}>
                    <Text style={styles.cinemaDraftText}>Draft</Text>
                  </View>
                  <View style={styles.cinemaDuration}>
                    <Text style={styles.cinemaDurationText}>{duration} min</Text>
                  </View>
                </View>
                <View style={styles.cinemaInfo}>
                  <Text style={styles.cinemaTags} numberOfLines={1}>
                    <Text style={{ color: CoachColors.accent }}>{category}</Text>
                    <Text style={styles.cinemaTagDot}>  •  {difficulty}</Text>
                  </Text>
                  <Text
                    style={[styles.cinemaTitle, !title.trim() && styles.cinemaTitleFaint]}
                    numberOfLines={2}
                  >
                    {title.trim() || 'Untitled class'}
                  </Text>
                  <Text
                    style={[styles.cinemaCoach, !trainer?.name && styles.cinemaTitleFaint]}
                    numberOfLines={1}
                  >
                    {trainer?.name || 'Your coach name'}
                  </Text>
                </View>
              </View>

              <View style={styles.publishBtnContainer}>
                <TouchableOpacity
                  style={styles.publishBtn}
                  onPress={() => handleSave('published')}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color={CoachColors.onAccent} /> : <Text style={styles.publishBtnText}>Publish class</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.draftBtn}
                  onPress={() => handleSave('draft')}
                  disabled={saving}
                >
                  <Text style={styles.draftBtnText}>Save as draft</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

        </ScrollView>

        {/* Footer Navigation */}
        {wizardStep < 3 && (
          <View style={[styles.footerRow, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>Next step</Text>
              <Ionicons name="arrow-forward" size={18} color={CoachColors.onAccent} />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Video Source Modal */}
      <Modal visible={showVideoModal} transparent animationType="slide" onRequestClose={() => setShowVideoModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add class video</Text>
              <TouchableOpacity hitSlop={12} onPress={() => setShowVideoModal(false)}>
                <Ionicons name="close" size={27} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.urlInputRow}>
              <TextInput
                style={styles.urlInput}
                placeholder="Paste YouTube or Vimeo URL..."
                placeholderTextColor={CoachColors.textFaint}
                value={videoUrlInput}
                onChangeText={setVideoUrlInput}
                selectionColor={CoachColors.accent}
              />
              <TouchableOpacity
                style={styles.urlSaveBtn}
                onPress={() => {
                  if(videoUrlInput) {
                    setVideoUrl(videoUrlInput);
                    setShowVideoModal(false);
                  }
                }}
              >
                <Ionicons name="checkmark" size={22} color={CoachColors.onAccent} />
              </TouchableOpacity>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.videoOptionBtn} onPress={() => handleVideoUpload(false)}>
              <Ionicons name="cloud-upload-outline" size={27} color={CoachColors.textPrimary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.videoOptionTitle}>Upload video file</Text>
                <Text style={styles.videoOptionSub}>MP4, MOV</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.videoOptionBtn} onPress={() => handleVideoUpload(true)}>
              <Ionicons name="camera-outline" size={27} color={CoachColors.textPrimary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.videoOptionTitle}>Record video</Text>
                <Text style={styles.videoOptionSub}>Use your camera</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  chromeWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  stepContainer: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  // Lime input treatment (add-client step-1 precedent): surface field with a
  // micro-label that lights up lime alongside the accent border on focus.
  fieldWrap: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 4,
  },
  fieldWrapActive: {
    borderColor: CoachColors.accent,
  },
  fieldLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: CoachColors.textFaint,
  },
  fieldLabelActive: {
    color: CoachColors.accent,
  },
  fieldInput: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    padding: 0,
  },
  fieldTextArea: {
    height: 108,
    textAlignVertical: 'top',
  },
  charCount: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textFaint,
    textAlign: 'right',
    marginTop: 4,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: CoachColors.accentSoft,
    borderColor: CoachColors.accent,
  },
  chipText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
  },
  chipTextActive: {
    color: CoachColors.accent,
    fontFamily: CoachFonts.bodySemiBold,
  },
  rowGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: Spacing.xl,
  },
  diffChip: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 999,
    borderCurve: 'continuous',
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  diffChipActive: {
    backgroundColor: CoachColors.accentSoft,
    borderColor: CoachColors.accent,
  },
  diffChipText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
  },
  diffChipTextActive: {
    color: CoachColors.accent,
    fontFamily: CoachFonts.bodySemiBold,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    padding: 8,
  },
  stepperBtn: {
    backgroundColor: CoachColors.borderMuted,
    padding: 10,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
  },
  stepperValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
  },
  footerRow: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.bg,
  },
  nextBtn: {
    backgroundColor: CoachColors.accent,
    paddingVertical: 16,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 17,
    color: CoachColors.onAccent,
  },
  mediaContainer: {
    height: 160,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  videoPreview: {
    flex: 1,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  videoPlayIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  mediaUrlText: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textSecondary,
    textAlign: 'center',
  },
  mediaClearBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  mediaClearBtnAlt: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  thumbPreview: {
    flex: 1,
    position: 'relative',
  },
  helperText: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textFaint,
    marginBottom: 8,
  },
  workoutCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 16,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    borderCurve: 'continuous',
    marginRight: 8,
  },
  workoutCardActive: {
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSoft,
  },
  workoutCardTitle: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
  },
  workoutCardTitleActive: {
    color: CoachColors.accent,
    fontFamily: CoachFonts.bodySemiBold,
  },
  accessCard: {
    flex: 1,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    padding: Spacing.md,
    alignItems: 'center',
  },
  accessCardActive: {
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSoft,
  },
  accessTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    marginTop: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  accessTitleActive: {
    color: CoachColors.accent,
  },
  accessSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    textAlign: 'center',
  },
  warningText: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.warning,
    marginTop: 8,
    textAlign: 'center',
  },
  // The Explore-shelf cinema card, verbatim (explore-classes.tsx classRow):
  // CardImage cover + scrim, duration mono pill top-left, honest draft pill.
  cinemaCard: {
    height: 200,
    marginTop: 16,
    marginBottom: Spacing.xl,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.surface,
    justifyContent: 'space-between',
    padding: 14,
  },
  cinemaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cinemaDuration: {
    backgroundColor: CoachColors.bg,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cinemaDurationText: {
    fontFamily: CoachFonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: CoachColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  cinemaDraftPill: {
    backgroundColor: CoachColors.surface,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cinemaDraftText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: CoachColors.textSecondary,
  },
  cinemaInfo: {
    gap: 4,
  },
  cinemaTags: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: CoachColors.textPrimary,
  },
  cinemaTagDot: {
    color: CoachColors.textSecondary,
  },
  cinemaTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 21,
    letterSpacing: -0.3,
    color: CoachColors.textPrimary,
    lineHeight: 25.5,
  },
  cinemaTitleFaint: {
    color: CoachColors.textFaint,
  },
  cinemaCoach: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textSecondary,
  },
  publishBtnContainer: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  publishBtn: {
    paddingVertical: 16,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    alignItems: 'center',
    backgroundColor: CoachColors.accent,
  },
  publishBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 17,
    color: CoachColors.onAccent,
  },
  draftBtn: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingVertical: 16,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  draftBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 17,
    color: CoachColors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CoachColors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
  },
  urlInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  urlInput: {
    flex: 1,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.md,
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  urlSaveBtn: {
    width: 48,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.accent,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: CoachColors.border,
  },
  dividerText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13.5,
    color: CoachColors.textFaint,
    marginHorizontal: 12,
  },
  videoOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.border,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    marginBottom: Spacing.sm,
  },
  videoOptionTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  videoOptionSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textFaint,
  },
});
