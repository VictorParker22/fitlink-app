import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';

const { width: W } = Dimensions.get('window');

// Session type accent colors — match schedule screen exactly
const SESSION_TYPES = [
  { key: '1-on-1' as const, label: '1-on-1', icon: 'person' as const,   color: '#C8F135' },
  { key: 'Group'  as const, label: 'Group',   icon: 'people' as const,   color: '#A78BFA' },
  { key: 'Virtual'as const, label: 'Virtual', icon: 'videocam' as const,  color: '#60A5FA' },
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
  const params = useLocalSearchParams<{ date?: string; clientId?: string }>();
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

  const [sessionType, setSessionType] = useState<'1-on-1' | 'Group' | 'Virtual'>('1-on-1');
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
    if (sessionType !== 'Group' && !selectedClient) {
      return showAlert({ type: 'warning', title: 'Select a Client', message: 'Please pick a client for this session.' });
    }
    if (sessionType === 'Group' && !groupName.trim()) {
      return showAlert({ type: 'warning', title: 'Group Name Required', message: 'Please enter a name for the group session.' });
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
          notes: [notes.trim(), location.trim() ? `\ud83d\udccd ${location.trim()}` : ''].filter(Boolean).join('\n') || undefined,
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
        colors={['#0D0D12', '#111118', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={st.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* HEADER */}
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={st.headerCenter}>
            <Text style={st.headerTitle}>New Session</Text>
            <Text style={st.headerSubtitle}>
              {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {formatTime(selectedHour, selectedMinute)}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* SESSION TYPE */}
          <Text style={st.sectionLabel}>Session Type</Text>
          <View style={st.typeRow}>
            {SESSION_TYPES.map((type) => {
              const isActive = sessionType === type.key;
              return (
                <TouchableOpacity
                  key={type.key}
                  style={[st.typeCard, isActive && { borderColor: type.color + '50', backgroundColor: type.color + '0D' }]}
                  onPress={() => { setSessionType(type.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  activeOpacity={0.7}
                >
                  <View style={[st.typeIconCircle, { backgroundColor: isActive ? type.color + '20' : 'rgba(255,255,255,0.04)' }]}>
                    <Ionicons name={type.icon} size={20} color={isActive ? type.color : 'rgba(255,255,255,0.3)'} />
                  </View>
                  <Text style={[st.typeLabel, isActive && { color: type.color }]}>{type.label}</Text>
                  {isActive && (
                    <View style={[st.typeCheck, { backgroundColor: type.color }]}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CLIENT / GROUP */}
          {sessionType === 'Group' ? (
            <View style={st.section}>
              <Text style={st.sectionLabel}>Group Name</Text>
              <View style={st.inputRow}>
                <Ionicons name="people" size={18} color="rgba(255,255,255,0.3)" />
                <TextInput
                  style={st.input}
                  placeholder="e.g. Evening HIIT"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={groupName}
                  onChangeText={setGroupName}
                />
              </View>
            </View>
          ) : (
            <View style={st.section}>
              <Text style={st.sectionLabel}>Client</Text>
              {selectedClientObj ? (
                <TouchableOpacity style={st.selectedClient} onPress={() => setSelectedClient(null)} activeOpacity={0.7}>
                  <Avatar name={selectedClientObj.name} size="sm" imageUrl={(selectedClientObj as any).avatar_url} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={st.selectedName}>{selectedClientObj.name}</Text>
                    <Text style={st.selectedSub}>Tap to change</Text>
                  </View>
                  <View style={st.removeClient}>
                    <Ionicons name="close" size={14} color="rgba(255,255,255,0.5)" />
                  </View>
                </TouchableOpacity>
              ) : (
                <>
                  <View style={st.inputRow}>
                    <Ionicons name="search" size={16} color="rgba(255,255,255,0.3)" />
                    <TextInput
                      style={st.input}
                      placeholder="Search clients..."
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      value={clientSearch}
                      onChangeText={setClientSearch}
                    />
                  </View>
                  <View style={st.clientList}>
                    {filteredClients.length === 0 ? (
                      <View style={st.noClients}>
                        <Ionicons name="person-outline" size={24} color="rgba(255,255,255,0.15)" />
                        <Text style={st.noClientsText}>No matching clients</Text>
                      </View>
                    ) : (
                      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {filteredClients.map((client, i) => (
                          <TouchableOpacity
                            key={client.id}
                            style={[st.clientOption, i < filteredClients.length - 1 && st.clientBorder]}
                            onPress={() => { setSelectedClient(client.id); setClientSearch(''); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            activeOpacity={0.7}
                          >
                            <Avatar name={client.name} size="sm" imageUrl={(client as any).avatar_url} />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Text style={st.clientName}>{client.name}</Text>
                              {(client as any).email && (
                                <Text style={st.clientEmail}>{(client as any).email}</Text>
                              )}
                            </View>
                            <Ionicons name="add-circle-outline" size={20} color="rgba(255,255,255,0.25)" />
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
                    <Text style={[st.dayName, isSelected && st.dayNameActive, isToday && !isSelected && { color: '#FF6B35' }]}>
                      {DAY_NAMES_SHORT[item.getDay()]}
                    </Text>
                    <Text style={[st.dayNum, isSelected && st.dayNumActive]}>
                      {item.getDate()}
                    </Text>
                    <Text style={[st.dayMonth, isSelected && st.dayMonthActive]}>
                      {item.toLocaleDateString('en-US', { month: 'short' })}
                    </Text>
                    {isToday && <View style={[st.todayDot, isSelected && { backgroundColor: '#000' }]} />}
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
                <Ionicons name="time" size={18} color="#6C9BF2" />
              </View>
              <Text style={st.timeValue}>{formatTime(selectedHour, selectedMinute)}</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
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

          {/* LOCATION (not for Virtual) */}
          {sessionType !== 'Virtual' && (
            <View style={st.section}>
              <Text style={st.sectionLabel}>Location</Text>
              <View style={st.inputRow}>
                <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.3)" />
                <TextInput
                  style={st.input}
                  placeholder="e.g. Downtown Gym, Studio B"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={location}
                  onChangeText={setLocation}
                />
              </View>
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
              <Ionicons name="document-text-outline" size={16} color="rgba(255,255,255,0.25)" style={{ marginTop: 2 }} />
              <TextInput
                style={[st.input, { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="Upper body focus, bring bands..."
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>
          </View>

          {/* SUBMIT */}
          <TouchableOpacity
            style={[st.submitBtn, (loading || success) && { opacity: success ? 1 : 0.6 }, success && { backgroundColor: '#22C55E' }, { marginBottom: Math.max(insets.bottom, 16) }]}
            onPress={handleSubmit}
            disabled={loading || success}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : success ? (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={[st.submitText, { color: '#FFFFFF' }]}>Booked!</Text>
              </>
            ) : (
              <>
                <Ionicons name="calendar-outline" size={20} color="#000" />
                <Text style={st.submitText}>
                  {repeatWeeks > 0 ? `Book ${repeatWeeks} Sessions` : 'Book Session'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Preview summary */}
          <View style={st.preview}>
            <View style={[st.previewAccent, { backgroundColor: activeType.color }]} />
            <View style={st.previewBody}>
              <Text style={st.previewLabel}>Session Preview</Text>
              <Text style={st.previewTitle}>
                {sessionType === 'Group'
                  ? (groupName || 'Group Session')
                  : (selectedClientObj?.name || 'Select a client')}
              </Text>
              <Text style={st.previewMeta}>
                {activeType.label} {'\u00b7'} {duration} min {'\u00b7'} {sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {formatTime(selectedHour, selectedMinute)}
                {location ? ` \u00b7 \ud83d\udccd ${location}` : ''}
                {repeatWeeks > 0 ? ` \u00b7 Repeats ${repeatWeeks}\u00d7` : ''}
              </Text>
            </View>
          </View>

          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* TIME PICKER BOTTOM SHEET */}
      <Modal visible={showTimePicker} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowTimePicker(false)}>
          <View style={st.sheetOverlay} />
        </TouchableWithoutFeedback>
        <View style={st.sheetContainer}>
          <View style={st.sheetHeader}>
            <Text style={st.sheetTitle}>Select Time</Text>
            <TouchableOpacity onPress={() => setShowTimePicker(false)}>
              <Text style={st.sheetDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
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
  root:      { flex: 1, backgroundColor: '#0D0D12' },
  container: { flex: 1 },
  scroll:    { paddingHorizontal: W * 0.05, paddingBottom: 100 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: W * 0.05, paddingVertical: Spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.047), color: '#FFFFFF' },
  headerSubtitle: { fontFamily: FontFamily.body, fontSize: Math.round(W * 0.03), color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  // Sections
  section: { marginBottom: 24 },
  sectionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.032), color: 'rgba(255,255,255,0.45)', marginBottom: 10, letterSpacing: 0.3 },

  // Session type cards
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  typeCard: {
    flex: 1, alignItems: 'center', paddingVertical: Math.round(W * 0.045),
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 8,
  },
  typeIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.032), color: 'rgba(255,255,255,0.4)' },
  typeCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  // Inputs
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  input: { flex: 1, fontFamily: FontFamily.body, fontSize: Math.round(W * 0.038), color: '#FFFFFF', paddingVertical: 12 },

  // Selected client
  selectedClient: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(200,241,53,0.05)', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: 'rgba(200,241,53,0.15)',
  },
  selectedName: { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.038), color: '#FFFFFF' },
  selectedSub:  { fontFamily: FontFamily.body, fontSize: Math.round(W * 0.028), color: 'rgba(255,255,255,0.3)', marginTop: 1 },
  removeClient: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  clientList: { marginTop: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  clientOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, minHeight: 52 },
  clientBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  clientName: { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.036), color: '#FFFFFF' },
  clientEmail: { fontFamily: FontFamily.body, fontSize: Math.round(W * 0.028), color: 'rgba(255,255,255,0.3)', marginTop: 1 },
  noClients: { alignItems: 'center', padding: 24, gap: 8 },
  noClientsText: { fontFamily: FontFamily.body, fontSize: Math.round(W * 0.033), color: 'rgba(255,255,255,0.25)' },

  // Day strip
  dayCell: {
    width: Math.round(W * 0.163), alignItems: 'center', paddingVertical: 12,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 4, minHeight: 88,
  },
  dayCellActive:   { backgroundColor: '#C8F135', borderColor: '#C8F135' },
  dayName:         { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.028), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayNameActive:   { color: 'rgba(13,13,18,0.55)' },
  dayNum:          { fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.052), color: '#FFFFFF' },
  dayNumActive:    { color: '#0D0D12' },
  dayMonth:        { fontFamily: FontFamily.body, fontSize: Math.round(W * 0.025), color: 'rgba(255,255,255,0.25)' },
  dayMonthActive:  { color: 'rgba(13,13,18,0.45)' },
  todayDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#C8F135', marginTop: 2 },

  // Time
  timeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', minHeight: 56,
  },
  dateTimeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  timeValue: { flex: 1, fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.042), color: '#FFFFFF' },

  // Duration chips
  durationRow: { flexDirection: 'row', gap: 10 },
  durationCard: {
    flex: 1, alignItems: 'center', paddingVertical: Math.round(W * 0.04),
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 2, minHeight: 70,
  },
  durationCardActive: { backgroundColor: '#C8F135', borderColor: '#C8F135' },
  durationValue:      { fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.058), color: 'rgba(255,255,255,0.4)' },
  durationValueActive:{ color: '#0D0D12' },
  durationSub:        { fontFamily: FontFamily.body, fontSize: Math.round(W * 0.028), color: 'rgba(255,255,255,0.25)' },
  durationSubActive:  { color: 'rgba(13,13,18,0.5)' },

  // Repeat chips
  repeatChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    minHeight: 44, justifyContent: 'center',
  },
  repeatChipActive:     { backgroundColor: 'rgba(200,241,53,0.12)', borderColor: 'rgba(200,241,53,0.35)' },
  repeatChipText:       { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.033), color: 'rgba(255,255,255,0.5)' },
  repeatChipTextActive: { color: '#C8F135' },
  repeatNote: { fontFamily: FontFamily.body, fontSize: Math.round(W * 0.03), color: 'rgba(255,255,255,0.3)', marginTop: 10, paddingLeft: 4 },

  // Submit button — full-width lime CTA
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#C8F135', borderRadius: Radius.full,
    paddingVertical: 16, marginBottom: 20, minHeight: 54,
  },
  submitText: { fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.042), color: '#0D0D12' },

  // Session preview card
  preview: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  previewAccent: { width: 3 },
  previewBody:   { flex: 1, padding: 16, gap: 4 },
  previewLabel:  { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.025), color: 'rgba(255,255,255,0.25)', letterSpacing: 1, textTransform: 'uppercase' },
  previewTitle:  { fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.042), color: '#FFFFFF' },
  previewMeta:   { fontFamily: FontFamily.body, fontSize: Math.round(W * 0.03), color: 'rgba(255,255,255,0.35)', marginTop: 2 },

  // Time picker bottom sheet
  sheetOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheetContainer: {
    backgroundColor: '#111118', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: W * 0.05,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  sheetTitle:       { fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.042), color: '#FFFFFF' },
  sheetDone:        { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.038), color: '#C8F135' },
  timeGrid:         { paddingVertical: Spacing.md, gap: 12 },
  timeGroupLabel:   { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.03), color: 'rgba(255,255,255,0.3)', marginBottom: 6, letterSpacing: 0.5 },
  timeSlotRow:      { flexDirection: 'row', gap: 8 },
  timeSlot: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', minHeight: 44,
  },
  timeSlotActive:     { backgroundColor: '#C8F135', borderColor: '#C8F135' },
  timeSlotText:       { fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.03), color: 'rgba(255,255,255,0.5)' },
  timeSlotTextActive: { color: '#0D0D12' },
});
