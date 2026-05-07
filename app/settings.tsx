import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Switch, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Card from '../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function SettingsScreen() {
  const router = useRouter();
  const { trainer, updateTrainer } = useApp();

  const [name, setName] = useState(trainer?.name || '');
  const [email, setEmail] = useState(trainer?.email || '');
  const [phone, setPhone] = useState(trainer?.phone || '');
  const [bio, setBio] = useState(trainer?.bio || '');
  const [specialization, setSpecialization] = useState(trainer?.specialization || '');
  const [saving, setSaving] = useState(false);

  // Notifications
  const [sessionReminders, setSessionReminders] = useState(true);
  const [newClientAlerts, setNewClientAlerts] = useState(true);
  const [messageNotifs, setMessageNotifs] = useState(true);

  // Working hours
  const defaultHours = { start: '9:00 AM', end: '5:00 PM', enabled: true };
  const [workingHours, setWorkingHours] = useState<Record<string, typeof defaultHours>>(
    DAYS.reduce((acc, day) => ({
      ...acc,
      [day]: trainer?.working_hours?.[day] || { ...defaultHours, enabled: !['Saturday', 'Sunday'].includes(day) },
    }), {} as Record<string, typeof defaultHours>)
  );

  useEffect(() => {
    if (trainer) {
      setName(trainer.name || '');
      setEmail(trainer.email || '');
      setPhone(trainer.phone || '');
      setBio(trainer.bio || '');
      setSpecialization(trainer.specialization || '');
    }
  }, [trainer]);

  const toggleDay = (day: string) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Name required', 'Please enter your name.');

    setSaving(true);
    try {
      await updateTrainer({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        specialization: specialization.trim() || undefined,
        working_hours: workingHours,
        notification_prefs: { sessionReminders, newClientAlerts, messageNotifs },
      });
      Alert.alert('Saved', 'Your settings have been updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Personal Info */}
          <Text style={styles.sectionTitle}>PERSONAL INFORMATION</Text>
          <Card>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput style={styles.fieldInput} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={Colors.textTertiary} />
            </View>
            <View style={[styles.fieldGroup, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput style={styles.fieldInput} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor={Colors.textTertiary} keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View style={[styles.fieldGroup, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput style={styles.fieldInput} value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" placeholderTextColor={Colors.textTertiary} keyboardType="phone-pad" />
            </View>
            <View style={[styles.fieldGroup, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>Specialization</Text>
              <TextInput style={styles.fieldInput} value={specialization} onChangeText={setSpecialization} placeholder="e.g. Strength Training, HIIT..." placeholderTextColor={Colors.textTertiary} />
            </View>
            <View style={[styles.fieldGroup, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <TextInput
                style={[styles.fieldInput, styles.textArea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell clients about yourself..."
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </Card>

          {/* Working Hours */}
          <Text style={styles.sectionTitle}>WORKING HOURS</Text>
          <Card noPadding>
            {DAYS.map((day, i) => (
              <View key={day} style={[styles.dayRow, i < DAYS.length - 1 && styles.dayRowBorder]}>
                <Text style={[styles.dayName, !workingHours[day].enabled && styles.dayNameOff]}>{day}</Text>
                {workingHours[day].enabled && (
                  <Text style={styles.dayHours}>{workingHours[day].start} — {workingHours[day].end}</Text>
                )}
                <Switch
                  value={workingHours[day].enabled}
                  onValueChange={() => toggleDay(day)}
                  trackColor={{ false: Colors.bgElevated, true: Colors.accentSoft }}
                  thumbColor={workingHours[day].enabled ? Colors.accent : Colors.textTertiary}
                />
              </View>
            ))}
          </Card>

          {/* Notifications */}
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          <Card noPadding>
            {[
              { label: 'Session Reminders', desc: '30 min before each session', value: sessionReminders, onToggle: setSessionReminders, icon: 'calendar' },
              { label: 'New Client Alerts', desc: 'When a new client signs up', value: newClientAlerts, onToggle: setNewClientAlerts, icon: 'person-add' },
              { label: 'Message Notifications', desc: 'New messages from clients', value: messageNotifs, onToggle: setMessageNotifs, icon: 'chatbubble' },
            ].map((item, i) => (
              <View key={i} style={[styles.notifRow, i < 2 && styles.dayRowBorder]}>
                <View style={[styles.notifIcon, { backgroundColor: `${Colors.accent}18` }]}>
                  <Ionicons name={item.icon as any} size={16} color={Colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifLabel}>{item.label}</Text>
                  <Text style={styles.notifDesc}>{item.desc}</Text>
                </View>
                <Switch
                  value={item.value}
                  onValueChange={item.onToggle}
                  trackColor={{ false: Colors.bgElevated, true: Colors.accentSoft }}
                  thumbColor={item.value ? Colors.accent : Colors.textTertiary}
                />
              </View>
            ))}
          </Card>

          {/* Save Button */}
          <View style={styles.saveSection}>
            <Button title="Save Changes" onPress={handleSave} loading={saving} full size="lg" />
          </View>
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

  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary,
    letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.sm,
  },

  fieldGroup: { paddingVertical: Spacing.sm },
  fieldBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  fieldLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary, marginBottom: 4 },
  fieldInput: { fontFamily: FontFamily.body, fontSize: FontSize.md, color: Colors.textPrimary, paddingVertical: 4 },
  textArea: { minHeight: 60 },

  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.base },
  dayRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  dayName: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: Colors.textPrimary, width: 100 },
  dayNameOff: { color: Colors.textTertiary },
  dayHours: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1, textAlign: 'right', marginRight: Spacing.md },

  notifRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base },
  notifIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  notifLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: Colors.textPrimary },
  notifDesc: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },

  saveSection: { marginTop: Spacing['2xl'] },
});
