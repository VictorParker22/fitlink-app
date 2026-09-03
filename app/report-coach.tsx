/**
 * report-coach.tsx — an athlete flags their coach.
 *
 * App Store guideline 1.2: any app with user-to-user messaging needs a way
 * to report abuse. The report goes to a staff-only table (coach_reports,
 * no user SELECT policy) so the coach can never see who filed it. The
 * athlete keeps full control of the other half — leaving the roster and
 * deleting their account both live on the profile screen.
 *
 * Fixed dark/lime system (constants/coachDesign.ts).
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useClient } from '../context/ClientContext';
import { useAlert } from '../context/AlertContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const C = CoachColors;
const F = CoachFonts;

const REASONS: { key: string; label: string; hint: string }[] = [
  { key: 'inappropriate_messages', label: 'Inappropriate messages', hint: 'Sexual, threatening or abusive content' },
  { key: 'harassment',             label: 'Harassment',             hint: 'Repeated unwanted contact or pressure' },
  { key: 'unsafe_programming',     label: 'Unsafe programming',     hint: 'Training or diet advice that put you at risk' },
  { key: 'payment_issue',          label: 'Payment issue',          hint: 'Charged for something you did not get' },
  { key: 'impersonation',          label: 'Impersonation',          hint: 'Not who they say they are' },
  { key: 'other',                  label: 'Something else',         hint: 'Tell us in your own words' },
];

export default function ReportCoachScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { trainer, clientData } = useClient();
  const { showAlert } = useAlert();

  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  const coachFirst = (trainer?.name || 'your coach').split(' ')[0];
  const canSend = !!reason && !sending && (reason !== 'other' || details.trim().length > 0);

  const submit = async () => {
    if (!canSend || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSending(true);
    const { error } = await supabase.from('coach_reports').insert({
      reporter_user_id: user.id,
      trainer_id: trainer?.id ?? null,
      client_id: clientData?.id ?? null,
      reason,
      details: details.trim() || null,
    });
    setSending(false);
    if (error) {
      showAlert({
        type: 'error',
        title: 'Report not sent',
        message: 'We could not send your report. Check your connection and try again, or email support@getfitlink.com.',
      });
      return;
    }
    showAlert({
      type: 'success',
      title: 'Report received',
      message: `Thank you. A member of the FitLink team reviews every report. ${coachFirst} will not be told who filed it. If you feel unsafe, you can leave the roster from your profile at any time.`,
      buttons: [{ text: 'Done', onPress: () => router.back() }],
    });
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={24} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle} maxFontSizeMultiplier={1.3}>Report a concern</Text>
          <View style={s.backBtn} />
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.lede} maxFontSizeMultiplier={1.4}>
            Tell us what happened with {coachFirst}. Reports go to the FitLink team only. Your coach is never shown who reported them.
          </Text>

          <Text style={s.sectionLabel} maxFontSizeMultiplier={1.3}>What is this about?</Text>
          <View style={s.reasonList}>
            {REASONS.map((r) => {
              const on = reason === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[s.reason, on && s.reasonOn]}
                  onPress={() => { Haptics.selectionAsync(); setReason(r.key); }}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={r.label}
                >
                  <View style={[s.radio, on && s.radioOn]}>
                    {on ? <View style={s.radioDot} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.reasonLabel, on && s.reasonLabelOn]} maxFontSizeMultiplier={1.3}>{r.label}</Text>
                    <Text style={s.reasonHint} maxFontSizeMultiplier={1.3}>{r.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.sectionLabel} maxFontSizeMultiplier={1.3}>
            Details{reason === 'other' ? '' : ' (optional)'}
          </Text>
          <TextInput
            style={s.input}
            placeholder="What happened, and when"
            placeholderTextColor={C.textFaint}
            value={details}
            onChangeText={setDetails}
            multiline
            textAlignVertical="top"
            maxLength={2000}
            accessibilityLabel="Report details"
            selectionColor={C.accent}
          />

          <TouchableOpacity
            style={[s.submit, !canSend && s.submitOff]}
            onPress={submit}
            disabled={!canSend}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Send report"
            accessibilityState={{ disabled: !canSend }}
          >
            {sending
              ? <ActivityIndicator color={C.onAccent} />
              : <Text style={s.submitText} maxFontSizeMultiplier={1.3}>Send report</Text>}
          </TouchableOpacity>

          <Text style={s.footnote} maxFontSizeMultiplier={1.4}>
            If you are in immediate danger, contact local emergency services first.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  lede: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.textSecondary },
  sectionLabel: {
    fontFamily: F.bodySemiBold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase',
    color: C.textFaint, marginTop: 12,
  },
  reasonList: { gap: 8 },
  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 14,
  },
  reasonOn: { borderColor: C.accent },
  radio: {
    width: 22, height: 22, borderRadius: 999, borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: C.accent },
  radioDot: { width: 12, height: 12, borderRadius: 999, backgroundColor: C.accent },
  reasonLabel: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  reasonLabelOn: { color: C.accent },
  reasonHint: { fontFamily: F.body, fontSize: 13, color: C.textSecondary, marginTop: 2 },
  input: {
    minHeight: 120, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 14,
    fontFamily: F.body, fontSize: 15, color: C.textPrimary,
  },
  submit: {
    height: 52, borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  submitOff: { opacity: 0.4 },
  submitText: { fontFamily: F.bodyBold, fontSize: 16, color: C.onAccent },
  footnote: { fontFamily: F.body, fontSize: 12.5, color: C.textFaint, textAlign: 'center', marginTop: 8 },
});
