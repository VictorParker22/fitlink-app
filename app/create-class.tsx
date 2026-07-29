import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Switch } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { useApp } from '../context/AppContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import { getCategoryColor, CATEGORY_COLORS } from '../data/categoryColors';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';

const CLASS_CATEGORIES = [
  'Meditation', 'Strength', 'Pilates', 'Running', 'Yoga', 'HIIT', 
  'Cycling', 'Boxing', 'Barre', 'Stretching', 'Recovery', 'Dance', 'Conditioning'
];

const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const TAGS_LIST = ['Full Body', 'Upper Body', 'Lower Body', 'Core', 'Cardio', 'Treadmill', 'Outdoor', 'Morning', 'Evening', 'No Equipment', 'Guided Audio'];
const EQUIPMENT_LIST = ['Bodyweight', 'Dumbbell', 'Barbell', 'Bands', 'Kettlebell', 'Mat', 'Foam Roller', 'Bike', 'Treadmill'];

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
  
  const uploadFile = async (asset: ImagePicker.ImagePickerAsset, bucket: 'class-thumbnails' | 'class-videos') => {
    const ext = asset.uri.split('.').pop() || (bucket === 'class-videos' ? 'mp4' : 'jpg');
    const fileName = `${bucket}-${Date.now()}.${ext}`;
    
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    
    const formData = new FormData();
    formData.append('', {
      uri: asset.uri,
      name: fileName,
      type: asset.mimeType || (bucket === 'class-videos' ? 'video/mp4' : 'image/jpeg'),
    } as any);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const uploadRes = await fetch(
      `${(supabase as any).supabaseUrl}/storage/v1/object/${bucket}/${fileName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'x-upsert': 'true',
        },
        body: formData,
      }
    );

    if (!uploadRes.ok) throw new Error('Upload failed');
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
    
    setUploadingMedia(true);
    try {
      const url = await uploadFile(result.assets[0], 'class-videos');
      setVideoUrl(url);
      setShowVideoModal(false);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Upload Failed', message: err.message || 'Failed to upload video' });
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

  const catColor = getCategoryColor(category);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name={wizardStep === 1 ? 'close' : 'chevron-back'} size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.stepIndicator}>
            {[1, 2, 3].map(step => (
              <View 
                key={step} 
                style={[
                  styles.stepDot, 
                  wizardStep >= step ? styles.stepDotActive : null,
                  wizardStep === step && { backgroundColor: catColor, borderColor: catColor }
                ]} 
              />
            ))}
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {wizardStep === 1 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>CLASS DETAILS // 1</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>TITLE</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 30 Min Full Body HIIT"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={title}
                  onChangeText={setTitle}
                  selectionColor={catColor}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>DESCRIPTION</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="What will users experience in this class?"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlignVertical="top"
                  selectionColor={catColor}
                />
                <Text style={styles.charCount}>{description.length}/500</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>CATEGORY</Text>
                <View style={styles.chipGrid}>
                  {CLASS_CATEGORIES.map(cat => {
                    const active = category === cat;
                    const color = getCategoryColor(cat);
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
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
                  <Text style={styles.tagHeader}>DIFFICULTY</Text>
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
                  <Text style={styles.tagHeader}>DURATION (MIN)</Text>
                  <View style={styles.stepperContainer}>
                    <TouchableOpacity 
                      style={styles.stepperBtn} 
                      onPress={() => { Haptics.selectionAsync(); setDuration(Math.max(5, duration - 5)); }}
                    >
                      <Ionicons name="remove" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{duration}</Text>
                    <TouchableOpacity 
                      style={styles.stepperBtn} 
                      onPress={() => { Haptics.selectionAsync(); setDuration(Math.min(120, duration + 5)); }}
                    >
                      <Ionicons name="add" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>EQUIPMENT</Text>
                <View style={styles.chipGrid}>
                  {EQUIPMENT_LIST.map(eq => {
                    const active = equipment.includes(eq);
                    return (
                      <TouchableOpacity
                        key={eq}
                        style={[styles.chip, active && styles.multiChipActive]}
                        onPress={() => toggleEquipment(eq)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{eq}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>TAGS</Text>
                <View style={styles.chipGrid}>
                  {TAGS_LIST.map(tag => {
                    const active = tags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[styles.chip, active && styles.multiChipActive]}
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
              <Text style={styles.stepTitle}>MEDIA & WORKOUT // 2</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>CLASS VIDEO</Text>
                <View style={styles.mediaContainer}>
                  {videoUrl ? (
                    <View style={styles.videoPreview}>
                      <View style={styles.videoPlayIcon}>
                        <Ionicons name="play" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.mediaUrlText} numberOfLines={1}>{videoUrl}</Text>
                      <TouchableOpacity style={styles.mediaClearBtn} onPress={() => setVideoUrl('')}>
                        <Ionicons name="close-circle" size={24} color="#FF6B35" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addMediaBtn} onPress={() => setShowVideoModal(true)}>
                      <Ionicons name="videocam-outline" size={32} color="rgba(255,255,255,0.4)" />
                      <Text style={styles.addMediaText}>Add Class Video</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>CUSTOM THUMBNAIL (OPTIONAL)</Text>
                <View style={styles.mediaContainer}>
                  {thumbnailUrl ? (
                    <View style={styles.thumbPreview}>
                      <Image source={{ uri: thumbnailUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                      <TouchableOpacity style={styles.mediaClearBtnAlt} onPress={() => setThumbnailUrl('')}>
                        <Ionicons name="close-circle" size={24} color="#FF6B35" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addMediaBtn} onPress={handleThumbnailUpload} disabled={uploadingMedia}>
                      {uploadingMedia ? (
                        <ActivityIndicator color={catColor} />
                      ) : (
                        <>
                          <Ionicons name="image-outline" size={32} color="rgba(255,255,255,0.4)" />
                          <Text style={styles.addMediaText}>Upload Thumbnail</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>LINKED WORKOUT (OPTIONAL)</Text>
                <Text style={styles.helperText}>Clients can view the structured workout alongside the video.</Text>
                {workouts && workouts.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {workouts.map(w => (
                      <TouchableOpacity 
                        key={w.id} 
                        style={[styles.workoutCard, workoutId === w.id && { borderColor: catColor, backgroundColor: 'rgba(255,255,255,0.05)' }]}
                        onPress={() => setWorkoutId(workoutId === w.id ? '' : w.id)}
                      >
                        <Text style={[styles.workoutCardTitle, workoutId === w.id && { color: catColor }]}>{w.name}</Text>
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
              <Text style={styles.stepTitle}>ACCESS & PUBLISH // 3</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>ACCESS LEVEL</Text>
                <View style={styles.rowGroup}>
                  <TouchableOpacity 
                    style={[styles.accessCard, !isFree && styles.accessCardActive]} 
                    onPress={() => setIsFree(false)}
                  >
                    <Ionicons name="lock-closed" size={24} color={!isFree ? catColor : "rgba(255,255,255,0.3)"} />
                    <Text style={[styles.accessTitle, !isFree && { color: catColor }]}>Subscribers Only</Text>
                    <Text style={styles.accessSub}>Requires active pass</Text>
                  </TouchableOpacity>
                  
                  <View style={{ width: Spacing.md }} />
                  
                  <TouchableOpacity 
                    style={[styles.accessCard, isFree && styles.accessCardActive]} 
                    onPress={() => setIsFree(true)}
                  >
                    <Ionicons name="eye" size={24} color={isFree ? catColor : "rgba(255,255,255,0.3)"} />
                    <Text style={[styles.accessTitle, isFree && { color: catColor }]}>Free Preview</Text>
                    <Text style={styles.accessSub}>Open to everyone</Text>
                  </TouchableOpacity>
                </View>
                {isFree && <Text style={styles.warningText}>Max 3 free classes allowed per coach.</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.tagHeader}>PREVIEW</Text>
                <View style={styles.previewCard}>
                  {thumbnailUrl ? (
                    <Image source={{ uri: thumbnailUrl }} style={styles.previewImg} contentFit="cover" />
                  ) : (
                    <View style={styles.previewImgPlaceholder}>
                      <Ionicons name="play" size={32} color="rgba(255,255,255,0.2)" />
                    </View>
                  )}
                  <View style={styles.previewContent}>
                    <View style={[styles.previewBadge, { backgroundColor: catColor }]}>
                      <Text style={styles.previewBadgeText}>{category.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.previewTitle} numberOfLines={2}>{title || 'Untitled Class'}</Text>
                    <Text style={styles.previewMeta}>{duration} min • {difficulty} • {trainer?.name || 'Coach'}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.publishBtnContainer}>
                <TouchableOpacity 
                  style={[styles.publishBtn, { backgroundColor: catColor }]}
                  onPress={() => handleSave('published')}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.publishBtnText}>PUBLISH CLASS</Text>}
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.draftBtn}
                  onPress={() => handleSave('draft')}
                  disabled={saving}
                >
                  <Text style={styles.draftBtnText}>SAVE AS DRAFT</Text>
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
              <Text style={styles.nextBtnText}>NEXT STEP</Text>
              <Ionicons name="arrow-forward" size={16} color="#000000" />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Video Source Modal */}
      <Modal visible={showVideoModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Class Video</Text>
              <TouchableOpacity onPress={() => setShowVideoModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.urlInputRow}>
              <TextInput
                style={styles.urlInput}
                placeholder="Paste YouTube or Vimeo URL..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={videoUrlInput}
                onChangeText={setVideoUrlInput}
                selectionColor={catColor}
              />
              <TouchableOpacity 
                style={[styles.urlSaveBtn, { backgroundColor: catColor }]}
                onPress={() => {
                  if(videoUrlInput) {
                    setVideoUrl(videoUrlInput);
                    setShowVideoModal(false);
                  }
                }}
              >
                <Ionicons name="checkmark" size={20} color="#000000" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.videoOptionBtn} onPress={() => handleVideoUpload(false)}>
              <Ionicons name="cloud-upload-outline" size={24} color="#FFFFFF" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.videoOptionTitle}>Upload Video File</Text>
                <Text style={styles.videoOptionSub}>MP4, MOV</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.videoOptionBtn} onPress={() => handleVideoUpload(true)}>
              <Ionicons name="camera-outline" size={24} color="#FFFFFF" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.videoOptionTitle}>Record Video</Text>
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
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
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
    backgroundColor: '#1C1C1E',
  },
  stepDotActive: {
    backgroundColor: 'rgba(255,255,255,0.5)',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  tagHeader: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: Spacing.md,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  textArea: {
    height: 100,
  },
  charCount: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'right',
    marginTop: 4,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  multiChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  chipText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  chipTextActive: {
    color: '#000000',
  },
  rowGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: Spacing.xl,
  },
  diffChip: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  diffChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  diffChipText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  diffChipTextActive: {
    color: '#000000',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: 8,
  },
  stepperBtn: {
    backgroundColor: '#1C1C1E',
    padding: 10,
    borderRadius: Radius.xs,
  },
  stepperValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
  },
  footerRow: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    backgroundColor: '#000000',
  },
  nextBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: Radius.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#000000',
    letterSpacing: 1,
  },
  mediaContainer: {
    height: 160,
    borderRadius: Radius.xs,
    overflow: 'hidden',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  addMediaBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  addMediaText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  videoPreview: {
    flex: 1,
    backgroundColor: '#1C1C1E',
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
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
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
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
  },
  workoutCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.xs,
    marginRight: 8,
  },
  workoutCardTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  accessCard: {
    flex: 1,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: Spacing.md,
    alignItems: 'center',
  },
  accessCardActive: {
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  accessTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    marginTop: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  accessSub: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  warningText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: '#FF6B35',
    marginTop: 8,
    textAlign: 'center',
  },
  previewCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    overflow: 'hidden',
  },
  previewImg: {
    width: '100%',
    height: 180,
  },
  previewImgPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContent: {
    padding: Spacing.md,
  },
  previewBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  previewBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: '#000000',
    letterSpacing: 1,
  },
  previewTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  previewMeta: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  publishBtnContainer: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  publishBtn: {
    paddingVertical: 16,
    borderRadius: Radius.xs,
    alignItems: 'center',
  },
  publishBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#000000',
    letterSpacing: 1,
  },
  draftBtn: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 16,
    borderRadius: Radius.xs,
    alignItems: 'center',
  },
  draftBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0C0C0E',
    borderTopLeftRadius: Radius.sm,
    borderTopRightRadius: Radius.sm,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  urlInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  urlInput: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.md,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
  },
  urlSaveBtn: {
    width: 48,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1C1C1E',
  },
  dividerText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    marginHorizontal: 12,
  },
  videoOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: Spacing.md,
    borderRadius: Radius.xs,
    marginBottom: Spacing.sm,
  },
  videoOptionTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  videoOptionSub: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
});
