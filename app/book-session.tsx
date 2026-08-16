import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  FlatList, Modal, TouchableWithoutFeedback, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const { width: W } = Dimensions.get('window');

// Session type accent colors — match schedule screen exactly
const SESSION_TYPES = [
  { key: '1-on-1' as const, label: '1-on-1', icon: 'person' as const,   color: CoachColors.accent },
  { key: 'Group'  as const, label: 'Group',   icon: 'people' as const,   color: CoachColors.accent },
  { key: 'Virtual'as const, label: 'Virtual', icon: 'videocam' as const,  color: CoachColors.accent },
];
const DURATIONS = [
  { value: 30, label: '30', sub: 'min' },
  { value: 45, label: '45', sub: 'min' },
  { value: 60, label: '1', sub: 'hr' },
  { value: 90, label: '1.5', sub: 'hr' },
];
const REPEAT_OPTIONS = [
  { value: 0, label: 'No repeat' },
  { value: 2, label: '2 weeks' },
  { value: 4, label: '4 weeks' },
  { value: 6, label: '6 weeks' },
  { value: 8, label: '8 weeks' },
  { value: 12, label: '12 weeks' },
];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6 AM - 7 PM
const MINUTES = [0, 15, 30, 45];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Generate next 30 days for the date strip
function getNext30Days(): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function BookSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; clientId?: string; type?: string }>();
  const { clients, refreshSessions } = useApp();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const insets = useSafeAreaInsets();

  const activeClients = useMemo(() => clients.filter((c) => c.status !== 'inactive'), [clients]);
  const days = useMemo(() => getNext30Days(), []);

  const getDefaultDate = () => {
    if (params.date) {
      const d = new Date(params.date);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  };

  const VALID_TYPES = ['1-on-1', 'Group', 'Virtual'] as const;
  const [sessionType, setSessionType] = useState<'1-on-1' | 'Group' | 'Virtual'>(() => {
    const t = params.type as string;
    return (VALID_TYPES as readonly string[]).includes(t)
      ? (t as '1-on-1' | 'Group' | 'Virtual')
      : '1-on-1';
  });
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const def = getDefaultDate();
    def.setHours(0, 0, 0, 0);
    return def;
  });
  const [selectedHour, setSelectedHour] = useState(() => getDefaultDate().getHours());
  const [selectedMinute, setSelectedMinute] = useState(() => {
    const m = getDefaultDate().getMinutes();
    return MINUTES.reduce((prev, curr) => Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev);
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [duration, setDuration] = useState<number>(60);
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [loading, setLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const dayListRef = useRef<FlatList>(null);

  // ── Inline validation errors ──────────────────────────────────────────────
  const [errors, setErrors] = useState<{ client?: string; groupName?: string; location?: string }>({});
  const clearError = (key: keyof typeof errors) =>
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });

  // Shake animation for the submit button on validation failure
  const reduceMotion = useReducedMotion();
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const triggerShake = () => {
    // Reduce Motion: skip the shake. The inline field errors below are what
    // actually communicate the failure, and they are announced regardless.
    if (reduceMotion) return;
    shakeX.value = withSequence(
      withTiming(-8, { duration: 55 }),
      withTiming( 8, { duration: 55 }),
      withTiming(-6, { duration: 50 }),
      withTiming( 6, { duration: 50 }),
      withTiming(-3, { duration: 45 }),
      withTiming( 0, { duration: 45 }),
    );
  };

  // Pre-select client from params
  useEffect(() => {
    if (params.clientId) {
      const found = activeClients.find(c => c.id === params.clientId);
      if (found) setSelectedClient(found.id);
    }
  }, [params.clientId]);

  // Scroll day strip to selected day on mount
  useEffect(() => {
    const idx = days.findIndex(d => isSameDay(d, selectedDay));
    if (idx > 0) {
      setTimeout(() => dayListRef.current?.scrollToIndex({ index: Math.max(0, idx - 1), animated: false }), 100);
    }
  }, []);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return activeClients;
    const q = clientSearch.toLowerCase();
    return activeClients.filter((c) => c.name.toLowerCase().includes(q));
  }, [activeClients, clientSearch]);

  const selectedClientObj = activeClients.find((c) => c.id === selectedClient);
  const activeType = SESSION_TYPES.find(t => t.key === sessionType)!;

  const sessionDate = useMemo(() => {
    const d = new Date(selectedDay);
    d.setHours(selectedHour, selectedMinute, 0, 0);
    return d;
  }, [selectedDay, selectedHour, selectedMinute]);

  const formatTime = (h: number, m: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    // ── Field-level validation — show inline errors, not a modal ─────────────
    const newErrors: typeof errors = {};
    if (sessionType !== 'Group' && !selectedClient)
      newErrors.client = 'Please select a client for this session.';
    if (sessionType === 'Group' && !groupName.trim())
      newErrors.groupName = 'Please enter a name for this group session.';
    if (sessionType !== 'Virtual' && !location.trim())
      newErrors.location = 'Please enter a location for this session.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      triggerShake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    try {
      const totalSessions = repeatWeeks > 0 ? repeatWeeks : 1;
      const rows = [];
      for (let i = 0; i < totalSessions; i++) {
        const d = new Date(sessionDate);
        d.setDate(d.getDate() + i * 7);
        rows.push({
          trainer_id: user!.id,
          client_id: sessionType === 'Group' ? undefined : selectedClient!,
          group_name: sessionType === 'Group' ? groupName.trim() : undefined,
          type: sessionType,
          date: d.toISOString(),
          duration,
          status: 'upcoming',
          notes: [notes.trim(), location.trim() ? `Location: ${location.trim()}` : ''].filter(Boolean).join('\n') || undefined,
        });
      }
      const { error } = await supabase.from('sessions').insert(rows);
      if (error) throw error;

      // Show success state
      setLoading(false);
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Let Supabase background processing settle before navigating
      await new Promise(resolve => setTimeout(resolve, 1200));
      router.replace('/(tabs)/schedule');
    } catch (err: any) {
      setLoading(false);
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to book session' });
    }
  };

  return (
    <View style={st.root}>
      <LinearGradient
        colors={[CoachColors.bg, CoachColors.surface, CoachColors.bg]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={st.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* HEADER */}
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={st.headerCenter}>
            <Text style={st.headerTitle}>New session</Text>
            <Text style={st.headerSubtitle}>
              {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {formatTime(selectedHour, selectedMinute)}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* SESSION TYPE */}
          <Text style={st.sectionLabel}>Session type</Text>
          <View style={st.typeRow}>
            {SESSION_TYPES.map((type) => {
              const isActive = sessionType === type.key;
              return (
                <TouchableOpacity
                  key={type.key}
                  style={[st.typeCard, isActive && { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter }]}
                  onPress={() => { setSessionType(type.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  activeOpacity={0.7}
                >
                  <View style={[st.typeIconCircle, { backgroundColor: isActive ? CoachColors.accentSoft : CoachColors.borderMuted }]}>
                    <Ionicons name={type.icon} size={20} color={isActive ? type.color : CoachColors.textFaint} />
                  </View>
                  <Text style={[st.typeLabel, isActive && { color: type.color }]}>{type.label}</Text>
                  {isActive && (
                    <View style={[st.typeCheck, { backgroundColor: type.color }]}>
                      <Ionicons name="checkmark" size={10} color={CoachColors.onAccent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CLIENT / GROUP */}
          {sessionType === 'Group' ? (
            <View style={st.section}>
              <Text style={st.sectionLabel}>Group name</Text>
              <View style={[st.inputRow, !!errors.groupName && st.inputRowError]}>
                <Ionicons name="people" size={18} color={errors.groupName ? CoachColors.danger : CoachColors.textFaint} />
                <TextInput
                  style={st.input}
                  placeholder="e.g. Evening HIIT"
                  placeholderTextColor={CoachColors.textFaint}
                  value={groupName}
                  onChangeText={v => { setGroupName(v); if (errors.groupName) clearError('groupName'); }}
                />
              </View>
              {!!errors.groupName && (
                <View style={st.errorRow} accessible accessibilityRole="alert" accessibilityLiveRegion="assertive">
                  <Ionicons name="alert-circle" size={13} color={CoachColors.danger} />
                  <Text style={st.errorText}>{errors.groupName}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={st.section}>
              <Text style={[st.sectionLabel, !!errors.client && { color: CoachColors.danger }]}>Client</Text>
              {selectedClientObj ? (
                <TouchableOpacity
                  style={[st.selectedClient, !!errors.client && st.selectedClientError]}
                  onPress={() => { setSelectedClient(null); clearError('client'); }}
                  activeOpacity={0.7}
                >
                  <Avatar name={selectedClientObj.name} size="sm" imageUrl={(selectedClientObj as any).avatar_url} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={st.selectedName}>{selectedClientObj.name}</Text>
                    <Text style={st.selectedSub}>Tap to change</Text>
                  </View>
                  <View style={st.removeClient}>
                    <Ionicons name="close" size={14} color={CoachColors.textSecondary} />
                  </View>
                </TouchableOpacity>
              ) : (
                <>
                  <View style={[st.inputRow, !!errors.client && st.inputRowError]}>
                    <Ionicons name="search" size={16} color={errors.client ? CoachColors.danger : CoachColors.textFaint} />
                    <TextInput
                      style={st.input}
                      placeholder="Search clients..."
                      placeholderTextColor={CoachColors.textFaint}
                      value={clientSearch}
                      onChangeText={v => { setClientSearch(v); if (errors.client) clearError('client'); }}
                    />
                  </View>
                  {!!errors.client && (
                    <View style={st.errorRow} accessible accessibilityRole="alert" accessibilityLiveRegion="assertive">
                      <Ionicons name="alert-circle" size={13} color={CoachColors.danger} />
                      <Text style={st.errorText}>{errors.client}</Text>
                    </View>
                  )}
                  <View style={[st.clientList, !!errors.client && { borderColor: CoachColors.dangerSoft }]}>
                    {filteredClients.length === 0 ? (
                      <View style={st.noClients}>
                        <Ionicons name="person-outline" size={24} color={CoachColors.textFaint} />
                        <Text style={st.noClientsText}>No matching clients</Text>
                      </View>
                    ) : (
                      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {filteredClients.map((client, i) => (
                          <TouchableOpacity
                            key={client.id}
                            style={[st.clientOption, i < filteredClients.length - 1 && st.clientBorder]}
                            onPress={() => {
                              setSelectedClient(client.id);
                              setClientSearch('');
                              clearError('client');
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            activeOpacity={0.7}
                          >
                            <Avatar name={client.name} size="sm" imageUrl={(client as any).avatar_url} />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Text style={st.clientName}>{client.name}</Text>
                              {(client as any).email && (
                                <Text style={st.clientEmail}>{(client as any).email}</Text>
                              )}
                            </View>
                            <Ionicons name="add-circle-outline" size={20} color={CoachColors.textFaint} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </>
              )}
            </View>
          )}

          {/* DATE (Horizontal Day Strip) */}
          <View style={st.section}>
            <Text style={st.sectionLabel}>Date</Text>
            <FlatList
              ref={dayListRef}
              data={days}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.toISOString()}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => {
                const isSelected = isSameDay(item, selectedDay);
                const isToday = isSameDay(item, new Date());
                return (
                  <TouchableOpacity
                    style={[st.dayCell, isSelected && st.dayCellActive]}
                    onPress={() => { setSelectedDay(item); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.dayName, isSelected && st.dayNameActive, isToday && !isSelected && { color: CoachColors.accent }]}>
                      {DAY_NAMES_SHORT[item.getDay()]}
                    </Text>
                    <Text style={[st.dayNum, isSelected && st.dayNumActive]}>
                      {item.getDate()}
                    </Text>
                    <Text style={[st.dayMonth, isSelected && st.dayMonthActive]}>
                      {item.toLocaleDateString('en-US', { month: 'short' })}
                    </Text>
                    {isToday && <View style={[st.todayDot, isSelected && { backgroundColor: CoachColors.onAccent }]} />}
                  </TouchableOpacity>
                );
              }}
              getItemLayout={(_, index) => ({ length: 64, offset: 72 * index, index })}
            />
          </View>

          {/* TIME */}
          <View style={st.section}>
            <Text style={st.sectionLabel}>Time</Text>
            <TouchableOpacity style={st.timeBtn} onPress={() => setShowTimePicker(true)} activeOpacity={0.7}>
              <View style={st.dateTimeIcon}>
                <Ionicons name="time" size={18} color={CoachColors.accent} />
              </View>
              <Text style={st.timeValue}>{formatTime(selectedHour, selectedMinute)}</Text>
              <Ionicons name="chevron-forward" size={16} color={CoachColors.textFaint} />
            </TouchableOpacity>
          </View>

          {/* DURATION */}
          <View style={st.section}>
            <Text style={st.sectionLabel}>Duration</Text>
            <View style={st.durationRow}>
              {DURATIONS.map((d) => {
                const isActive = duration === d.value;
                return (
                  <TouchableOpacity
                    key={d.value}
                    style={[st.durationCard, isActive && st.durationCardActive]}
                    onPress={() => { setDuration(d.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.durationValue, isActive && st.durationValueActive]}>{d.label}</Text>
                    <Text style={[st.durationSub, isActive && st.durationSubActive]}>{d.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* LOCATION (required for in-person sessions) */}
          {sessionType !== 'Virtual' && (
            <View style={st.section}>
              <View style={st.sectionLabelRow}>
                <Text style={[st.sectionLabel, { marginBottom: 0 }, !!errors.location && { color: CoachColors.danger }]}>Location</Text>
                <Text style={st.requiredStar}>*</Text>
              </View>
              <View style={[st.inputRow, !!errors.location && st.inputRowError, { marginTop: 10 }]}>
                <Ionicons name="location-outline" size={16} color={errors.location ? CoachColors.danger : CoachColors.textFaint} />
                <TextInput
                  style={st.input}
                  placeholder="e.g. Downtown Gym, Studio B"
                  placeholderTextColor={CoachColors.textFaint}
                  value={location}
                  onChangeText={v => { setLocation(v); if (errors.location) clearError('location'); }}
                />
              </View>
              {!!errors.location && (
                <View style={st.errorRow} accessible accessibilityRole="alert" accessibilityLiveRegion="assertive">
                  <Ionicons name="alert-circle" size={13} color={CoachColors.danger} />
                  <Text style={st.errorText}>{errors.location}</Text>
                </View>
              )}
            </View>
          )}

          {/* REPEAT */}
          <View style={st.section}>
            <Text style={st.sectionLabel}>Repeat</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {REPEAT_OPTIONS.map((opt) => {
                const isActive = repeatWeeks === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[st.repeatChip, isActive && st.repeatChipActive]}
                    onPress={() => { setRepeatWeeks(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.repeatChipText, isActive && st.repeatChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {repeatWeeks > 0 && (
              <Text style={st.repeatNote}>
                This will create {repeatWeeks} sessions, one each week on {DAY_NAMES_SHORT[selectedDay.getDay()]}
              </Text>
            )}
          </View>

          {/* NOTES */}
          <View style={st.section}>
            <Text style={st.sectionLabel}>Notes</Text>
            <View style={[st.inputRow, { alignItems: 'flex-start', minHeight: 80 }]}>
              <Ionicons name="document-text-outline" size={16} color={CoachColors.textFaint} style={{ marginTop: 2 }} />
              <TextInput
                style={[st.input, { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="Upper body focus, bring bands..."
                placeholderTextColor={CoachColors.textFaint}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>
          </View>

          {/* SUBMIT */}
          <Animated.View style={[shakeStyle, { marginBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity
              style={[st.submitBtn, (loading || success) && { opacity: success ? 1 : 0.6 }, success && { backgroundColor: CoachColors.accent }]}
              onPress={handleSubmit}
              disabled={loading || success}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={repeatWeeks > 0 ? `Book ${repeatWeeks} sessions` : 'Book session'}
            >
              {loading ? (
                <ActivityIndicator size="small" color={CoachColors.onAccent} />
              ) : success ? (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={CoachColors.textPrimary} />
                  <Text style={[st.submitText, { color: CoachColors.textPrimary }]}>Booked!</Text>
                </>
              ) : (
                <>
                  <Ionicons name="calendar-outline" size={20} color={CoachColors.onAccent} />
                  <Text style={st.submitText}>
                    {repeatWeeks > 0 ? `Book ${repeatWeeks} sessions` : 'Book session'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Preview summary */}
          <View style={st.preview}>
            <View style={[st.previewAccent, { backgroundColor: activeType.color }]} />
            <View style={st.previewBody}>
              <Text style={st.previewLabel}>Session preview</Text>
              <Text style={st.previewTitle}>
                {sessionType === 'Group'
                  ? (groupName || 'Group Session')
                  : (selectedClientObj?.name || 'Select a client')}
              </Text>
              <Text style={st.previewMeta}>
                {activeType.label} {'\u00b7'} {duration} min {'\u00b7'} {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {formatTime(selectedHour, selectedMinute)}
                {location ? ` \u00b7 ${location}` : ''}
                {repeatWeeks > 0 ? ` \u00b7 Repeats ${repeatWeeks}\u00d7` : ''}
              </Text>
            </View>
          </View>

          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* TIME PICKER BOTTOM SHEET */}
      <Modal visible={showTimePicker} transparent animationType="slide" onRequestClose={() => setShowTimePicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowTimePicker(false)}>
          <View style={st.sheetOverlay} />
        </TouchableWithoutFeedback>
        <View style={st.sheetContainer}>
          <View style={st.sheetHeader}>
            <Text style={st.sheetTitle}>Select time</Text>
            <TouchableOpacity onPress={() => setShowTimePicker(false)}>
              <Text style={st.sheetDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            <View style={st.timeGrid}>
              {HOURS.map((h) => (
                <View key={h}>
                  <Text style={st.timeGroupLabel}>{h > 12 ? h - 12 : h === 0 ? 12 : h} {h >= 12 ? 'PM' : 'AM'}</Text>
                  <View style={st.timeSlotRow}>
                    {MINUTES.map((m) => {
                      const isActive = selectedHour === h && selectedMinute === m;
                      return (
                        <TouchableOpacity
                          key={`${h}:${m}`}
                          style={[st.timeSlot, isActive && st.timeSlotActive]}
                          onPress={() => {
                            setSelectedHour(h);
                            setSelectedMinute(m);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[st.timeSlotText, isActive && st.timeSlotTextActive]}>
                            {formatTime(h, m)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={{ height: insets.bottom + 12 }} />
        </View>
      </Modal>
    </SafeAreaView>
  </View>
  );
}

const st = StyleSheet.create({
  // Root wraps everything so LinearGradient covers the full screen
  root:      { flex: 1, backgroundColor: CoachColors.bg },
  container: { flex: 1 },
  scroll:    { paddingHorizontal: W * 0.05, paddingBottom: 100 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: W * 0.05, paddingVertical: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: CoachColors.surface, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.047), color: CoachColors.textPrimary },
  headerSubtitle: { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.03), color: CoachColors.textMuted, marginTop: 2 },

  // Sections
  section: { marginBottom: 24 },
  sectionLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.032), color: CoachColors.textMuted, marginBottom: 10, letterSpacing: 0.3 },

  // Session type cards
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  typeCard: {
    flex: 1, alignItems: 'center', paddingVertical: Math.round(W * 0.045),
    borderRadius: 16, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted, gap: 8,
  },
  typeIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.032), color: CoachColors.textMuted },
  typeCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  // Section label row (for label + required star)
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  requiredStar:    { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.032), color: CoachColors.danger, lineHeight: 20 },

  // Inputs
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 4,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  inputRowError: {
    borderColor: CoachColors.danger,
    backgroundColor: CoachColors.dangerSoft,
  },
  input: { flex: 1, fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.038), color: CoachColors.textPrimary, paddingVertical: 12 },

  // Inline error message
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingLeft: 4 },
  errorText: { fontFamily: CoachFonts.bodyMedium, fontSize: Math.round(W * 0.03), color: CoachColors.danger, flex: 1 },

  // Selected client
  selectedClient: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CoachColors.accentSofter, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: CoachColors.accentSoft,
  },
  selectedClientError: {
    borderColor: CoachColors.danger,
    backgroundColor: CoachColors.dangerSoft,
  },
  selectedName: { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.038), color: CoachColors.textPrimary },
  selectedSub:  { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.028), color: CoachColors.textFaint, marginTop: 1 },
  removeClient: { width: 30, height: 30, borderRadius: 15, backgroundColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center' },
  clientList: { marginTop: 8, borderRadius: 14, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, overflow: 'hidden' },
  clientOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, minHeight: 52 },
  clientBorder: { borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted },
  clientName: { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.036), color: CoachColors.textPrimary },
  clientEmail: { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.028), color: CoachColors.textFaint, marginTop: 1 },
  noClients: { alignItems: 'center', padding: 24, gap: 8 },
  noClientsText: { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.033), color: CoachColors.textFaint },

  // Day strip
  dayCell: {
    width: Math.round(W * 0.163), alignItems: 'center', paddingVertical: 12,
    borderRadius: 16, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted, gap: 4, minHeight: 88,
  },
  dayCellActive:   { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  dayName:         { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.028), color: CoachColors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayNameActive:   { color: CoachColors.onAccent },
  dayNum:          { fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.052), color: CoachColors.textPrimary },
  dayNumActive:    { color: CoachColors.bg },
  dayMonth:        { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.025), color: CoachColors.textFaint },
  dayMonthActive:  { color: CoachColors.onAccent },
  todayDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: CoachColors.accent, marginTop: 2 },

  // Time
  timeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: CoachColors.borderMuted, minHeight: 56,
  },
  dateTimeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center' },
  timeValue: { flex: 1, fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.042), color: CoachColors.textPrimary },

  // Duration chips
  durationRow: { flexDirection: 'row', gap: 10 },
  durationCard: {
    flex: 1, alignItems: 'center', paddingVertical: Math.round(W * 0.04),
    borderRadius: 14, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted, gap: 2, minHeight: 70,
  },
  durationCardActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  durationValue:      { fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.058), color: CoachColors.textMuted },
  durationValueActive:{ color: CoachColors.bg },
  durationSub:        { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.028), color: CoachColors.textFaint },
  durationSubActive:  { color: CoachColors.onAccent },

  // Repeat chips
  repeatChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    minHeight: 44, justifyContent: 'center',
  },
  repeatChipActive:     { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  repeatChipText:       { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.033), color: CoachColors.textSecondary },
  repeatChipTextActive: { color: CoachColors.accent },
  repeatNote: { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.03), color: CoachColors.textFaint, marginTop: 10, paddingLeft: 4 },

  // Submit button — full-width lime CTA
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 16, marginBottom: 20, minHeight: 54,
  },
  submitText: { fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.042), color: CoachColors.bg },

  // Session preview card
  preview: {
    flexDirection: 'row', backgroundColor: CoachColors.surface,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  previewAccent: { width: 3 },
  previewBody:   { flex: 1, padding: 16, gap: 4 },
  previewLabel:  { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.025), color: CoachColors.textFaint, letterSpacing: 1, textTransform: 'uppercase' },
  previewTitle:  { fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.042), color: CoachColors.textPrimary },
  previewMeta:   { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.03), color: CoachColors.textMuted, marginTop: 2 },

  // Time picker bottom sheet
  sheetOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheetContainer: {
    backgroundColor: CoachColors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: W * 0.05,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted,
  },
  sheetTitle:       { fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.042), color: CoachColors.textPrimary },
  sheetDone:        { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.038), color: CoachColors.accent },
  timeGrid:         { paddingVertical: 10, gap: 12 },
  timeGroupLabel:   { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.03), color: CoachColors.textFaint, marginBottom: 6, letterSpacing: 0.5 },
  timeSlotRow:      { flexDirection: 'row', gap: 8 },
  timeSlot: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted, minHeight: 44,
  },
  timeSlotActive:     { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  timeSlotText:       { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.03), color: CoachColors.textSecondary },
  timeSlotTextActive: { color: CoachColors.bg },
});
