import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useApp } from '../context/AppContext';
import { useAlert } from '../context/AlertContext';
import { useHaptic } from '../hooks/useHaptic';
import { getSoundsEnabled, setSoundsEnabled } from '../lib/sounds';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type DayHours = { start: string; end: string; enabled: boolean };

export default function SettingsScreen() {
  const router = useRouter();
  const { trainer, updateTrainer, createStripeConnectAccount } = useApp();
  const { showAlert } = useAlert();
  const haptic = useHaptic();

  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  const [name, setName] = useState(trainer?.name || '');
  const [email, setEmail] = useState(trainer?.email || '');
  const [phone, setPhone] = useState(trainer?.phone || '');
  const [bio, setBio] = useState(trainer?.bio || '');
  const [specialization, setSpecialization] = useState(trainer?.specialization || '');
  const [saving, setSaving] = useState(false);

  // Notification preferences — seeded from the saved values, defaulting to on.
  const savedPrefs = trainer?.notification_prefs || {};
  const [sessionReminders, setSessionReminders] = useState(savedPrefs.sessionReminders ?? true);
  const [newClientAlerts, setNewClientAlerts] = useState(savedPrefs.newClientAlerts ?? true);
  const [messageNotifs, setMessageNotifs] = useState(savedPrefs.messageNotifs ?? true);

  // UI sounds — persisted locally via lib/sounds, independent of trainer prefs.
  const [uiSounds, setUiSounds] = useState(true);
  useEffect(() => { getSoundsEnabled().then(setUiSounds); }, []);

  // Working hours
  const defaultHours: DayHours = { start: '9:00 AM', end: '5:00 PM', enabled: true };
  const [workingHours, setWorkingHours] = useState<Record<string, DayHours>>(
    DAYS.reduce((acc, day) => ({
      ...acc,
      [day]: trainer?.working_hours?.[day] || { ...defaultHours, enabled: !['Saturday', 'Sunday'].includes(day) },
    }), {} as Record<string, DayHours>)
  );

  useEffect(() => {
    if (trainer) {
      setName(trainer.name || '');
      setEmail(trainer.email || '');
      setPhone(trainer.phone || '');
      setBio(trainer.bio || '');
      setSpecialization(trainer.specialization || '');
      const prefs = trainer.notification_prefs || {};
      setSessionReminders(prefs.sessionReminders ?? true);
      setNewClientAlerts(prefs.newClientAlerts ?? true);
      setMessageNotifs(prefs.messageNotifs ?? true);
      if (trainer.working_hours) {
        setWorkingHours(
          DAYS.reduce((acc, day) => ({
            ...acc,
            [day]: trainer.working_hours?.[day] || { ...defaultHours, enabled: !['Saturday', 'Sunday'].includes(day) },
          }), {} as Record<string, DayHours>)
        );
      }
    }
  }, [trainer]);

  const toggleDay = (day: string) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Name required', message: 'Please enter your name.' });

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
      showAlert({ type: 'success', title: 'Saved', message: 'Your settings have been updated.' });
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
          showAlert({ type: 'success', title: 'Success', message: 'Stripe onboarding completed.' });
          // AppContext refreshes the trainer object via realtime or next load
        }
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Stripe error', message: err.message || 'Failed to connect to Stripe.' });
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const notifRows = [
    { key: 'sessions', label: 'Session reminders', desc: '30 min before each session', value: sessionReminders, onToggle: setSessionReminders, icon: 'calendar-outline' },
    { key: 'clients', label: 'New client alerts', desc: 'When a new client signs up', value: newClientAlerts, onToggle: setNewClientAlerts, icon: 'person-add-outline' },
    { key: 'messages', label: 'Message notifications', desc: 'New messages from clients', value: messageNotifs, onToggle: setMessageNotifs, icon: 'chatbubble-outline' },
  ];

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity hitSlop={2} onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={25} color={CoachColors.textSecondary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Profile */}
          <Text style={s.sectionLabel}>Profile</Text>
          <View style={s.card}>
            <Field label="Full name">
              <TextInput style={s.fieldInput} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={CoachColors.textFaint} accessibilityLabel="Name" />
            </Field>
            <Field label="Email address" bordered>
              <TextInput style={s.fieldInput} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor={CoachColors.textFaint} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email address" />
            </Field>
            <Field label="Phone number" bordered>
              <TextInput style={s.fieldInput} value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" placeholderTextColor={CoachColors.textFaint} keyboardType="phone-pad" accessibilityLabel="Phone number" />
            </Field>
            <Field label="Specialization" bordered>
              <TextInput style={s.fieldInput} value={specialization} onChangeText={setSpecialization} placeholder="e.g. Strength training, HIIT" placeholderTextColor={CoachColors.textFaint} accessibilityLabel="Specialization" />
            </Field>
            <Field label="Bio" bordered>
              <TextInput
                style={[s.fieldInput, s.textArea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell clients about yourself"
                placeholderTextColor={CoachColors.textFaint}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                accessibilityLabel="Bio"
              />
            </Field>
          </View>

          {/* Working hours */}
          <Text style={s.sectionLabel}>Working hours</Text>
          <View style={s.cardFlush}>
            {DAYS.map((day, i) => (
              <View key={day} style={[s.dayRow, i < DAYS.length - 1 && s.rowBorder]}>
                <Text style={[s.dayName, !workingHours[day].enabled && { color: CoachColors.textFaint }]}>{day}</Text>
                {workingHours[day].enabled ? (
                  <Text style={s.dayHours}>{workingHours[day].start} – {workingHours[day].end}</Text>
                ) : (
                  <Text style={[s.dayHours, { color: CoachColors.textFaint }]}>Off</Text>
                )}
                <Switch
                  value={workingHours[day].enabled}
                  onValueChange={() => {
                    haptic.trigger('light');
                    toggleDay(day);
                  }}
                  trackColor={{ false: CoachColors.border, true: CoachColors.accent }}
                  thumbColor={workingHours[day].enabled ? CoachColors.onAccent : CoachColors.textMuted}
                  accessibilityLabel={`${day} working hours toggle`}
                  accessibilityRole="switch"
                />
              </View>
            ))}
          </View>

          {/* Notifications */}
          <Text style={s.sectionLabel}>Notifications</Text>
          <View style={s.cardFlush}>
            {notifRows.map((item, i) => (
              <View key={item.key} style={[s.notifRow, i < notifRows.length - 1 && s.rowBorder]}>
                <View style={s.notifIcon}>
                  <Ionicons name={item.icon as any} size={18} color={CoachColors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.notifLabel}>{item.label}</Text>
                  <Text style={s.notifDesc}>{item.desc}</Text>
                </View>
                <Switch
                  value={item.value}
                  onValueChange={(val) => {
                    haptic.trigger('light');
                    item.onToggle(val);
                  }}
                  trackColor={{ false: CoachColors.border, true: CoachColors.accent }}
                  thumbColor={item.value ? CoachColors.onAccent : CoachColors.textMuted}
                  accessibilityLabel={`${item.label} toggle`}
                  accessibilityRole="switch"
                />
              </View>
            ))}
          </View>

          {/* Sounds */}
          <Text style={s.sectionLabel}>Sounds</Text>
          <View style={s.cardFlush}>
            <View style={s.notifRow}>
              <View style={s.notifIcon}>
                <Ionicons name="volume-medium-outline" size={18} color={CoachColors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.notifLabel}>Sounds</Text>
                <Text style={s.notifDesc}>Soft sounds when you complete things</Text>
              </View>
              <Switch
                value={uiSounds}
                onValueChange={(val) => {
                  haptic.trigger('light');
                  setUiSounds(val);
                  setSoundsEnabled(val);
                }}
                trackColor={{ false: CoachColors.border, true: CoachColors.accent }}
                thumbColor={uiSounds ? CoachColors.onAccent : CoachColors.textMuted}
                accessibilityLabel="Sounds toggle"
                accessibilityRole="switch"
              />
            </View>
          </View>

          {/* Payments */}
          <Text style={s.sectionLabel}>Payments</Text>
          <View style={s.cardFlush}>
            <View style={s.notifRow}>
              <View style={s.notifIcon}>
                <Ionicons name="card-outline" size={18} color={CoachColors.textSecondary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={s.notifLabel}>Stripe payments</Text>
                <Text style={s.notifDesc}>
                  {trainer?.stripe_onboarding_complete
                    ? 'Your account is connected and ready to accept payments.'
                    : 'Connect Stripe to accept payments and manage subscriptions.'}
                </Text>
              </View>
              {trainer?.stripe_onboarding_complete ? (
                <View style={s.connectedPill}>
                  <Ionicons name="checkmark-circle" size={15} color={CoachColors.accent} />
                  <Text style={s.connectedPillText}>Connected</Text>
                </View>
              ) : (
                <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
                  style={[s.stripeBtn, isConnectingStripe && { opacity: 0.5 }]}
                  onPress={handleConnectStripe}
                  disabled={isConnectingStripe}
                  activeOpacity={0.85}
                >
                  <Text style={s.stripeBtnText}>{isConnectingStripe ? 'Connecting…' : 'Connect'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Save settings changes"
          >
            <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, bordered, children }: { label: string; bordered?: boolean; children: React.ReactNode }) {
  return (
    <View style={[s.fieldGroup, bordered && s.fieldBorder]}>
      <Text style={s.fieldLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 60 },

  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5,
    color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 24, marginBottom: 8,
  },

  card: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 16,
  },
  cardFlush: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, overflow: 'hidden',
  },

  fieldGroup: { paddingVertical: 6 },
  fieldBorder: { borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, marginTop: 8, paddingTop: 12 },
  fieldLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11,
    color: CoachColors.textFaint, letterSpacing: 0.8, marginBottom: 3,
  },
  fieldInput: { fontFamily: CoachFonts.bodyMedium, fontSize: 16, color: CoachColors.textPrimary, paddingVertical: 4 },
  textArea: { minHeight: 64 },

  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted },
  dayName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary, width: 96 },
  dayHours: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, flex: 1 },

  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  notifIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  notifLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary, marginBottom: 2 },
  notifDesc: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, lineHeight: 18 },

  connectedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: CoachColors.accentSofter, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  connectedPillText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.accent },

  stripeBtn: { backgroundColor: CoachColors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  stripeBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.onAccent },

  saveBtn: {
    backgroundColor: CoachColors.accent, height: 50, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', marginTop: 28,
  },
  saveBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },
});
