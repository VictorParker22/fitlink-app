import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useApp } from '../context/AppContext';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme'
import { useTheme } from '../context/ThemeContext';

const SESSION_TYPES = ['1-on-1', 'Group', 'Virtual'] as const;
const DURATIONS = [30, 45, 60, 90] as const;

export default function BookSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { addSession, clients } = useApp();

  const activeClients = useMemo(() => clients.filter((c) => c.status !== 'inactive'), [clients]);

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

  const [sessionType, setSessionType] = useState<typeof SESSION_TYPES[number]>('1-on-1');
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [date, setDate] = useState(getDefaultDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [duration, setDuration] = useState<number>(60);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return activeClients;
    const q = clientSearch.toLowerCase();
    return activeClients.filter((c) => c.name.toLowerCase().includes(q));
  }, [activeClients, clientSearch]);

  const selectedClientObj = activeClients.find((c) => c.id === selectedClient);

  const handleSubmit = async () => {
    if (sessionType !== 'Group' && !selectedClient) {
      return Alert.alert('Select a client', 'Please pick a client for this session.');
    }
    if (sessionType === 'Group' && !groupName.trim()) {
      return Alert.alert('Group name required', 'Please enter a name for the group session.');
    }

    setLoading(true);
    try {
      await addSession({
        client_id: sessionType === 'Group' ? undefined : selectedClient!,
        group_name: sessionType === 'Group' ? groupName.trim() : undefined,
        type: sessionType,
        date: date.toISOString(),
        duration,
        status: 'upcoming',
        notes: notes.trim() || undefined,
      });
      Alert.alert('Session Booked!', 'The session has been added to your schedule.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to book session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book Session</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Session Type */}
          <Text style={styles.label}>SESSION TYPE</Text>
          <View style={styles.typeRow}>
            {SESSION_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.typeChip, sessionType === type && styles.typeChipActive]}
                onPress={() => setSessionType(type)}
              >
                <Ionicons
                  name={type === '1-on-1' ? 'person' : type === 'Group' ? 'people' : 'videocam'}
                  size={16}
                  color={sessionType === type ? Colors.accent : Colors.textTertiary}
                />
                <Text style={[styles.typeText, sessionType === type && styles.typeTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Client Selection or Group Name */}
          {sessionType === 'Group' ? (
            <View style={styles.section}>
              <Text style={styles.label}>GROUP NAME *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Evening HIIT"
                placeholderTextColor={Colors.textTertiary}
                value={groupName}
                onChangeText={setGroupName}
              />
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.label}>CLIENT *</Text>
              {selectedClientObj ? (
                <TouchableOpacity style={styles.selectedClient} onPress={() => setSelectedClient(null)}>
                  <Avatar name={selectedClientObj.name} size="sm" />
                  <Text style={styles.selectedClientName}>{selectedClientObj.name}</Text>
                  <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
              ) : (
                <>
                  <View style={styles.searchBox}>
                    <Ionicons name="search" size={16} color={Colors.textTertiary} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search clients..."
                      placeholderTextColor={Colors.textTertiary}
                      value={clientSearch}
                      onChangeText={setClientSearch}
                    />
                  </View>
                  <ScrollView style={styles.clientList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {filteredClients.map((client) => (
                      <TouchableOpacity
                        key={client.id}
                        style={styles.clientOption}
                        onPress={() => { setSelectedClient(client.id); setClientSearch(''); }}
                      >
                        <Avatar name={client.name} size="sm" />
                        <Text style={styles.clientOptionName}>{client.name}</Text>
                      </TouchableOpacity>
                    ))}
                    {filteredClients.length === 0 && (
                      <Text style={styles.noClients}>No matching clients</Text>
                    )}
                  </ScrollView>
                </>
              )}
            </View>
          )}

          {/* Date & Time */}
          <View style={styles.section}>
            <Text style={styles.label}>DATE & TIME</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color={Colors.accent} />
                <Text style={styles.dateBtnText}>
                  {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
                <Ionicons name="time-outline" size={16} color={Colors.accent} />
                <Text style={styles.dateBtnText}>
                  {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            </View>
            {(showDatePicker || showTimePicker) && (
              <DateTimePicker
                value={date}
                mode={showDatePicker ? 'date' : 'time'}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event: any, selectedDate?: Date) => {
                  setShowDatePicker(false);
                  setShowTimePicker(false);
                  if (selectedDate) setDate(selectedDate);
                }}
                themeVariant="dark"
                minimumDate={new Date()}
              />
            )}
          </View>

          {/* Duration */}
          <View style={styles.section}>
            <Text style={styles.label}>DURATION</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationChip, duration === d && styles.durationChipActive]}
                  onPress={() => setDuration(d)}
                >
                  <Text style={[styles.durationText, duration === d && styles.durationTextActive]}>{d}min</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>NOTES</Text>
            <TextInput
              style={styles.input}
              placeholder="Upper body focus, bring bands..."
              placeholderTextColor={Colors.textTertiary}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          <Button title="Book Session" onPress={handleSubmit} loading={loading} full size="lg" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  section: { marginBottom: Spacing.xl },
  label: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.8, marginBottom: Spacing.sm },

  typeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl },
  typeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: Radius.md,
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
  },
  typeChipActive: { backgroundColor: Colors.accentSoft, borderColor: 'rgba(255,95,59,0.3)' },
  typeText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textSecondary },
  typeTextActive: { color: Colors.accent },

  input: {
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.md, paddingVertical: 12, paddingHorizontal: 14,
    fontFamily: FontFamily.body, fontSize: FontSize.md, color: Colors.textPrimary,
  },

  selectedClient: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  selectedClientName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: Colors.textPrimary, flex: 1 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, height: 40, marginBottom: Spacing.sm,
  },
  searchInput: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textPrimary, paddingVertical: 0 },

  clientList: { maxHeight: 160, borderRadius: Radius.md, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  clientOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  clientOptionName: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: Colors.textPrimary },
  noClients: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, padding: Spacing.md, textAlign: 'center' },

  dateRow: { flexDirection: 'row', gap: Spacing.sm },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingVertical: 12,
  },
  dateBtnText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textPrimary },

  durationRow: { flexDirection: 'row', gap: Spacing.sm },
  durationChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: Radius.md, backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  durationChipActive: { backgroundColor: Colors.accentSoft, borderColor: 'rgba(255,95,59,0.3)' },
  durationText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textSecondary },
  durationTextActive: { color: Colors.accent },
});
