import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useClient } from '../../../context/ClientContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

interface QuickWeightLogProps {
  latestWeight?: number;
  unit?: string;
  onLogComplete?: () => void;
}

export default function QuickWeightLog({ latestWeight = 165, unit = 'lbs', onLogComplete }: QuickWeightLogProps) {
  const { logProgress } = useClient();
  const [weightVal, setWeightVal] = useState<string>(latestWeight ? String(latestWeight) : '165');
  const [isLoggedToday, setIsLoggedToday] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const repeatRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const startRepeat = useCallback((delta: number) => {
    // First tick already happened via onPress — start repeating after 400ms hold
    const timer = setTimeout(() => {
      repeatRef.current = setInterval(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setWeightVal(prev => {
          const current = parseFloat(prev) || 165;
          const updated = Math.max(50, Math.min(500, +(current + delta).toFixed(1)));
          return String(updated);
        });
      }, 150);
    }, 400);
    repeatRef.current = timer as any;
  }, []);

  const stopRepeat = useCallback(() => {
    clearTimeout(repeatRef.current as any);
    clearInterval(repeatRef.current as any);
  }, []);

  useEffect(() => {
    if (latestWeight) {
      setWeightVal(String(latestWeight));
    }
  }, [latestWeight]);

  const adjustWeight = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = parseFloat(weightVal) || 165;
    const updated = Math.max(50, Math.min(500, +(current + delta).toFixed(1)));
    setWeightVal(String(updated));
  };

  const handleSave = async () => {
    const val = parseFloat(weightVal);
    if (!val || isNaN(val)) {
      Alert.alert('Invalid weight', 'Please enter a valid weight number.');
      return;
    }

    try {
      setIsSubmitting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await logProgress({ weight: val });
      setIsLoggedToday(true);
      if (onLogComplete) onLogComplete();
    } catch (err: any) {
      Alert.alert('Log failed', err?.message || 'Could not save weight log.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoggedToday) {
    return (
      <View style={st.loggedContainer}>
        <Ionicons name="checkmark-circle" size={18} color={CoachColors.accent} />
        <Text style={st.loggedText}>
          Weight logged today: <Text style={{ fontFamily: CoachFonts.headingBold, color: CoachColors.textPrimary }}>{weightVal} {unit}</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <View style={st.headerRow}>
        <Text style={st.sectionTag}>Biometrics // weight entry</Text>
        <Text style={st.unitLabel}>{unit}</Text>
      </View>

      <View style={st.logRow}>
        <TouchableOpacity hitSlop={2}
          style={st.stepBtn}
          activeOpacity={0.7}
          onPress={() => adjustWeight(-0.5)}
          onLongPress={() => startRepeat(-0.5)}
          onPressOut={stopRepeat}
          delayLongPress={300}
        >
          <Ionicons name="remove" size={18} color={CoachColors.textPrimary} />
        </TouchableOpacity>

        <View style={st.inputWrapper}>
          <TextInput
            style={st.input}
            keyboardType="decimal-pad"
            value={weightVal}
            onChangeText={setWeightVal}
            selectTextOnFocus
            maxLength={5}
          />
          <Text style={st.inputUnit}>{unit}</Text>
        </View>

        <TouchableOpacity hitSlop={2}
          style={st.stepBtn}
          activeOpacity={0.7}
          onPress={() => adjustWeight(0.5)}
          onLongPress={() => startRepeat(0.5)}
          onPressOut={stopRepeat}
          delayLongPress={300}
        >
          <Ionicons name="add" size={18} color={CoachColors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity hitSlop={2}
          style={[st.saveBtn, isSubmitting && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={isSubmitting}
          onPress={handleSave}
        >
          <Text style={st.saveBtnText}>{isSubmitting ? '...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  unitLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.bg,
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  input: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    textAlign: 'center',
    minWidth: 50,
  },
  inputUnit: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  saveBtn: {
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 11,
    color: CoachColors.onAccent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  loggedContainer: {
    marginHorizontal: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CoachColors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.3)',
  },
  loggedText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textSecondary,
    letterSpacing: 1,
  },
});
