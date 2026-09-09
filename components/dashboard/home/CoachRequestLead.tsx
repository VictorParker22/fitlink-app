/**
 * CoachRequestLead — the best news the dashboard can deliver, at the top.
 *
 * Canvas "Coach Request Arrival", artboard 2. A pending coaching request is
 * never a quiet row two tabs away: it leads Home above today's session, in
 * the same card grammar as "Next session" (surface, 16 radius, 18 padding)
 * lifted with the lime border. Name, the athlete's own intake as chips, the
 * note they wrote, Accept / Decline, and the full request one tap away.
 * Several requests: the newest leads and the rest are counted.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppBusiness, useAppClients } from '../../../context/AppContext';
import { useAlert } from '../../../context/AlertContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { supabase } from '../../../lib/supabase';
import { acceptCoachRequest, declineCoachRequest, describeRequest } from '../../../lib/coachRequests';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

const CoachRequestLead = React.memo(function CoachRequestLead() {
  const router = useRouter();
  const { coachRequests, refreshClients } = useAppClients();
  const { trainer } = useAppBusiness();
  const { showAlert } = useAlert();
  const haptic = useHaptic();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const sorted = [...coachRequests].sort((a, b) => String(b.coach_requested_at ?? '').localeCompare(String(a.coach_requested_at ?? '')));
  const lead = sorted[0];
  const others = sorted.length - 1;

  // The athlete's note is the first message they left in the thread request_coach opened.
  useEffect(() => {
    let alive = true;
    setNote(null);
    if (!lead?.id || !trainer?.id) return;
    (async () => {
      const { data: conv } = await supabase.from('conversations').select('id').eq('client_id', lead.id).eq('trainer_id', trainer.id).maybeSingle();
      if (!alive || !conv?.id) return;
      const { data: m } = await supabase.from('messages').select('content').eq('conversation_id', conv.id).eq('sender_type', 'client').order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (alive && m?.content) setNote(String(m.content).slice(0, 280));
    })();
    return () => { alive = false; };
  }, [lead?.id, trainer?.id]);

  const accept = useCallback(async () => {
    if (!lead || busy) return;
    setBusy(true);
    haptic.trigger('medium');
    const res = await acceptCoachRequest(lead, trainer?.name);
    setBusy(false);
    if (!res.ok) { showAlert({ type: 'error', title: 'Could not accept', message: 'The request could not be accepted. Try again.' }); return; }
    await refreshClients();
    router.push({ pathname: '/request/[clientId]', params: { clientId: lead.id, accepted: '1' } } as any);
  }, [lead, busy, haptic, trainer?.name, showAlert, refreshClients, router]);

  const decline = useCallback(() => {
    if (!lead || busy) return;
    const f = describeRequest(lead);
    showAlert({
      type: 'confirm',
      title: 'Decline this request?',
      message: `${f.displayName} asked to train with you through Find a coach. Declining sends them a short message letting them know you can't take them on right now.`,
      buttons: [
        { text: 'Keep request', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: async () => {
          setBusy(true);
          const res = await declineCoachRequest(lead, trainer?.id);
          setBusy(false);
          haptic.trigger('light');
          if (!res.ok) { showAlert({ type: 'error', title: 'Could not decline', message: 'The request could not be declined. Try again.' }); return; }
          if (res.noticeFailed) showAlert({ type: 'warning', title: 'Declined, but no message sent', message: `The note explaining why could not be sent: ${res.noticeFailed}` });
          await refreshClients();
        } },
      ],
    });
  }, [lead, busy, showAlert, trainer?.id, haptic, refreshClients]);

  if (!lead) return null;
  const f = describeRequest(lead);
  const chips = [f.goal, f.days, f.setting].filter(Boolean) as string[];

  return (
    <View style={styles.card} accessible accessibilityLabel={`New coaching request from ${f.displayName}`}>
      <View style={styles.headerRow}>
        <View style={styles.dot} />
        <Text style={styles.label} numberOfLines={1}>
          New coaching request{f.asked ? ` · ${f.asked}` : ''}{others > 0 ? ` · ${others} more` : ''}
        </Text>
      </View>
      <View style={styles.whoRow}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{f.initials}</Text></View>
        <Text style={styles.title}>{f.displayName} wants to train with you</Text>
      </View>
      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((c) => <View key={c} style={styles.chip}><Text style={styles.chipText}>{c}</Text></View>)}
        </View>
      )}
      {!!note && <Text style={styles.note} numberOfLines={4}>“{note}”</Text>}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.acceptBtn, busy && { opacity: 0.5 }]} onPress={accept} disabled={busy} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Accept ${f.displayName}'s request`}>
          {busy ? <ActivityIndicator size="small" color={CoachColors.onAccent} /> : <Text style={styles.acceptText}>Accept</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.declineBtn, busy && { opacity: 0.5 }]} onPress={decline} disabled={busy} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Decline ${f.displayName}'s request`}>
          <Text style={styles.declineText}>Decline</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.moreRow}
        onPress={() => router.push({ pathname: '/request/[clientId]', params: { clientId: lead.id } } as any)}
        hitSlop={{ top: 6, bottom: 6 }}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="See the full request"
      >
        <Text style={styles.moreText}>See the full request</Text>
        <Ionicons name="chevron-forward" size={14} color={CoachColors.accent} />
      </TouchableOpacity>
    </View>
  );
});

export default CoachRequestLead;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20, marginTop: 24,
    backgroundColor: '#1A2213',
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)',
    borderRadius: 16, borderCurve: 'continuous',
    padding: 18,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 3.5, borderCurve: 'continuous', backgroundColor: CoachColors.accent },
  label: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.accent, flexShrink: 1 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: 21, borderCurve: 'continuous', borderWidth: 1.5, borderColor: CoachColors.accent,
    backgroundColor: '#1E211D', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.accent },
  title: { flex: 1, fontFamily: CoachFonts.headingBold, fontSize: 21.5, lineHeight: 26, color: CoachColors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 5, paddingHorizontal: 10 },
  chipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 12.5, color: CoachColors.textPrimary },
  note: {
    marginTop: 12, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: 'rgba(16,18,16,0.55)', borderRadius: 12, borderCurve: 'continuous',
    fontFamily: CoachFonts.body, fontSize: 14, lineHeight: 20, color: CoachColors.textSecondary,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  acceptBtn: { flex: 1, minHeight: 44, backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  acceptText: { fontFamily: CoachFonts.bodyBold, fontSize: 15, color: CoachColors.onAccent },
  declineBtn: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  declineText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textSecondary },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, minHeight: 24 },
  moreText: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.accent },
});
