import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import type { ThemeColors } from '../constants/theme';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const PLAN_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];

export default function CreatePlanModal() {
  const router = useRouter();
  const { createPlan } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [period, setPeriod] = useState('month');
  const [featureInput, setFeatureInput] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [color, setColor] = useState(PLAN_COLORS[0]);
  const [isPopular, setIsPopular] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAddFeature = () => {
    const trimmed = featureInput.trim();
    if (trimmed && !features.includes(trimmed)) {
      setFeatures([...features, trimmed]);
      setFeatureInput('');
    }
  };

  const handleRemoveFeature = (feat: string) => {
    setFeatures(features.filter(f => f !== feat));
  };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Error', 'Plan name is required');
    if (!price || isNaN(Number(price))) return Alert.alert('Error', 'Valid price is required');

    setLoading(true);
    try {
      await createPlan(name.trim(), Number(price), period, features, color, isPopular);
      router.back();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to create plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <View style={{ width: 36 }} />
        <Text style={styles.headerTitle}>New Plan</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        {/* Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Plan Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Pro Coaching"
            placeholderTextColor={colors.textTertiary}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </View>

        {/* Price & Interval */}
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Price ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Billing Period</Text>
            <View style={styles.periodToggle}>
              <TouchableOpacity
                style={[styles.periodBtn, period === 'month' && styles.periodBtnActive]}
                onPress={() => setPeriod('month')}
              >
                <Text style={[styles.periodText, period === 'month' && styles.periodTextActive]}>Month</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.periodBtn, period === 'year' && styles.periodBtnActive]}
                onPress={() => setPeriod('year')}
              >
                <Text style={[styles.periodText, period === 'year' && styles.periodTextActive]}>Year</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Features */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Features (Optional)</Text>
          <View style={styles.featureInputRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="e.g. Weekly check-ins"
              placeholderTextColor={colors.textTertiary}
              value={featureInput}
              onChangeText={setFeatureInput}
              onSubmitEditing={handleAddFeature}
            />
            <TouchableOpacity style={styles.addFeatureBtn} onPress={handleAddFeature}>
              <Ionicons name="add" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
          {features.length > 0 && (
            <View style={styles.featureChips}>
              {features.map((feat, i) => (
                <View key={i} style={styles.featureChip}>
                  <Text style={styles.featureChipText}>{feat}</Text>
                  <TouchableOpacity onPress={() => handleRemoveFeature(feat)} style={{ marginLeft: 4 }}>
                    <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Color Picker */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Brand Color</Text>
          <View style={styles.colorRow}>
            {PLAN_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorCircle, { backgroundColor: c }, color === c && styles.colorCircleActive]}
                onPress={() => setColor(c)}
              >
                {color === c && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Popular Toggle */}
        <View style={styles.inputGroup}>
          <TouchableOpacity 
            style={styles.toggleRow} 
            activeOpacity={0.7} 
            onPress={() => setIsPopular(!isPopular)}
          >
            <View style={styles.toggleTextCol}>
              <Text style={styles.toggleLabel}>Mark as "Popular"</Text>
              <Text style={styles.toggleDesc}>Highlights this plan for clients</Text>
            </View>
            <View style={[styles.checkbox, isPopular && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
              {isPopular && <Ionicons name="checkmark" size={14} color="#FFF" />}
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={loading ? 'Creating...' : 'Create Plan'}
          onPress={handleSave}
          disabled={loading}
          full
        />
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  closeBtn: { padding: 4 },
  
  scrollContent: { padding: Spacing.lg },
  
  inputGroup: { marginBottom: Spacing.xl },
  row: { flexDirection: 'row', gap: Spacing.md },
  label: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary, marginBottom: Spacing.sm },
  input: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textPrimary,
  },

  periodToggle: {
    flexDirection: 'row', backgroundColor: colors.bgSecondary,
    borderRadius: Radius.md, padding: 4, borderWidth: 1, borderColor: colors.border,
  },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  periodBtnActive: { backgroundColor: colors.bgElevated, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  periodText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textSecondary },
  periodTextActive: { color: colors.textPrimary },

  featureInputRow: { flexDirection: 'row', gap: Spacing.sm },
  addFeatureBtn: { width: 46, height: 46, borderRadius: Radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  featureChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  featureChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: colors.border },
  featureChipText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textPrimary },

  colorRow: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  colorCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  colorCircleActive: { borderWidth: 3, borderColor: colors.bgPrimary, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgSecondary, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border },
  toggleTextCol: { flex: 1 },
  toggleLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary },
  toggleDesc: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },

  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgPrimary },
});
