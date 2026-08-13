import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useApp } from '../context/AppContext';
import { Spacing, FontFamily, Radius } from '../constants/theme';
import { useAlert } from '../context/AlertContext';

// ── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'HIIT', 'Strength', 'Yoga', 'Cycling', 'Pilates',
  'Running', 'Dance', 'Boxing', 'Meditation', 'Stretching',
];

const DURATIONS = [20, 30, 45, 60, 75, 90];

// ── Component ─────────────────────────────────────────────────────────────────
export default function CreateLiveClassScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { createLiveClass, updateLiveClass, liveClasses } = useApp();
  const { showAlert }       = useAlert();

  const editing = liveClasses.find((c) => c.id === editId) || null;
  const isEditMode = !!editId;

  // Form state — prefilled from the existing class when editing
  const [title,    setTitle]    = useState(editing?.title || '');
  const [desc,     setDesc]     = useState(editing?.description || '');
  const [category, setCategory] = useState<string | null>(editing?.category || null);
  const [duration, setDuration] = useState<number | null>(editing?.duration_minutes ?? 45);
  const [date,     setDate]     = useState<Date>(() => {
    if (editing?.scheduled_for) return new Date(editing.scheduled_for);
    // Default to tomorrow at 7:00 AM
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(7, 0, 0, 0);
    return d;
  });

  // UI state
  const [saving,          setSaving]          = useState(false);
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const [showTimePicker,  setShowTimePicker]  = useState(false);
  const [titleFocused,    setTitleFocused]    = useState(false);
  const [descFocused,     setDescFocused]     = useState(false);

  // ── Date/Time handlers ────────────────────────────────────────────────────
  const handleDateChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) {
      const merged = new Date(selected);
      merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
      setDate(merged);
    }
  };

  const handleTimeChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selected) {
      const merged = new Date(date);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setDate(merged);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSchedule = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!title.trim()) {
      showAlert({ type: 'warning', title: 'Missing Title', message: 'Give your class a name so attendees know what to expect.' });
      return;
    }
    if (date <= new Date()) {
      showAlert({ type: 'warning', title: 'Invalid Time', message: 'Please pick a time in the future.' });
      return;
    }

    setSaving(true);
    try {
      if (isEditMode && editing) {
        await updateLiveClass(editing.id, {
          title:            title.trim(),
          description:      desc.trim() || undefined,
          scheduled_for:    date.toISOString(),
          category:         category ?? undefined,
          duration_minutes: duration ?? undefined,
        });
        showAlert({ type: 'success', title: 'Class updated', message: 'Your changes have been saved.' });
      } else {
        await createLiveClass({
          title:            title.trim(),
          description:      desc.trim() || undefined,
          scheduled_for:    date.toISOString(),
          category:         category ?? undefined,
          duration_minutes: duration ?? undefined,
        });
        showAlert({ type: 'success', title: 'Class Scheduled!', message: 'Your class has been added to the Studio queue.' });
      }
      router.back();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Failed', message: err.message || 'Could not save the class.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Date/time display ─────────────────────────────────────────────────────
  const isToday     = new Date().toDateString() === date.toDateString();
  const isTomorrow  = (() => { const t = new Date(); t.setDate(t.getDate()+1); return t.toDateString() === date.toDateString(); })();
  const dateLabel   = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel   = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{isEditMode ? 'Edit class' : 'Schedule a Class'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Title ─────────────────────────────────────────────────── */}
          <Section label="CLASS TITLE">
            <TextInput
              style={[s.input, titleFocused && s.inputFocused]}
              placeholder="e.g. Saturday Morning HIIT"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={title}
              onChangeText={setTitle}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
              selectionColor="#FF6B35"
              returnKeyType="done"
            />
          </Section>

          {/* ── Category ──────────────────────────────────────────────── */}
          <Section label="CATEGORY">
            <View style={s.chipGrid}>
              {CATEGORIES.map(cat => (
                <Pressable
                  key={cat}
                  style={[s.chip, category === cat && s.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCategory(prev => prev === cat ? null : cat);
                  }}
                >
                  <Text style={[s.chipText, category === cat && s.chipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          {/* ── Date & Time ───────────────────────────────────────────── */}
          <Section label="DATE & TIME">
            <View style={s.dateRow}>
              <TouchableOpacity style={s.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={18} color="#FF6B35" />
                <Text style={s.dateBtnText}>{dateLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dateBtn} onPress={() => setShowTimePicker(true)} activeOpacity={0.8}>
                <Ionicons name="time-outline" size={18} color="#FF6B35" />
                <Text style={s.dateBtnText}>{timeLabel}</Text>
              </TouchableOpacity>
            </View>
          </Section>

          {/* ── Duration ──────────────────────────────────────────────── */}
          <Section label="DURATION (MINUTES)">
            <View style={s.durationRow}>
              {DURATIONS.map(min => (
                <Pressable
                  key={min}
                  style={[s.durationBtn, duration === min && s.durationBtnActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setDuration(min);
                  }}
                >
                  <Text style={[s.durationText, duration === min && s.durationTextActive]}>{min}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          {/* ── Description ───────────────────────────────────────────── */}
          <Section label="DESCRIPTION  ·  OPTIONAL">
            <TextInput
              style={[s.input, s.textArea, descFocused && s.inputFocused]}
              placeholder="What should attendees expect? Intensity, equipment, any warm-up required..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={desc}
              onChangeText={setDesc}
              onFocus={() => setDescFocused(true)}
              onBlur={() => setDescFocused(false)}
              multiline
              textAlignVertical="top"
              selectionColor="#FF6B35"
            />
          </Section>

        </ScrollView>

        {/* ── Footer CTA ───────────────────────────────────────────────── */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 80 + 12 }]}>
          <TouchableOpacity
            style={[s.ctaBtn, saving && s.ctaBtnDisabled]}
            onPress={handleSchedule}
            disabled={saving}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <Ionicons name="radio" size={18} color="#000000" />
                <Text style={s.ctaBtnText}>{isEditMode ? 'SAVE CHANGES' : 'SCHEDULE CLASS'}</Text>
                <Ionicons name="arrow-forward" size={16} color="#000000" />
              </>
            )}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* ── iOS Date Picker Modal ─────────────────────────────────────────── */}
      {showDatePicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" visible>
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
            <View style={s.pickerSheet}>
              <PickerHeader title="Select Date" onDone={() => setShowDatePicker(false)} />
              <DateTimePicker value={date} mode="date" display="spinner" onChange={handleDateChange} minimumDate={new Date()} textColor="#FFFFFF" themeVariant="dark" />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── Android Date Picker ───────────────────────────────────────────── */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker value={date} mode="date" display="default" onChange={handleDateChange} minimumDate={new Date()} />
      )}

      {/* ── iOS Time Picker Modal ─────────────────────────────────────────── */}
      {showTimePicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" visible>
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowTimePicker(false)}>
            <View style={s.pickerSheet}>
              <PickerHeader title="Select Time" onDone={() => setShowTimePicker(false)} />
              <DateTimePicker value={date} mode="time" display="spinner" onChange={handleTimeChange} textColor="#FFFFFF" themeVariant="dark" />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── Android Time Picker ───────────────────────────────────────────── */}
      {showTimePicker && Platform.OS === 'android' && (
        <DateTimePicker value={date} mode="time" display="default" onChange={handleTimeChange} />
      )}
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PickerHeader({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <View style={s.pickerHeader}>
      <Text style={s.pickerTitle}>{title}</Text>
      <TouchableOpacity onPress={onDone}>
        <Text style={s.pickerDone}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A10',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerBack: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: 16,
    gap: 4,
  },

  // ── Section ─────────────────────────────────────────────────────────────────
  section: {
    marginBottom: Spacing['2xl'],
  },
  sectionLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 1.8,
    marginBottom: Spacing.sm,
  },

  // ── Text Input ──────────────────────────────────────────────────────────────
  input: {
    backgroundColor: '#0F0F18',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  inputFocused: {
    borderColor: 'rgba(255,107,53,0.45)',
    backgroundColor: '#12121C',
  },
  textArea: {
    height: 110,
    paddingTop: 14,
  },

  // ── Category chips ──────────────────────────────────────────────────────────
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  chipActive: {
    backgroundColor: 'rgba(255,107,53,0.16)',
    borderColor: '#FF6B35',
  },
  chipText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  chipTextActive: {
    color: '#FF6B35',
  },

  // ── Date & Time ─────────────────────────────────────────────────────────────
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F0F18',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: Radius.md,
    paddingVertical: 14,
  },
  dateBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },

  // ── Duration ────────────────────────────────────────────────────────────────
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  durationBtnActive: {
    backgroundColor: 'rgba(255,107,53,0.16)',
    borderColor: '#FF6B35',
  },
  durationText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  durationTextActive: {
    color: '#FF6B35',
  },

  // ── Footer CTA ──────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0A0A10',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#C8F135',
    borderRadius: Radius.xl,
    paddingVertical: 17,
  },
  ctaBtnDisabled: {
    opacity: 0.6,
  },
  ctaBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#000000',
    letterSpacing: 0.8,
  },

  // ── Picker modal ────────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#111118',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  pickerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  pickerDone: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#FF6B35',
  },
});
