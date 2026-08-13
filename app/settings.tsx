import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useApp } from '../context/AppContext';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useHaptic } from '../hooks/useHaptic';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function SettingsScreen() {
  const router = useRouter();
  const { trainer, updateTrainer, createStripeConnectAccount } = useApp();
  const { colors, mode, setMode, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { showAlert } = useAlert();
  const haptic = useHaptic();

  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

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

  const handleConnectStripe = async () => {
    setIsConnectingStripe(true);
    try {
      const { url } = await createStripeConnectAccount();
      if (url) {
        const result = await WebBrowser.openAuthSessionAsync(url, 'fitlink://stripe-return');
        if (result.type === 'success') {
          showAlert({ type: 'success', title: 'Success', message: 'Stripe onboarding completed!' });
          // Note: AppContext will auto-refresh the trainer object via realtime or next load
        }
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Stripe Error', message: err.message || 'Failed to connect to Stripe.' });
    } finally {
      setIsConnectingStripe(false);
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SETTINGS</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {/* Appearance Section */}
          <Text style={styles.sectionTitle}>APPEARANCE</Text>
          <View style={styles.cardContainer}>
            <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
              {themeOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.themeChip,
                    mode === opt.value && styles.themeChipActive,
                  ]}
                  onPress={() => setMode(opt.value)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${opt.label} theme${mode === opt.value ? ', selected' : ''}`}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={16}
                    color={mode === opt.value ? colors.textPrimary : colors.textTertiary}
                  />
                  <Text style={[
                    styles.themeChipText,
                    mode === opt.value && styles.themeChipTextActive,
                  ]}>
                    {opt.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Personal Info */}
          <Text style={styles.sectionTitle}>PERSONAL INFORMATION</Text>
          <View style={styles.cardContainer}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <TextInput style={styles.fieldInput} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.textTertiary} accessibilityLabel="Name" />
            </View>
            <View style={[styles.fieldGroup, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
              <TextInput style={styles.fieldInput} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email address" />
            </View>
            <View style={[styles.fieldGroup, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
              <TextInput style={styles.fieldInput} value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" accessibilityLabel="Phone number" />
            </View>
            <View style={[styles.fieldGroup, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>SPECIALIZATION</Text>
              <TextInput style={styles.fieldInput} value={specialization} onChangeText={setSpecialization} placeholder="e.g. Strength Training, HIIT..." placeholderTextColor={colors.textTertiary} accessibilityLabel="Specialization" />
            </View>
            <View style={[styles.fieldGroup, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>BIO</Text>
              <TextInput
                style={[styles.fieldInput, styles.textArea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell clients about yourself..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                accessibilityLabel="Bio"
              />
            </View>
          </View>

          {/* Working Hours */}
          <Text style={styles.sectionTitle}>WORKING HOURS</Text>
          <View style={styles.cardContainerNoPadding}>
            {DAYS.map((day, i) => (
              <View key={day} style={[styles.dayRow, i < DAYS.length - 1 && styles.rowBorder]}>
                <Text style={[styles.dayName, !workingHours[day].enabled && { color: colors.textTertiary }]}>{day.toUpperCase()}</Text>
                {workingHours[day].enabled && (
                  <Text style={styles.dayHours}>{workingHours[day].start} — {workingHours[day].end}</Text>
                )}
                <Switch
                  value={workingHours[day].enabled}
                  onValueChange={() => {
                    haptic.trigger('light');
                    toggleDay(day);
                  }}
                  trackColor={{ false: colors.border, true: colors.textPrimary }}
                  thumbColor={colors.bgPrimary}
                  accessibilityLabel={`${day} working hours toggle`}
                  accessibilityRole="switch"
                />
              </View>
            ))}
          </View>

          {/* Notifications */}
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          <View style={styles.cardContainerNoPadding}>
            {[
              { label: 'SESSION REMINDERS', desc: '30 min before each session', value: sessionReminders, onToggle: setSessionReminders, icon: 'calendar-outline' },
              { label: 'NEW CLIENT ALERTS', desc: 'When a new client signs up', value: newClientAlerts, onToggle: setNewClientAlerts, icon: 'person-add-outline' },
              { label: 'MESSAGE NOTIFICATIONS', desc: 'New messages from clients', value: messageNotifs, onToggle: setMessageNotifs, icon: 'chatbubble-outline' },
            ].map((item, i) => (
              <View key={i} style={[styles.notifRow, i < 2 && styles.rowBorder]}>
                <View style={styles.notifIcon}>
                  <Ionicons name={item.icon as any} size={16} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifLabel}>{item.label}</Text>
                  <Text style={styles.notifDesc}>{item.desc}</Text>
                </View>
                <Switch
                  value={item.value}
                  onValueChange={(val) => {
                    haptic.trigger('light');
                    item.onToggle(val);
                  }}
                  trackColor={{ false: colors.border, true: colors.textPrimary }}
                  thumbColor={colors.bgPrimary}
                  accessibilityLabel={`${item.label} toggle`}
                  accessibilityRole="switch"
                />
              </View>
            ))}
          </View>

          {/* Monetization */}
          <Text style={styles.sectionTitle}>MONETIZATION</Text>
          <View style={styles.cardContainerNoPadding}>
            <View style={styles.notifRow}>
              <View style={styles.notifInfo}>
                <View style={styles.notifIcon}>
                  <Ionicons name="card-outline" size={16} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifLabel}>STRIPE PAYMENTS</Text>
                  <Text style={styles.notifDesc}>
                    {trainer?.stripe_onboarding_complete 
                      ? 'Your account is connected and ready to accept payments.' 
                      : 'Connect Stripe to accept payments and manage subscriptions.'}
                  </Text>
                </View>
              </View>
              {!trainer?.stripe_onboarding_complete && (
                <TouchableOpacity 
                  style={[styles.stripeBtn, isConnectingStripe && { opacity: 0.5 }]} 
                  onPress={handleConnectStripe}
                  disabled={isConnectingStripe}
                >
                  <Text style={styles.stripeBtnText}>{isConnectingStripe ? 'CONNECTING...' : 'CONNECT'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Save Button */}
          <View style={styles.saveSection}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Save settings changes"
            >
              <Text style={styles.saveBtnText}>{saving ? 'SAVING...' : 'SAVE SETTINGS'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 110 },

  sectionTitle: {
    fontFamily: FontFamily.heading,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.5,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xs,
  },

  cardContainer: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    padding: Spacing.md,
  },
  cardContainerNoPadding: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    overflow: 'hidden',
  },

  // Theme Picker
  themeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
  },
  themeChipActive: {
    borderColor: colors.textPrimary,
    backgroundColor: colors.textPrimary,
  },
  themeChipText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.8,
  },
  themeChipTextActive: {
    color: colors.bgPrimary,
  },

  fieldGroup: { paddingVertical: Spacing.xs },
  fieldBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
  },
  fieldLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  fieldInput: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 4,
  },
  textArea: { minHeight: 60 },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayName: { fontFamily: FontFamily.bodyBold, fontSize: 13, color: colors.textPrimary, width: 90, letterSpacing: 0.5 },
  dayHours: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: colors.textSecondary, flex: 1 },

  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  notifInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1, paddingRight: Spacing.md },
  notifIcon: { width: 32, height: 32, borderRadius: Radius.xs, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  notifLabel: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: colors.textPrimary, letterSpacing: 0.5, marginBottom: 2 },
  notifDesc: { fontFamily: FontFamily.bodyMedium, fontSize: 11, color: colors.textTertiary, lineHeight: 16 },

  stripeBtn: { backgroundColor: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.xs },
  stripeBtnText: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: colors.bgPrimary, letterSpacing: 1 },

  saveSection: {
    marginTop: Spacing['2xl'],
  },
  saveBtn: {
    backgroundColor: colors.textPrimary,
    margin: Spacing.lg,
    height: 48,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontFamily: FontFamily.heading, fontSize: 13, color: colors.bgPrimary, letterSpacing: 1.5 },
});
