import { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useApp, sanitizeCategory, sanitizeEquipment } from '../context/AppContext';
import { Spacing, FontFamily, FontSize, Radius, Colors } from '../constants/theme';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';

const CATEGORIES = ['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Cardio', 'Full Body', 'Flexibility'];
const MUSCLE_GROUPS = [
  'Pectorals', 'Latissimus Dorsi', 'Quadriceps', 'Hamstrings', 'Glutes', 
  'Biceps', 'Triceps', 'Deltoids', 'Trapezius', 'Abs', 'Obliques', 'Calves', 'Cardiovascular'
];
const EQUIPMENT_OPTIONS = ['Barbell', 'Dumbbell', 'Machine', 'Cables', 'Kettlebell', 'Bands', 'Bodyweight', 'Plate', 'None'];

export default function CreateExerciseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const editId = params.editId as string | undefined;
  
  const { exercises, createExercise, updateExercise } = useApp();
  const { showAlert } = useAlert();

  const [name, setName] = useState((params.initialName as string) || '');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [muscleGroup, setMuscleGroup] = useState(MUSCLE_GROUPS[0]);
  const [equipment, setEquipment] = useState(EQUIPMENT_OPTIONS[0]);
  const [instructions, setInstructions] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (editId && exercises.length > 0) {
      const existing = exercises.find(e => e.id === editId);
      if (existing) {
        setName(existing.name);
        
        // Find closest matching category
        const matchCat = CATEGORIES.find(c => c.toLowerCase() === existing.category.toLowerCase());
        if (matchCat) setCategory(matchCat);
        
        // Find closest matching muscle group
        const matchMuscle = MUSCLE_GROUPS.find(m => m.toLowerCase() === existing.muscle_group.toLowerCase());
        if (matchMuscle) setMuscleGroup(matchMuscle);
        
        // Find closest matching equipment
        if (existing.equipment) {
          const matchEq = EQUIPMENT_OPTIONS.find(eq => existing.equipment && eq.toLowerCase().includes(existing.equipment.toLowerCase()));
          if (matchEq) setEquipment(matchEq);
        }
        
        setInstructions(existing.instructions || '');
        setImageUrl(existing.image_url || null);
      }
    }
  }, [editId, exercises]);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert({ type: 'warning', title: 'Permission Needed', message: 'Gallery access is required.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    
    setUploadingImage(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      const fileName = `exercise-img-${Date.now()}.${ext}`;
      
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      
      const formData = new FormData();
      formData.append('', {
        uri: asset.uri,
        name: fileName,
        type: asset.mimeType || 'image/jpeg',
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

      if (!uploadRes.ok) throw new Error('Upload failed');
      const { data: urlData } = supabase.storage.from('exercise-videos').getPublicUrl(fileName);
      setImageUrl(urlData.publicUrl);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Upload Failed', message: err.message || 'Failed to upload image' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerateAI = async (overrideName?: string) => {
    const targetName = overrideName || name;
    if (!targetName.trim()) return;

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-exercise', {
        body: { name: targetName.trim() }
      });

      if (error) throw error;
      if (data) {
        // Validate AI response against allowed lists before setting state
        if (data.category) {
          const matchCat = CATEGORIES.find(c => c.toLowerCase() === data.category.toLowerCase());
          if (matchCat) {
            setCategory(matchCat);
          } else {
            // Fuzzy match via sanitizer, then map back to display value
            const sanitized = sanitizeCategory(data.category);
            const fallback = CATEGORIES.find(c => c.toLowerCase() === sanitized) || CATEGORIES[7]; // 'Full Body'
            setCategory(fallback);
          }
        }
        if (data.muscle_group) {
          const matchMuscle = MUSCLE_GROUPS.find(m => m.toLowerCase() === data.muscle_group.toLowerCase());
          setMuscleGroup(matchMuscle || MUSCLE_GROUPS[0]);
        }
        if (data.equipment) {
          const matchEq = EQUIPMENT_OPTIONS.find(eq => eq.toLowerCase() === data.equipment.toLowerCase());
          setEquipment(matchEq || EQUIPMENT_OPTIONS[8]); // 'None'
        }
        if (data.instructions) setInstructions(data.instructions);
        
        showAlert({
          type: 'success',
          title: 'Success!',
          message: `Generated details for "${name.trim()}".`
        });
      }
    } catch (err: any) {
      console.error('AI Generation Error:', err);
      showAlert({
        type: 'error',
        title: 'AI Generation Failed',
        message: err.message || 'Could not auto-fill this exercise. Please fill it in manually.'
      });
    } finally {
      setGenerating(false);
    }
  };

  // Auto-trigger AI generation if passed via params
  useEffect(() => {
    if (params.autoGenerate === 'true' && params.initialName) {
      handleGenerateAI(params.initialName as string);
    }
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert({ type: 'warning', title: 'Name Required', message: 'Please enter an exercise name.' });
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        await updateExercise(
          editId,
          name.trim(),
          category,
          muscleGroup,
          equipment === 'None' ? undefined : equipment,
          instructions.trim() || undefined,
          imageUrl || undefined
        );
        showAlert({
          type: 'success',
          title: 'Exercise Updated!',
          message: `"${name.trim()}" has been updated.`,
          buttons: [{ text: 'OK', onPress: () => router.back() }]
        });
      } else {
        await createExercise(
          name.trim(),
          category,
          muscleGroup,
          equipment === 'None' ? undefined : equipment,
          instructions.trim() || undefined,
          imageUrl || undefined
        );
        showAlert({
          type: 'success',
          title: 'Exercise Created!',
          message: `"${name.trim()}" has been added to your library.`,
          buttons: [{ text: 'OK', onPress: () => router.back() }]
        });
      }
    } catch (err: any) {
      console.error(err);
      showAlert({ type: 'error', title: 'Error', message: String(err?.message || 'Failed to save exercise') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{editId ? 'Edit Exercise' : 'New Exercise'}</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            
            {/* Image Upload */}
            <View style={styles.imageUploadContainer}>
              <TouchableOpacity style={styles.imageUploadBtn} onPress={handlePickImage} disabled={uploadingImage}>
                {uploadingImage ? (
                  <ActivityIndicator color="#FF6B35" />
                ) : imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={32} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.imagePlaceholderText}>Add Photo</Text>
                  </View>
                )}
                {imageUrl && (
                  <View style={styles.editImageOverlay}>
                    <Ionicons name="pencil" size={16} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Exercise Name */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>EXERCISE NAME</Text>
                <TouchableOpacity
                  style={[styles.aiBtn, (!name.trim() || generating) && styles.aiBtnDisabled]}
                  onPress={() => handleGenerateAI()}
                  disabled={!name.trim() || generating}
                  activeOpacity={0.7}
                >
                  {generating ? (
                    <ActivityIndicator size="small" color="#000000" style={{ transform: [{ scale: 0.8 }] }} />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={12} color="#000000" />
                      <Text style={styles.aiBtnText}>Auto-Fill with AI</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. Incline Dumbbell Press"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                selectionColor="#FFFFFF"
              />
            </View>

            {/* Category selection chips */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, category === cat && styles.chipActive]}
                    onPress={() => setCategory(cat)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Muscle Group selection chips */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>TARGET MUSCLE GROUP</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {MUSCLE_GROUPS.map((mg) => (
                  <TouchableOpacity
                    key={mg}
                    style={[styles.chip, muscleGroup === mg && styles.chipActive]}
                    onPress={() => setMuscleGroup(mg)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, muscleGroup === mg && styles.chipTextActive]}>{mg}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Equipment selection chips */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>EQUIPMENT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {EQUIPMENT_OPTIONS.map((eq) => (
                  <TouchableOpacity
                    key={eq}
                    style={[styles.chip, equipment === eq && styles.chipActive]}
                    onPress={() => setEquipment(eq)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, equipment === eq && styles.chipTextActive]}>{eq}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Instructions */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>INSTRUCTIONS (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Provide a step-by-step description of how to perform the movement safely and effectively..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={instructions}
                onChangeText={setInstructions}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                selectionColor="#FFFFFF"
              />
            </View>

            {/* Action buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => router.back()}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.saveBtnText}>{editId ? 'Save Changes' : 'Create Exercise'}</Text>
                )}
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
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
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['2xl'] + 40,
  },
  imageUploadContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  imageUploadBtn: {
    width: 120,
    height: 120,
    borderRadius: Radius.sm,
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  editImageOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 6,
    borderRadius: Radius.xs,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1.5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.xs,
  },
  aiBtnDisabled: {
    opacity: 0.5,
  },
  aiBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: '#000000',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 0,
    paddingVertical: Spacing.sm,
    fontFamily: FontFamily.bodyMedium,
    fontSize: 16,
    color: '#FFFFFF',
  },
  textArea: {
    height: 100,
    paddingTop: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.xs,
    backgroundColor: '#050505',
  },
  chipScroll: {
    gap: 8,
    paddingVertical: Spacing.xs,
  },
  chip: {
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  chipText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
  },
  chipTextActive: {
    fontFamily: FontFamily.headingExtraBold,
    color: '#000000',
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0A0A',
  },
  cancelBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: Radius.sm,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#000000',
    letterSpacing: 1,
  },
});
