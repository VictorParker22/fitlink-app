/**
 * /request/[clientId] — one coaching request, and the decision.
 *
 * Canvas "Coach Request Arrival", artboards 3 and 5. Every path lands here:
 * the push on the lock screen (data.url), the Home lead's "See the full
 * request", the Notifications row, the Clients tab. Shows who asked, the
 * intake they wrote in Find a coach, their note, what accepting does, and
 * the decision in a sticky footer. Accepting shows the roster moment
 * (CelebrationOverlay) with the two things a coach does next.
 *
 * The athlete is read from the coach's own client rows (the context query
 * already includes requested_trainer_id rows) with a direct fallback read
 * for a push that arrives before the context loaded. A request that is no
 * longer pending (answered on another device) says so instead of showing
 * stale buttons.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAppBusiness, useAppClients } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { useHaptic } from '../../hooks/useHaptic';
import CelebrationOverlay from '../../components/CelebrationOverlay';
import { acceptCoachRequest, declineCoachRequest, describeRequest, type RequestingClient } from '../../lib/coachRequests';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { goBackOr, COACH_HOME } from '../../lib/nav';

export default function CoachRequestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ clientId?: string; accepted?: string }>();
  const clientId = typeof params.clientId === 'string' ? params.clientId : '';
  const { coachRequests, clients, refreshClients } = useAppClients();
  const { trainer } = useAppBusiness();
  const { showAlert } = useAlert();
  const haptic = useHaptic();

  const [fetched, setFetched] = useState<RequestingClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(params.accepted === '1');

  const pending = useMemo(() => coachRequests.find((c) => c.id === clientId) ?? null, [coachRequests, clientId]);
  const onRoster = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);
  const client: RequestingClient | null = pending ?? onRoster ?? fetched;

  // A push can arrive before the context has the row: read it directly
  // (RLS lets the requested coach read a requesting athlete's row).
  useEffect(() => {
    if (!clientId || pending || onRoster) return;
    let alive = true;
    setLoading(true);
    supabase.from('clients').select('id, name, coach_requested_at, assessment_data, trainer_id, requested_trainer_id').eq('id', clientId).maybeSingle()
      .then(({ data }) => { if (alive) { setFetched(data as any); setLoading(false); } });
    return () => { alive = false; };
  }, [clientId, pending, onRoster]);

  useEffect(() => {
    let alive = true;
    if (!clientId || !trainer?.id) return;
    (async () => {
      const { data: conv } = await supabase.from('conversations').select('id').eq('client_id', clientId).eq('trainer_id', trainer.id).maybeSingle();
      if (!alive || !conv?.id) return;
      const { data: m } = await supabase.from('messages').select('content').eq('conversation_id', conv.id).eq('sender_type', 'client').order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (alive && m?.content) setNote(String(m.content).slice(0, 600));
    })();
    return () => { alive = false; };
  }, [clientId, trainer?.id]);

  const f = client ? describeRequest(client) : null;
  const isPending = !!pending;

  const accept = useCallback(async () => {
    if (!client || busy) return;
    setBusy(true);
    haptic.trigger('medium');
    const res = await acceptCoachRequest(client, trainer?.name);
    setBusy(false);
    if (!res.ok) { showAlert({ type: 'error', title: 'Could not accept', message: 'The request could not be accepted. Try again.' }); return; }
    setAccepted(true);
    refreshClients().catch(() => {});
  }, [client, busy, haptic, trainer?.name, showAlert, refreshClients]);

  const decline = useCallback(() => {
    if (!client || busy || !f) return;
    showAlert({
      type: 'confirm',
      title: 'Decline this request?',
      message: `${f.displayName} asked to train with you through Find a coach. Declining sends them a short message letting them know you can't take them on right now.`,
      buttons: [
        { text: 'Keep request', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: async () => {
          setBusy(true);
          const res = await declineCoachRequest(client, trainer?.id);
          setBusy(false);
          haptic.trigger('light');
          if (!res.ok) { showAlert({ type: 'error', title: 'Could not decline', message: 'The request could not be declined. Try again.' }); return; }
          if (res.noticeFailed) showAlert({ type: 'warning', title: 'Declined, but no message sent', message: `The note explaining why could not be sent: ${res.noticeFailed}` });
          await refreshClients();
          goBackOr(router, COACH_HOME);
        } },
      ],
    });
  }, [client, busy, f, showAlert, trainer?.id, haptic, refreshClients, router]);

  const facts: { label: string; value: string }[] = f ? [
    ...(f.goal ? [{ label: 'Goal', value: f.goal }] : []),
    ...(f.days ? [{ label: 'Days', value: f.days }] : []),
    ...(f.setting ? [{ label: 'Where', value: f.setting }] : []),
    ...(f.experience ? [{ label: 'Experience', value: f.experience }] : []),
  ] : [];

  return (
    <View style={st.container}>
      <View style={[st.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => goBackOr(router, COACH_HOME)} style={st.backBtn} activeOpacity={0.7} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Coaching request</Text>
        <View style={{ width: 40 }} />
      </View>

      {!client ? (
        <View style={st.center}>
          {loading ? <ActivityIndicator color={CoachColors.accent} /> : (
            <>
              <Text style={st.emptyTitle}>This request is no longer here</Text>
              <Text style={st.emptyText}>It was answered already, or the athlete withdrew it.</Text>
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 180 }} showsVerticalScrollIndicator={false}>
          <View style={st.who}>
            <View style={st.avatar}><Text style={st.avatarText}>{f!.initials}</Text></View>
            <Text style={st.name}>{f!.displayName}</Text>
            <Text style={st.asked}>
              {isPending ? `Asked to train with you${f!.asked ? ` · ${f!.asked}` : ''}` : onRoster ? 'On your roster' : 'No longer pending'}
            </Text>
          </View>

          {facts.length > 0 && (
            <View style={st.factCard}>
              {facts.map((row, i) => (
                <View key={row.label} style={[st.factRow, i < facts.length - 1 && st.factRowBorder]}>
                  <Text style={st.factLabel}>{row.label}</Text>
                  <Text style={st.factValue} numberOfLines={2}>{row.value}</Text>
                </View>
              ))}
            </View>
          )}

          {!!note && (
            <View style={st.section}>
              <Text style={st.sectionTitle}>{f!.firstName === 'Athlete' ? 'Their note' : `${f!.firstName}'s note`}</Text>
              <View style={st.noteCard}><Text style={st.noteText}>{note}</Text></View>
            </View>
          )}

          {isPending && (
            <View style={st.section}>
              <Text style={st.sectionTitle}>If you accept</Text>
              <View style={{ gap: 10 }}>
                {[
                  `${f!.firstName} joins your roster on a trial and sees your passes.`,
                  'Your thread opens with a short line from you; edit it any time.',
                  `${f!.firstName}'s first week is yours to set. Until then their corner keeps them moving.`,
                ].map((line) => (
                  <View key={line} style={st.bulletRow}><View style={st.bullet} /><Text style={st.bulletText}>{line}</Text></View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {client && isPending && !accepted && (
        <View style={[st.footer, { paddingBottom: insets.bottom + 14 }]}>
          <TouchableOpacity style={[st.acceptBtn, busy && { opacity: 0.5 }]} onPress={accept} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Accept ${f!.displayName}`}>
            {busy ? <ActivityIndicator size="small" color={CoachColors.onAccent} /> : <Text style={st.acceptText}>Accept {f!.firstName}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[st.declineBtn, busy && { opacity: 0.5 }]} onPress={decline} disabled={busy} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Decline">
            <Text style={st.declineText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}

      {client && f && (
        <CelebrationOverlay
          visible={accepted}
          kind="first-client"
          title={f.displayName}
          subtitle={`${f.firstName} is on a trial from today. Your thread is open, and their first week is yours to write.`}
          primary={{ label: 'Set up their first week', onPress: () => { setAccepted(false); router.replace(`/client/${client.id}` as any); } }}
          secondary={{ label: 'Open the thread', onPress: () => { setAccepted(false); router.replace('/(tabs)/messages' as any); } }}
          onDismiss={() => { setAccepted(false); goBackOr(router, COACH_HOME); }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 19, color: CoachColors.textPrimary, textAlign: 'center' },
  emptyText: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 22 },
  who: { alignItems: 'center', gap: 10, paddingTop: 16, paddingBottom: 8 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, borderCurve: 'continuous', borderWidth: 2, borderColor: CoachColors.accent,
    backgroundColor: '#1E211D', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 26, color: CoachColors.accent },
  name: { fontFamily: CoachFonts.headingBold, fontSize: 26, lineHeight: 30, color: CoachColors.textPrimary, textAlign: 'center' },
  asked: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted },
  factCard: {
    marginTop: 16, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 16, borderCurve: 'continuous', paddingHorizontal: 16, paddingVertical: 4,
  },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, minHeight: 48 },
  factRowBorder: { borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted },
  factLabel: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted },
  factValue: { flexShrink: 1, textAlign: 'right', fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  section: { marginTop: 16, gap: 8 },
  sectionTitle: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase' },
  noteCard: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 16, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 16 },
  noteText: { fontFamily: CoachFonts.body, fontSize: 15, lineHeight: 22, color: CoachColors.textPrimary },
  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: CoachColors.accent, marginTop: 7 },
  bulletText: { flex: 1, fontFamily: CoachFonts.body, fontSize: 14, lineHeight: 20, color: CoachColors.textSecondary },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, gap: 10,
    backgroundColor: CoachColors.bg, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  acceptBtn: { minHeight: 52, backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  acceptText: { fontFamily: CoachFonts.bodyBold, fontSize: 16, color: CoachColors.onAccent },
  declineBtn: { minHeight: 48, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  declineText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textSecondary },
});
