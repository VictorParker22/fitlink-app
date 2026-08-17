import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const SUPPORT_EMAIL = 'support@getfitlink.com';
const TOPICS = ['Bug report', 'Feature request', 'Account issue', 'Billing & payouts', 'Other'];

export default function ContactSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [selectedTopic, setSelectedTopic] = useState('');
  const [message, setMessage] = useState('');

  const handleSend = async () => {
    if (!selectedTopic) return Alert.alert('Select a topic', 'Please choose what your message is about.');
    if (!message.trim()) return Alert.alert('Empty message', 'Please describe your issue.');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const subject = `FitLink support — ${selectedTopic}`;
    const body = `${message.trim()}\n\n—\nAccount: ${user?.email || 'unknown'}\nPlatform: ${Platform.OS}`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No mail app found', `Please email us directly at ${SUPPORT_EMAIL}.`);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Contact support</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={s.heroTitle}>Get in touch</Text>
          <Text style={s.heroSubtitle}>
            Pick a topic and write your message below. It opens as an email to our support team, so you keep a copy in your outbox.
          </Text>

          <Text style={s.fieldLabel}>TOPIC</Text>
          <View style={s.topicRow}>
            {TOPICS.map((topic) => {
              const active = selectedTopic === topic;
              return (
                <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                  key={topic}
                  style={[s.topicChip, active && s.topicChipActive]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedTopic(topic); }}
                >
                  <Text style={[s.topicText, active && s.topicTextActive]}>{topic}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.fieldLabel}>YOUR MESSAGE</Text>
          <TextInput
            style={s.textArea}
            placeholder="Describe your issue or feedback…"
            placeholderTextColor={CoachColors.textFaint}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
          />

          {!!user?.email && (
            <Text style={s.emailNote}>We'll reply to {user.email}</Text>
          )}

          <TouchableOpacity style={s.sendBtn} onPress={handleSend} activeOpacity={0.85}>
            <Ionicons name="mail-outline" size={19} color={CoachColors.onAccent} />
            <Text style={s.sendBtnText}>Send via email</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.directRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => Alert.alert('No mail app found', `Email us at ${SUPPORT_EMAIL}.`))}
          >
            <Text style={s.directRowLabel}>Or email us directly</Text>
            <Text style={s.directRowEmail}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textPrimary },
  // paddingBottom is applied inline from the real bottom inset (pushed route: no tab bar).
  scrollContent: { paddingHorizontal: 16 },

  heroTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 27, color: CoachColors.textPrimary,
    marginTop: 16, letterSpacing: -0.3,
  },
  heroSubtitle: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary, lineHeight: 22.5, marginTop: 8 },

  fieldLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 0.8, marginTop: 24, marginBottom: 10,
  },

  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  topicChipActive: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  topicText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },
  topicTextActive: { color: CoachColors.accent, fontFamily: CoachFonts.bodySemiBold },

  textArea: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 16, minHeight: 168,
    fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary, lineHeight: 22.5,
  },

  emailNote: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint, marginTop: 10 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CoachColors.accent, borderRadius: 999, paddingVertical: 15, marginTop: 24,
  },
  sendBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },

  directRow: { alignItems: 'center', marginTop: 24, gap: 3 },
  directRowLabel: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint },
  directRowEmail: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.accent },
});
