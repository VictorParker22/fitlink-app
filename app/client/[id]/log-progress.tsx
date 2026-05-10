import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../../context/AppContext';
import { useTheme } from '../../../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../../constants/theme';
import Button from '../../../components/Button';

export default function LogProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { addProgressLog, getClientById } = useApp();

  const client = getClientById(id || '');

  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [arms, setArms] = useState('');
  const [notes, setNotes] = useState('');
  
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [saving, setSaving] = useState(false);

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

      await addProgressLog({
        client_id: id as string,
        date: new Date().toISOString().split('T')[0],
        weight: parseFloat(weight),
        body_fat: bodyFat ? parseFloat(bodyFat) : null,
        measurements: Object.keys(measurements).length > 0 ? measurements : null,
        notes: notes || null,
        photos: [], // Placeholder for future photo upload feature
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Log Check-in</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.clientBadge}>
            <Ionicons name="person-circle" size={24} color={Colors.purple} />
            <Text style={[styles.clientName, { color: colors.textSecondary }]}>{client.name}</Text>
          </View>

          {/* Core Metrics */}
          <View style={[styles.inputGroup, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Weight (lbs)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="e.g. 185.5"
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
            <Ionicons name="body-outline" size={20} color={Colors.purple} />
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

          {/* Photos Placeholder */}
          <View style={[styles.photosPlaceholder, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
            <View style={styles.photoIconRing}>
              <Ionicons name="camera" size={24} color={Colors.purple} />
            </View>
            <Text style={[styles.photoTitle, { color: colors.textPrimary }]}>Progress Photos</Text>
            <Text style={[styles.photoSub, { color: colors.textTertiary }]}>Cloud storage configuration required.</Text>
          </View>

          <View style={{ height: Spacing['4xl'] }} />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.bgPrimary, borderTopColor: colors.border }]}>
          <Button 
            title="Save Progress" 
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
  clientName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },

  inputGroup: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.md },
  inputLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  input: { height: 48, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, fontFamily: FontFamily.body, fontSize: FontSize.base },
  textArea: { minHeight: 100, borderRadius: Radius.sm, padding: Spacing.md, fontFamily: FontFamily.body, fontSize: FontSize.base },

  measurementsToggle: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  measurementsToggleText: { flex: 1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, marginLeft: Spacing.sm },

  measurementsContainer: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.md },
  measRow: { flexDirection: 'row', gap: Spacing.md },
  measInputWrap: { flex: 1 },
  measLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginBottom: 4 },

  photosPlaceholder: { alignItems: 'center', padding: Spacing.xl, borderRadius: Radius.md, borderWidth: 1, borderStyle: 'dashed', marginTop: Spacing.lg },
  photoIconRing: { width: 48, height: 48, borderRadius: 24, backgroundColor: `${Colors.purple}20`, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  photoTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  photoSub: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 4, textAlign: 'center' },

  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl, borderTopWidth: 1 },
});
