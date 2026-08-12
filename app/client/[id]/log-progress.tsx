import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../../../context/AppContext';
import { useTheme } from '../../../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius, getAvatarColor } from '../../../constants/theme';
import Button from '../../../components/Button';
import { supabase } from '../../../lib/supabase';
import { decode } from 'base64-arraybuffer';

const ORANGE = '#FF6B35';

export default function LogProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
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
      if (photoBase64 && photoUri) {
        const ext = photoUri.split('.').pop()?.toLowerCase() || 'jpg';
        photoUrl = await uploadProgressPhoto(photoBase64, ext);
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

      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save progress.');
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: colors.bgElevated }]}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Log Progress</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.clientBadge}>
            {client.avatar_url ? (
              <View style={[styles.clientAvatar, { backgroundColor: '#333' }]} />
            ) : (
              <View style={[styles.clientAvatar, { backgroundColor: getAvatarColor(client.name) }]}>
                <Text style={styles.clientAvatarText}>{client.name.charAt(0)}</Text>
              </View>
            )}
            <Text style={[styles.clientName, { color: colors.textSecondary }]}>{client.name}</Text>
          </View>

          {/* Weight Field with Unit Toggle */}
          <View style={[styles.inputGroup, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={styles.inputHeader}>
              <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Weight</Text>
              <View style={styles.unitToggle}>
                <TouchableOpacity onPress={() => setUnit('lbs')} style={[styles.unitBtn, unit === 'lbs' && { backgroundColor: ORANGE }]}>
                  <Text style={[styles.unitText, unit === 'lbs' ? { color: '#000' } : { color: colors.textTertiary }]}>lbs</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setUnit('kg')} style={[styles.unitBtn, unit === 'kg' && { backgroundColor: ORANGE }]}>
                  <Text style={[styles.unitText, unit === 'kg' ? { color: '#000' } : { color: colors.textTertiary }]}>kg</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder={`e.g. ${unit === 'lbs' ? '185.5' : '84.1'}`}
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />
          </View>

          <View style={[styles.inputGroup, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Body Fat % (Optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={bodyFat}
              onChangeText={setBodyFat}
              keyboardType="decimal-pad"
              placeholder="e.g. 15.0"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          {/* Measurements Toggle */}
          <TouchableOpacity 
            style={[styles.measurementsToggle, { backgroundColor: colors.bgElevated }]} 
            onPress={() => setShowMeasurements(!showMeasurements)}
            activeOpacity={0.7}
          >
            <Ionicons name="body-outline" size={20} color={ORANGE} />
            <Text style={[styles.measurementsToggleText, { color: colors.textPrimary }]}>Add Body Measurements</Text>
            <Ionicons name={showMeasurements ? "chevron-up" : "chevron-down"} size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          {showMeasurements && (
            <View style={[styles.measurementsContainer, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={styles.measRow}>
                <View style={styles.measInputWrap}>
                  <Text style={[styles.measLabel, { color: colors.textSecondary }]}>Chest (in)</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
                    value={chest}
                    onChangeText={setChest}
                    keyboardType="decimal-pad"
                    placeholder="--"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={styles.measInputWrap}>
                  <Text style={[styles.measLabel, { color: colors.textSecondary }]}>Waist (in)</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
                    value={waist}
                    onChangeText={setWaist}
                    keyboardType="decimal-pad"
                    placeholder="--"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={styles.measInputWrap}>
                  <Text style={[styles.measLabel, { color: colors.textSecondary }]}>Arms (in)</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
                    value={arms}
                    onChangeText={setArms}
                    keyboardType="decimal-pad"
                    placeholder="--"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Photos */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: Spacing.md }]}>Progress Photo</Text>
          <TouchableOpacity 
            style={[styles.photoContainer, { backgroundColor: colors.bgElevated, borderColor: colors.border, borderStyle: photoUri ? 'solid' : 'dashed' }]}
            onPress={handlePickImage}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <View style={styles.photoIconRing}>
                  <Ionicons name="camera" size={24} color={ORANGE} />
                </View>
                <Text style={[styles.photoTitle, { color: colors.textPrimary }]}>Add Photo</Text>
                <Text style={[styles.photoSub, { color: colors.textTertiary }]}>Front, side, or back view</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Notes */}
          <View style={[styles.inputGroup, { backgroundColor: colors.bgCard, borderColor: colors.border, marginTop: Spacing.lg }]}>
            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Notes (Optional)</Text>
            <TextInput
              style={[styles.textArea, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="How is the client feeling? Energy levels, soreness, adherence..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={{ height: Spacing['4xl'] }} />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.bgPrimary, borderTopColor: colors.border }]}>
          <Button 
            title={saving ? "Saving..." : "Save Progress"} 
            onPress={handleSave} 
            loading={saving}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  closeBtn: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md },
  
  scrollContent: { padding: Spacing.lg },
  
  clientBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl, alignSelf: 'center' },
  clientAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  clientAvatarText: { color: '#FFF', fontSize: 12, fontFamily: FontFamily.bodyBold },
  clientName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },

  inputGroup: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.md },
  inputHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  inputLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  unitToggle: { flexDirection: 'row', backgroundColor: '#111', borderRadius: Radius.sm, overflow: 'hidden' },
  unitBtn: { paddingHorizontal: Spacing.md, paddingVertical: 4 },
  unitText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },
  
  input: { height: 48, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, fontFamily: FontFamily.body, fontSize: FontSize.base },
  textArea: { minHeight: 100, borderRadius: Radius.sm, padding: Spacing.md, fontFamily: FontFamily.body, fontSize: FontSize.base },

  measurementsToggle: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  measurementsToggleText: { flex: 1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, marginLeft: Spacing.sm },

  measurementsContainer: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.md },
  measRow: { flexDirection: 'row', gap: Spacing.md },
  measInputWrap: { flex: 1 },
  measLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginBottom: 4 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, marginBottom: Spacing.sm },
  photoContainer: { height: 200, borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  photoIconRing: { width: 48, height: 48, borderRadius: 24, backgroundColor: `${ORANGE}20`, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  photoTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  photoSub: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 4, textAlign: 'center' },

  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl, borderTopWidth: 1 },
});
