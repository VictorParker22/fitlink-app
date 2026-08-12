import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useClient } from '../../../context/ClientContext';
import { FontFamily, FontSize } from '../../../constants/theme';

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
      Alert.alert('Invalid Weight', 'Please enter a valid weight number.');
      return;
    }

    try {
      setIsSubmitting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await logProgress({ weight: val });
      setIsLoggedToday(true);
      if (onLogComplete) onLogComplete();
    } catch (err: any) {
      Alert.alert('Log Failed', err?.message || 'Could not save weight log.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoggedToday) {
    return (
      <View style={st.loggedContainer}>
        <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
        <Text style={st.loggedText}>
          WEIGHT LOGGED TODAY: <Text style={{ fontFamily: FontFamily.headingExtraBold, color: '#FFFFFF' }}>{weightVal} {unit.toUpperCase()}</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <View style={st.headerRow}>
        <Text style={st.sectionTag}>BIOMETRICS // WEIGHT ENTRY</Text>
        <Text style={st.unitLabel}>{unit.toUpperCase()}</Text>
      </View>

      <View style={st.logRow}>
        <TouchableOpacity
          style={st.stepBtn}
          activeOpacity={0.7}
          onPress={() => adjustWeight(-0.5)}
          onLongPress={() => startRepeat(-0.5)}
          onPressOut={stopRepeat}
          delayLongPress={300}
        >
          <Ionicons name="remove" size={18} color="#FFFFFF" />
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
          <Text style={st.inputUnit}>{unit.toUpperCase()}</Text>
        </View>

        <TouchableOpacity
          style={st.stepBtn}
          activeOpacity={0.7}
          onPress={() => adjustWeight(0.5)}
          onLongPress={() => startRepeat(0.5)}
          onPressOut={stopRepeat}
          delayLongPress={300}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[st.saveBtn, isSubmitting && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={isSubmitting}
          onPress={handleSave}
        >
          <Text style={st.saveBtnText}>{isSubmitting ? '...' : 'SAVE'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
  },
  unitLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#6C9BF2',
    letterSpacing: 1,
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
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111113',
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  input: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    minWidth: 50,
  },
  inputUnit: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 4,
  },
  saveBtn: {
    backgroundColor: '#1A1A1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  loggedContainer: {
    marginHorizontal: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0C0C0E',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  loggedText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
  },
});
