import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useApp, sanitizeCategory } from '../context/AppContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useAlert } from '../context/AlertContext';
import { supabase, SUPABASE_URL } from '../lib/supabase';

const CATEGORIES = ['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Cardio', 'Full Body', 'Flexibility'];
const MUSCLE_GROUPS = [
  'Pectorals', 'Latissimus Dorsi', 'Quadriceps', 'Hamstrings', 'Glutes',
  'Biceps', 'Triceps', 'Deltoids', 'Trapezius', 'Abs', 'Obliques', 'Calves', 'Cardiovascular'
];
const EQUIPMENT_OPTIONS = ['Barbell', 'Dumbbell', 'Machine', 'Cables', 'Kettlebell', 'Bands', 'Bodyweight', 'Plate', 'None'];

export default function CreateExerciseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [autoFilled, setAutoFilled] = useState(false);

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
      showAlert({ type: 'warning', title: 'Permission needed', message: 'Gallery access is required.' });
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

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('You are signed out. Sign in and try again.');

      const objectName = `exercise-img-${Date.now()}.${ext}`;
      // exercise-videos only accepts writes under `{auth uid}/…`.
      const fileName = `${session.user.id}/${objectName}`;

      const formData = new FormData();
      // Field name must be non-empty — '' is rejected by the storage API.
      formData.append('file', {
        uri: asset.uri,
        name: objectName,
        type: asset.mimeType || 'image/jpeg',
      } as any);

      // `(supabase as any).supabaseUrl` is not public API and can be
      // undefined, producing a request to "undefined/storage/v1/...".
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
        let detail = `${uploadRes.status}`;
        try {
          const body = await uploadRes.json();
          detail = body?.message || body?.error || detail;
        } catch { /* non-JSON body — keep the status */ }
        throw new Error(`Upload failed (${detail})`);
      }
      const { data: urlData } = supabase.storage.from('exercise-videos').getPublicUrl(fileName);
      setImageUrl(urlData.publicUrl);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Upload failed', message: err.message || 'Failed to upload image' });
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
        // Validate response against allowed lists before setting state
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

        setAutoFilled(true);
      }
    } catch (err: any) {
      console.error('Exercise generation error:', err);
      setAutoFilled(false);
      showAlert({
        type: 'error',
        title: 'Auto-fill failed',
        message: err.message && !err.message.includes('generate-exercise')
          ? err.message
          : 'Could not auto-fill this exercise. Please fill it in manually.'
      });
    } finally {
      setGenerating(false);
    }
  };

  // Auto-trigger generation if passed via params (from the workout builder's
  // "Not here? Create an exercise" flow)
  useEffect(() => {
    if (params.autoGenerate === 'true' && params.initialName) {
      handleGenerateAI(params.initialName as string);
    }
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert({ type: 'warning', title: 'Name required', message: 'Please enter an exercise name.' });
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
          title: 'Exercise updated',
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
          title: 'Exercise created',
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
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={s.headerBack} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={25} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>{editId ? 'Edit exercise' : 'New exercise'}</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Name */}
            <Section label="Name">
              <View style={s.nameRow}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="e.g. Landmine Press"
                  placeholderTextColor={CoachColors.textFaint}
                  value={name}
                  onChangeText={(t) => { setName(t); setAutoFilled(false); }}
                  autoCapitalize="words"
                  selectionColor={CoachColors.accent}
                />
                <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                  style={[s.autoFillBtn, (!name.trim() || generating) && s.autoFillBtnDisabled]}
                  onPress={() => handleGenerateAI()}
                  disabled={!name.trim() || generating}
                  activeOpacity={0.7}
                >
                  {generating ? (
                    <ActivityIndicator size="small" color={CoachColors.accent} />
                  ) : (
                    <Text style={s.autoFillBtnText}>Auto-fill</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Section>

            {/* Auto-fill confirmation banner */}
            {autoFilled && !generating && (
              <View style={s.confirmBanner}>
                <Ionicons name="checkmark-circle" size={20} color={CoachColors.accent} />
                <Text style={s.confirmBannerText}>
                  Category, muscle group and instructions filled in from the name. Check them before saving.
                </Text>
              </View>
            )}

            {/* Category */}
            <Section label="Category">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipScroll}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                    key={cat}
                    style={[s.chip, category === cat && s.chipActive]}
                    onPress={() => setCategory(cat)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, category === cat && s.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Section>

            {/* Target muscle */}
            <Section label="Target muscle">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipScroll}>
                {MUSCLE_GROUPS.map((mg) => (
                  <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                    key={mg}
                    style={[s.chip, muscleGroup === mg && s.chipActive]}
                    onPress={() => setMuscleGroup(mg)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, muscleGroup === mg && s.chipTextActive]}>{mg}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Section>

            {/* Equipment */}
            <Section label="Equipment">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipScroll}>
                {EQUIPMENT_OPTIONS.map((eq) => (
                  <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                    key={eq}
                    style={[s.chip, equipment === eq && s.chipActive]}
                    onPress={() => setEquipment(eq)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, equipment === eq && s.chipTextActive]}>{eq}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Section>

            {/* Instructions */}
            <Section label="Instructions">
              <TextInput
                style={[s.input, s.textArea]}
                placeholder="Describe how to perform the movement safely and effectively..."
                placeholderTextColor={CoachColors.textFaint}
                value={instructions}
                onChangeText={setInstructions}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                selectionColor={CoachColors.accent}
              />
            </Section>

            {/* Photo / demo clip */}
            <TouchableOpacity style={s.mediaRow} onPress={handlePickImage} disabled={uploadingImage} activeOpacity={0.7}>
              {uploadingImage ? (
                <View style={s.mediaThumb}>
                  <ActivityIndicator color={CoachColors.accent} />
                </View>
              ) : imageUrl ? (
                <View style={s.mediaThumb}>
                  <Image source={{ uri: imageUrl }} style={s.mediaThumbImage} />
                  <View style={s.mediaEditBadge}>
                    <Ionicons name="pencil" size={12} color={CoachColors.onAccent} />
                  </View>
                </View>
              ) : (
                <View style={s.mediaThumb}>
                  <Ionicons name="image-outline" size={22} color={CoachColors.textFaint} />
                </View>
              )}
              <Text style={s.mediaRowText}>Add a photo or demo clip</Text>
              <Text style={s.mediaRowOptional}>Optional</Text>
            </TouchableOpacity>

            {/* Action buttons */}
            <View style={s.btnRow}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => router.back()}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                {saving ? (
                  <ActivityIndicator size="small" color={CoachColors.onAccent} />
                ) : (
                  <Text style={s.saveBtnText}>Save to library</Text>
                )}
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  headerBack: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
  },
  // paddingBottom is applied inline from the real bottom inset (pushed route: no tab bar).
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 22,
  },

  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  autoFillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
  },
  autoFillBtnDisabled: {
    borderColor: CoachColors.borderMuted,
    opacity: 0.6,
  },
  autoFillBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.accent,
  },

  confirmBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    borderRadius: 14,
    padding: 14,
    marginBottom: 22,
    marginTop: -6,
  },
  confirmBannerText: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: CoachColors.textPrimary,
  },

  input: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 17,
    fontFamily: CoachFonts.body,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  textArea: {
    height: 132,
    paddingTop: 14,
  },

  chipScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: CoachColors.accentSofter,
    borderColor: CoachColors.accent,
  },
  chipText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },
  chipTextActive: {
    color: CoachColors.accent,
  },

  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 14,
    marginBottom: 26,
  },
  mediaThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaThumbImage: {
    width: '100%',
    height: '100%',
  },
  mediaEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaRowText: {
    flex: 1,
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  mediaRowOptional: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textFaint,
  },

  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.surface,
  },
  cancelBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 15.5,
    color: CoachColors.onAccent,
  },
});
