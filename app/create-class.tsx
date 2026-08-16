import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Switch } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { useApp } from '../context/AppContext';
import { Spacing, Radius } from '../constants/theme';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useAlert } from '../context/AlertContext';
import { supabase, SUPABASE_URL } from '../lib/supabase';

const CLASS_CATEGORIES = [
  'Meditation', 'Strength', 'Pilates', 'Running', 'Yoga', 'HIIT',
  'Cycling', 'Boxing', 'Barre', 'Stretching', 'Recovery', 'Dance', 'Conditioning'
];

const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const TAGS_LIST = ['Full Body', 'Upper Body', 'Lower Body', 'Core', 'Cardio', 'Treadmill', 'Outdoor', 'Morning', 'Evening', 'No Equipment', 'Guided Audio'];
const EQUIPMENT_LIST = ['Bodyweight', 'Dumbbell', 'Barbell', 'Bands', 'Kettlebell', 'Mat', 'Foam Roller', 'Bike', 'Treadmill'];

const STEP_TITLES: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Class details', subtitle: 'Step 1 of 3' },
  2: { title: 'Media & workout', subtitle: 'Step 2 of 3' },
  3: { title: 'Access & publish', subtitle: 'Step 3 of 3' },
};

export default function CreateClassScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();
  const { editId } = params;
  const insets = useSafeAreaInsets();

  const { classes, createClass, updateClass, workouts, plans, trainer } = useApp();
  const { showAlert } = useAlert();

  const [wizardStep, setWizardStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

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

  const MAX_BYTES: Record<'class-thumbnails' | 'class-videos', number> = {
    'class-videos': 500 * 1024 * 1024, // matches the bucket's file_size_limit
    'class-thumbnails': 10 * 1024 * 1024,
  };

  const uploadFile = async (asset: ImagePicker.ImagePickerAsset, bucket: 'class-thumbnails' | 'class-videos') => {
    const ext = (asset.uri.split('.').pop() || (bucket === 'class-videos' ? 'mp4' : 'jpg')).toLowerCase();
    const fileName = `${bucket}-${Date.now()}.${ext}`;

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
      name: fileName,
      type: asset.mimeType || (bucket === 'class-videos' ? 'video/mp4' : 'image/jpeg'),
    } as any);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('You are signed out. Sign in and try again.');

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

  const stepInfo = STEP_TITLES[wizardStep];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name={wizardStep === 1 ? 'close' : 'chevron-back'} size={24} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.stepIndicator}>
            {[1, 2, 3].map(step => (
              <View
                key={step}
                style={[
                  styles.stepDot,
                  wizardStep >= step ? styles.stepDotSeen : null,
                  wizardStep === step && styles.stepDotActive,
                ]}
              />
            ))}
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {wizardStep === 1 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>{stepInfo.title}</Text>
              <Text style={styles.stepSubtitle}>{stepInfo.subtitle}</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 30 Min Full Body HIIT"
                  placeholderTextColor={CoachColors.textFaint}
                  value={title}
                  onChangeText={setTitle}
                  selectionColor={CoachColors.accent}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="What will users experience in this class?"
                  placeholderTextColor={CoachColors.textFaint}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlignVertical="top"
                  selectionColor={CoachColors.accent}
                />
                <Text style={styles.charCount}>{description.length}/500</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Category</Text>
                <View style={styles.chipGrid}>
                  {CLASS_CATEGORIES.map(cat => {
                    const active = category === cat;
                    return (
                      <TouchableOpacity
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
                    <TouchableOpacity
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
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => { Haptics.selectionAsync(); setDuration(Math.max(5, duration - 5)); }}
                    >
                      <Ionicons name="remove" size={20} color={CoachColors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{duration}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => { Haptics.selectionAsync(); setDuration(Math.min(120, duration + 5)); }}
                    >
                      <Ionicons name="add" size={20} color={CoachColors.textPrimary} />
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
                      <TouchableOpacity
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
                      <TouchableOpacity
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

            </View>
          )}

          {wizardStep === 2 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>{stepInfo.title}</Text>
              <Text style={styles.stepSubtitle}>{stepInfo.subtitle}</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Class video</Text>
                <View style={styles.mediaContainer}>
                  {videoUrl ? (
                    <View style={styles.videoPreview}>
                      <View style={styles.videoPlayIcon}>
                        <Ionicons name="play" size={32} color={CoachColors.textPrimary} />
                      </View>
                      <Text style={styles.mediaUrlText} numberOfLines={1}>{videoUrl}</Text>
                      <TouchableOpacity style={styles.mediaClearBtn} onPress={() => setVideoUrl('')}>
                        <Ionicons name="close-circle" size={24} color={CoachColors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addMediaBtn} onPress={() => setShowVideoModal(true)}>
                      <Ionicons name="videocam-outline" size={32} color={CoachColors.textFaint} />
                      <Text style={styles.addMediaText}>Add class video</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Custom thumbnail (optional)</Text>
                <View style={styles.mediaContainer}>
                  {thumbnailUrl ? (
                    <View style={styles.thumbPreview}>
                      <Image source={{ uri: thumbnailUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                      <TouchableOpacity style={styles.mediaClearBtnAlt} onPress={() => setThumbnailUrl('')}>
                        <Ionicons name="close-circle" size={24} color={CoachColors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addMediaBtn} onPress={handleThumbnailUpload} disabled={uploadingMedia}>
                      {uploadingMedia ? (
                        <ActivityIndicator color={CoachColors.accent} />
                      ) : (
                        <>
                          <Ionicons name="image-outline" size={32} color={CoachColors.textFaint} />
                          <Text style={styles.addMediaText}>Upload thumbnail</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Linked workout (optional)</Text>
                <Text style={styles.helperText}>Clients can view the structured workout alongside the video.</Text>
                {workouts && workouts.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {workouts.map(w => (
                      <TouchableOpacity
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
            </View>
          )}

          {wizardStep === 3 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>{stepInfo.title}</Text>
              <Text style={styles.stepSubtitle}>{stepInfo.subtitle}</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Access level</Text>
                <View style={styles.rowGroup}>
                  <TouchableOpacity
                    style={[styles.accessCard, !isFree && styles.accessCardActive]}
                    onPress={() => setIsFree(false)}
                  >
                    <Ionicons name="lock-closed" size={24} color={!isFree ? CoachColors.accent : CoachColors.textFaint} />
                    <Text style={[styles.accessTitle, !isFree && styles.accessTitleActive]}>Subscribers only</Text>
                    <Text style={styles.accessSub}>Requires active pass</Text>
                  </TouchableOpacity>

                  <View style={{ width: Spacing.md }} />

                  <TouchableOpacity
                    style={[styles.accessCard, isFree && styles.accessCardActive]}
                    onPress={() => setIsFree(true)}
                  >
                    <Ionicons name="eye" size={24} color={isFree ? CoachColors.accent : CoachColors.textFaint} />
                    <Text style={[styles.accessTitle, isFree && styles.accessTitleActive]}>Free preview</Text>
                    <Text style={styles.accessSub}>Open to everyone</Text>
                  </TouchableOpacity>
                </View>
                {isFree && <Text style={styles.warningText}>Max 3 free classes allowed per coach.</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Preview</Text>
                <View style={styles.previewCard}>
                  {thumbnailUrl ? (
                    <Image source={{ uri: thumbnailUrl }} style={styles.previewImg} contentFit="cover" />
                  ) : (
                    <View style={styles.previewImgPlaceholder}>
                      <Ionicons name="play" size={32} color={CoachColors.textFaint} />
                    </View>
                  )}
                  <View style={styles.previewContent}>
                    <View style={styles.previewBadge}>
                      <Text style={styles.previewBadgeText}>{category}</Text>
                    </View>
                    <Text style={styles.previewTitle} numberOfLines={2}>{title || 'Untitled class'}</Text>
                    <Text style={styles.previewMeta}>{duration} min • {difficulty} • {trainer?.name || 'Coach'}</Text>
                  </View>
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
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Footer Navigation */}
        {wizardStep < 3 && (
          <View style={[styles.footerRow, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>Next step</Text>
              <Ionicons name="arrow-forward" size={16} color={CoachColors.onAccent} />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Video Source Modal */}
      <Modal visible={showVideoModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add class video</Text>
              <TouchableOpacity onPress={() => setShowVideoModal(false)}>
                <Ionicons name="close" size={24} color={CoachColors.textPrimary} />
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
                <Ionicons name="checkmark" size={20} color={CoachColors.onAccent} />
              </TouchableOpacity>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.videoOptionBtn} onPress={() => handleVideoUpload(false)}>
              <Ionicons name="cloud-upload-outline" size={24} color={CoachColors.textPrimary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.videoOptionTitle}>Upload video file</Text>
                <Text style={styles.videoOptionSub}>MP4, MOV</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.videoOptionBtn} onPress={() => handleVideoUpload(true)}>
              <Ionicons name="camera-outline" size={24} color={CoachColors.textPrimary} style={{ marginRight: 12 }} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  backBtn: {
    padding: 8,
  },
  stepIndicator: {
    flexDirection: 'row',
    gap: 8,
  },
  stepDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoachColors.borderMuted,
  },
  stepDotSeen: {
    backgroundColor: CoachColors.textFaint,
  },
  stepDotActive: {
    backgroundColor: CoachColors.accent,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.textSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  textArea: {
    height: 100,
  },
  charCount: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
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
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: CoachColors.accentSoft,
    borderColor: CoachColors.accent,
  },
  chipText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13,
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
    borderRadius: Radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  diffChipActive: {
    backgroundColor: CoachColors.accentSoft,
    borderColor: CoachColors.accent,
  },
  diffChipText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13,
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
    padding: 8,
  },
  stepperBtn: {
    backgroundColor: CoachColors.borderMuted,
    padding: 10,
    borderRadius: Radius.xs,
  },
  stepperValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.onAccent,
  },
  mediaContainer: {
    height: 160,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  addMediaBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  addMediaText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14,
    color: CoachColors.textSecondary,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  mediaUrlText: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
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
  },
  thumbPreview: {
    flex: 1,
    position: 'relative',
  },
  helperText: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textFaint,
    marginBottom: 8,
  },
  workoutCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.sm,
    marginRight: 8,
  },
  workoutCardActive: {
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSoft,
  },
  workoutCardTitle: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14,
    color: CoachColors.textPrimary,
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
    padding: Spacing.md,
    alignItems: 'center',
  },
  accessCardActive: {
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSoft,
  },
  accessTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
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
    fontSize: 11,
    color: CoachColors.textFaint,
    textAlign: 'center',
  },
  warningText: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.warning,
    marginTop: 8,
    textAlign: 'center',
  },
  previewCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  previewImg: {
    width: '100%',
    height: 180,
  },
  previewImgPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContent: {
    padding: Spacing.md,
  },
  previewBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: CoachColors.accentSoft,
    marginBottom: 8,
  },
  previewBadgeText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.accent,
  },
  previewTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  previewMeta: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
  },
  publishBtnContainer: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  publishBtn: {
    paddingVertical: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    backgroundColor: CoachColors.accent,
  },
  publishBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.onAccent,
  },
  draftBtn: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingVertical: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  draftBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
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
    fontSize: 18,
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
    paddingHorizontal: Spacing.md,
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },
  urlSaveBtn: {
    width: 48,
    borderRadius: Radius.sm,
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
    fontSize: 12,
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
    marginBottom: Spacing.sm,
  },
  videoOptionTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  videoOptionSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textFaint,
  },
});
