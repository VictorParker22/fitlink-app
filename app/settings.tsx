import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import Button from '../components/Button';
import Card from '../components/Card';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function SettingsScreen() {
  const router = useRouter();
  const { trainer, updateTrainer } = useApp();
  const { colors, mode, setMode, isDark } = useTheme();
  const { showAlert } = useAlert();

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
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Name Required', message: 'Please enter your name.' });

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
      showAlert({ type: 'success', title: 'Saved!', message: 'Your settings have been updated.' });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const themeOptions: { label: string; value: ThemeMode; icon: string }[] = [
    { label: 'Light', value: 'light', icon: 'sunny' },
    { label: 'Dark', value: 'dark', icon: 'moon' },
    { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Settings</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {/* Appearance Section */}
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>APPEARANCE</Text>
          <Card>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              {themeOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.themeChip,
                    { backgroundColor: colors.bgInput, borderColor: colors.border },
                    mode === opt.value && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                  ]}
                  onPress={() => setMode(opt.value)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={18}
                    color={mode === opt.value ? colors.accent : colors.textTertiary}
                  />
                  <Text style={[
                    styles.themeChipText,
                    { color: colors.textSecondary },
                    mode === opt.value && { color: colors.accent, fontFamily: FontFamily.bodySemiBold },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          {/* Personal Info */}
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>PERSONAL INFORMATION</Text>
          <Card>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>Name</Text>
              <TextInput style={[styles.fieldInput, { color: colors.textPrimary }]} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.textTertiary} />
            </View>
            <View style={[styles.fieldGroup, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>Email</Text>
              <TextInput style={[styles.fieldInput, { color: colors.textPrimary }]} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View style={[styles.fieldGroup, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>Phone</Text>
              <TextInput style={[styles.fieldInput, { color: colors.textPrimary }]} value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
            </View>
            <View style={[styles.fieldGroup, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>Specialization</Text>
              <TextInput style={[styles.fieldInput, { color: colors.textPrimary }]} value={specialization} onChangeText={setSpecialization} placeholder="e.g. Strength Training, HIIT..." placeholderTextColor={colors.textTertiary} />
            </View>
            <View style={[styles.fieldGroup, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>Bio</Text>
              <TextInput
                style={[styles.fieldInput, styles.textArea, { color: colors.textPrimary }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell clients about yourself..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </Card>

          {/* Working Hours */}
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>WORKING HOURS</Text>
          <Card noPadding>
            {DAYS.map((day, i) => (
              <View key={day} style={[styles.dayRow, i < DAYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <Text style={[styles.dayName, { color: workingHours[day].enabled ? colors.textPrimary : colors.textTertiary }]}>{day}</Text>
                {workingHours[day].enabled && (
                  <Text style={[styles.dayHours, { color: colors.textSecondary }]}>{workingHours[day].start} — {workingHours[day].end}</Text>
                )}
                <Switch
                  value={workingHours[day].enabled}
                  onValueChange={() => toggleDay(day)}
                  trackColor={{ false: colors.bgElevated, true: colors.accentSoft }}
                  thumbColor={workingHours[day].enabled ? colors.accent : colors.textTertiary}
                />
              </View>
            ))}
          </Card>

          {/* Notifications */}
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>NOTIFICATIONS</Text>
          <Card noPadding>
            {[
              { label: 'Session Reminders', desc: '30 min before each session', value: sessionReminders, onToggle: setSessionReminders, icon: 'calendar' },
              { label: 'New Client Alerts', desc: 'When a new client signs up', value: newClientAlerts, onToggle: setNewClientAlerts, icon: 'person-add' },
              { label: 'Message Notifications', desc: 'New messages from clients', value: messageNotifs, onToggle: setMessageNotifs, icon: 'chatbubble' },
            ].map((item, i) => (
              <View key={i} style={[styles.notifRow, i < 2 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={[styles.notifIcon, { backgroundColor: `${colors.accent}18` }]}>
                  <Ionicons name={item.icon as any} size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <Text style={[styles.notifDesc, { color: colors.textTertiary }]}>{item.desc}</Text>
                </View>
                <Switch
                  value={item.value}
                  onValueChange={item.onToggle}
                  trackColor={{ false: colors.bgElevated, true: colors.accentSoft }}
                  thumbColor={item.value ? colors.accent : colors.textTertiary}
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
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs,
    letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.sm,
  },

  // Theme Picker
  themeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  themeChipText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
  },

  fieldGroup: { paddingVertical: Spacing.sm },
  fieldLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, marginBottom: 4 },
  fieldInput: { fontFamily: FontFamily.body, fontSize: FontSize.md, paddingVertical: 4 },
  textArea: { minHeight: 60 },

  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.base },
  dayName: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, width: 100 },
  dayHours: { fontFamily: FontFamily.body, fontSize: FontSize.sm, flex: 1, textAlign: 'right', marginRight: Spacing.md },

  notifRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base },
  notifIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  notifLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base },
  notifDesc: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 1 },

  saveSection: { marginTop: Spacing['2xl'] },
});
