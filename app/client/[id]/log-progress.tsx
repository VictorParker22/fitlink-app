import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../../../context/AppContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { getAvatarColor } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';
import { decode } from 'base64-arraybuffer';

const ACCENT = CoachColors.accent;

export default function LogProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { addProgressLog, getClientById } = useApp();

  const client = getClientById(id || '');

  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'lbs' | 'kg'>('lbs');
  const [bodyFat, setBodyFat] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [arms, setArms] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 ?? null);
    }
  };

  const uploadProgressPhoto = async (base64: string, ext: string): Promise<string | null> => {
    try {
      const fileName = `${id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('progress-photos')
        .upload(fileName, decode(base64), { contentType: `image/${ext}`, upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err) {
      if (__DEV__) console.warn('[log-progress] photo upload failed, saving without photo:', err);
      return null;
    }
  };

  const handleSave = async () => {
    if (!weight) {
      Alert.alert('Required', 'Please enter a weight.');
      return;
    }

    setSaving(true);
    try {
      const measurements: any = {};
      if (chest) measurements.chest = parseFloat(chest);
      if (waist) measurements.waist = parseFloat(waist);
      if (arms) measurements.arms = parseFloat(arms);

      // Convert weight to lbs for storage if entered in kg
      const weightValue = parseFloat(weight);
      const finalWeight = unit === 'kg' ? weightValue * 2.20462 : weightValue;

      // Upload photo to Supabase Storage if one was picked
      let photoUrl: string | null = null;
      let photoDropped = false;
      if (photoBase64 && photoUri) {
        const ext = photoUri.split('.').pop()?.toLowerCase() || 'jpg';
        photoUrl = await uploadProgressPhoto(photoBase64, ext);
        // The upload failing used to be completely silent: the entry saved
        // without the photo and the screen closed as if nothing had happened.
        photoDropped = !photoUrl;
      }

      await addProgressLog({
        client_id: id as string,
        date: new Date().toISOString().split('T')[0],
        weight: parseFloat(finalWeight.toFixed(1)),
        body_fat: bodyFat ? parseFloat(bodyFat) : null,
        measurements: Object.keys(measurements).length > 0 ? measurements : null,
        notes: notes || null,
        photos: photoUrl ? [photoUrl] : [],
      });

      if (photoDropped) {
        Alert.alert(
          'Saved without the photo',
          'The measurements were saved, but the photo could not be uploaded. You can add it again from this screen.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
        return;
      }
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save progress.');
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: CoachColors.bg }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: CoachColors.surface }]} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: CoachColors.textPrimary }]}>Log progress</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.clientBadge}>
            {client.avatar_url ? (
              <View style={[styles.clientAvatar, { backgroundColor: CoachColors.borderMuted }]} />
            ) : (
              <View style={[styles.clientAvatar, { backgroundColor: getAvatarColor(client.name) }]}>
                <Text style={styles.clientAvatarText}>{client.name.charAt(0)}</Text>
              </View>
            )}
            <Text style={[styles.clientName, { color: CoachColors.textSecondary }]}>{client.name}</Text>
          </View>

          {/* Weight Field with Unit Toggle */}
          <View style={[styles.inputGroup, { backgroundColor: CoachColors.surface, borderColor: CoachColors.border }]}>
            <View style={styles.inputHeader}>
              <Text style={[styles.inputLabel, { color: CoachColors.textPrimary }]}>Weight</Text>
              <View style={styles.unitToggle}>
                <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }} onPress={() => setUnit('lbs')} style={[styles.unitBtn, unit === 'lbs' && { backgroundColor: ACCENT }]}>
                  <Text style={[styles.unitText, unit === 'lbs' ? { color: CoachColors.onAccent } : { color: CoachColors.textMuted }]}>lbs</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }} onPress={() => setUnit('kg')} style={[styles.unitBtn, unit === 'kg' && { backgroundColor: ACCENT }]}>
                  <Text style={[styles.unitText, unit === 'kg' ? { color: CoachColors.onAccent } : { color: CoachColors.textMuted }]}>kg</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              style={[styles.input, { color: CoachColors.textPrimary, backgroundColor: CoachColors.borderMuted }]}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder={`e.g. ${unit === 'lbs' ? '185.5' : '84.1'}`}
              placeholderTextColor={CoachColors.textMuted}
              autoFocus
            />
          </View>

          <View style={[styles.inputGroup, { backgroundColor: CoachColors.surface, borderColor: CoachColors.border }]}>
            <Text style={[styles.inputLabel, { color: CoachColors.textPrimary }]}>Body fat % (optional)</Text>
            <TextInput
              style={[styles.input, { color: CoachColors.textPrimary, backgroundColor: CoachColors.borderMuted }]}
              value={bodyFat}
              onChangeText={setBodyFat}
              keyboardType="decimal-pad"
              placeholder="e.g. 15.0"
              placeholderTextColor={CoachColors.textMuted}
            />
          </View>

          {/* Measurements Toggle */}
          <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.measurementsToggle, { backgroundColor: CoachColors.surface }]} 
            onPress={() => setShowMeasurements(!showMeasurements)}
            activeOpacity={0.7}
          >
            <Ionicons name="body-outline" size={20} color={ACCENT} />
            <Text style={[styles.measurementsToggleText, { color: CoachColors.textPrimary }]}>Add body measurements</Text>
            <Ionicons name={showMeasurements ? "chevron-up" : "chevron-down"} size={20} color={CoachColors.textMuted} />
          </TouchableOpacity>

          {showMeasurements && (
            <View style={[styles.measurementsContainer, { backgroundColor: CoachColors.surface, borderColor: CoachColors.border }]}>
              <View style={styles.measRow}>
                <View style={styles.measInputWrap}>
                  <Text style={[styles.measLabel, { color: CoachColors.textSecondary }]}>Chest (in)</Text>
                  <TextInput
                    style={[styles.input, { color: CoachColors.textPrimary, backgroundColor: CoachColors.borderMuted }]}
                    value={chest}
                    onChangeText={setChest}
                    keyboardType="decimal-pad"
                    placeholder="--"
                    placeholderTextColor={CoachColors.textMuted}
                  />
                </View>
                <View style={styles.measInputWrap}>
                  <Text style={[styles.measLabel, { color: CoachColors.textSecondary }]}>Waist (in)</Text>
                  <TextInput
                    style={[styles.input, { color: CoachColors.textPrimary, backgroundColor: CoachColors.borderMuted }]}
                    value={waist}
                    onChangeText={setWaist}
                    keyboardType="decimal-pad"
                    placeholder="--"
                    placeholderTextColor={CoachColors.textMuted}
                  />
                </View>
                <View style={styles.measInputWrap}>
                  <Text style={[styles.measLabel, { color: CoachColors.textSecondary }]}>Arms (in)</Text>
                  <TextInput
                    style={[styles.input, { color: CoachColors.textPrimary, backgroundColor: CoachColors.borderMuted }]}
                    value={arms}
                    onChangeText={setArms}
                    keyboardType="decimal-pad"
                    placeholder="--"
                    placeholderTextColor={CoachColors.textMuted}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Photos */}
          <Text style={[styles.sectionTitle, { color: CoachColors.textPrimary, marginTop: 10 }]}>Progress photo</Text>
          <TouchableOpacity 
            style={[styles.photoContainer, { backgroundColor: CoachColors.surface, borderColor: CoachColors.border, borderStyle: photoUri ? 'solid' : 'dashed' }]}
            onPress={handlePickImage}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <View style={styles.photoIconRing}>
                  <Ionicons name="camera" size={24} color={ACCENT} />
                </View>
                <Text style={[styles.photoTitle, { color: CoachColors.textPrimary }]}>Add photo</Text>
                <Text style={[styles.photoSub, { color: CoachColors.textMuted }]}>Front, side, or back view</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Notes */}
          <View style={[styles.inputGroup, { backgroundColor: CoachColors.surface, borderColor: CoachColors.border, marginTop: 16 }]}>
            <Text style={[styles.inputLabel, { color: CoachColors.textPrimary }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.textArea, { color: CoachColors.textPrimary, backgroundColor: CoachColors.borderMuted }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="How is the client feeling? Energy levels, soreness, adherence..."
              placeholderTextColor={CoachColors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={{ height: 56 }} />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: CoachColors.bg, borderTopColor: CoachColors.border }]}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Save progress"
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save progress'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  closeBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18 },
  
  scrollContent: { padding: 16 },
  
  clientBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20, alignSelf: 'center' },
  clientAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  clientAvatarText: { color: CoachColors.textPrimary, fontSize: 12, fontFamily: CoachFonts.bodyBold },
  clientName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15 },

  inputGroup: { padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  inputHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  inputLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15 },
  unitToggle: { flexDirection: 'row', backgroundColor: CoachColors.bg, borderRadius: 8, overflow: 'hidden' },
  unitBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  unitText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13 },
  
  input: { height: 48, borderRadius: 8, paddingHorizontal: 10, fontFamily: CoachFonts.body, fontSize: 17 },
  textArea: { minHeight: 100, borderRadius: 8, padding: 10, fontFamily: CoachFonts.body, fontSize: 17 },

  measurementsToggle: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, marginBottom: 10 },
  measurementsToggleText: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 15, marginLeft: 6 },

  measurementsContainer: { padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  measRow: { flexDirection: 'row', gap: 10 },
  measInputWrap: { flex: 1 },
  measLabel: { fontFamily: CoachFonts.body, fontSize: 13, marginBottom: 4 },

  sectionTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, marginBottom: 6 },
  photoContainer: { height: 200, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  photoIconRing: { width: 48, height: 48, borderRadius: 24, backgroundColor: CoachColors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  photoTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15 },
  photoSub: { fontFamily: CoachFonts.body, fontSize: 13, marginTop: 4, textAlign: 'center' },

  footer: { padding: 16, paddingBottom: 20, borderTopWidth: 1 },

  saveBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999, minHeight: 52,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 15,
  },
  saveBtnText: { fontFamily: CoachFonts.headingBold, fontSize: 16, color: CoachColors.onAccent },
});
