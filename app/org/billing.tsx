import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { bpsToPercentLabel } from '../../lib/platformFee';

/**
 * Org seat billing (design 29b) — "a gym buys seats, not features".
 *
 * THE ONE RULE THIS SCREEN OBEYS. It cannot grant a seat. Every control here
 * ends at Stripe; `organizations.seat_limit` is written only by
 * apply_org_seats() from a confirmed webhook, and a trigger
 * (enterprise_05) rejects any attempt to write it from the app. So this screen
 * never optimistically shows a seat count it wishes were true — after
 * checkout it reloads and shows what the database actually says, even if that
 * is briefly the old number while Stripe's webhook is in flight. A pending
 * state that is honest beats an instant one that is a guess.
 *
 * WHAT EACH ABSENT VALUE MEANS, because they are all different:
 *  - `seats_paid` NULL — never subscribed. One free seat (the owner). Shown as
 *    an offer, not as a limit that has been hit.
 *  - `seat_status` NULL — same thing from the billing side: no subscription
 *    has ever existed. No renewal date is shown, because there is none.
 *  - `seat_status` 'past_due' / 'unpaid' — the card failed. Seats are FROZEN
 *    at the current headcount: nobody is evicted, nobody new can be added.
 *    That distinction is stated in words, because "past due" alone would leave
 *    an owner wondering whether their coaches just lost access.
 *  - `seat_price_cents` NULL — we have no price to quote (the Stripe price is
 *    not configured). The monthly total is OMITTED rather than shown as $0.
 *  - `invites_pending` — counted separately from used seats. An invitation is
 *    not a seat until someone accepts it; folding them in would tell an owner
 *    they are full when they are not.
 */

interface Billing {
  org_name: string;
  seats_used: number;
  seats_paid: number | null;
  seats_effective: number;
  invites_pending: number;
  seat_status: string | null;
  seat_price_cents: number | null;
  seats_renew_at: string | null;
  org_share_bps: number;
  is_owner: boolean;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'no-org' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; billing: Billing };

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function renewLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

/**
 * Stripe's status vocabulary, translated into what it means for the gym's
 * coaches — which is the only thing the owner actually needs to know.
 */
function statusMeaning(status: string | null): { label: string; detail: string; tone: 'ok' | 'warn' | 'none' } {
  switch (status) {
    case 'active':
      return { label: 'Active', detail: '', tone: 'ok' };
    case 'trialing':
      return { label: 'Trial', detail: 'Your trial is running. Seats work normally.', tone: 'ok' };
    case 'past_due':
    case 'unpaid':
      return {
        label: 'Payment failed',
        detail: 'Your coaches keep working and keep their athletes — nobody has been removed. You just cannot add a new coach until the card is fixed.',
        tone: 'warn',
      };
    case 'canceled':
      return {
        label: 'Cancelled',
        detail: 'Your coaches keep working and keep their athletes. Seats are frozen at your current team size until you subscribe again.',
        tone: 'warn',
      };
    case 'incomplete':
    case 'incomplete_expired':
      return { label: 'Not completed', detail: 'The last checkout was not finished.', tone: 'warn' };
    default:
      return { label: '', detail: '', tone: 'none' };
  }
}

export default function OrgBillingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    // .rpc() resolves with { error }; it does not throw (INVARIANTS §2).
    const { data: orgId, error: orgIdError } = await supabase.rpc('my_org_id');
    if (orgIdError) {
      setPhase({ kind: 'error', message: 'We could not check your organisation membership.' });
      return;
    }
    if (!orgId) {
      setPhase({ kind: 'no-org' });
      return;
    }

    const { data, error } = await supabase.rpc('org_billing', { p_org_id: orgId });
    if (error) {
      setPhase({ kind: 'error', message: 'We could not load your seat billing.' });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      // The RPC enforces owner/admin internally and returns nothing otherwise.
      setPhase({ kind: 'error', message: 'Only an owner or admin can see billing for this organisation.' });
      return;
    }
    setPhase({ kind: 'ready', billing: row as Billing });
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /**
   * Change the seat count. Opens Stripe Checkout on a first purchase, or
   * adjusts the existing subscription's quantity. Either way this function
   * writes NOTHING to our database.
   */
  const changeSeats = useCallback(async (nextSeats: number) => {
    if (phase.kind !== 'ready') return;
    setBusy(true);
    setNotice(null);

    const { data: orgId } = await supabase.rpc('my_org_id');
    const { data, error } = await supabase.functions.invoke('create-org-subscription', {
      body: { orgId, seats: nextSeats },
    });

    setBusy(false);

    if (error) {
      // The function returns a specific message for the cases an owner can
      // act on (too few seats for the team, billing not configured). Show it
      // rather than a generic failure.
      const detail = (data as any)?.error;
      setNotice(typeof detail === 'string' ? detail : 'We could not reach billing. Please try again.');
      return;
    }

    if ((data as any)?.url) {
      const url = (data as any).url as string;
      if (Platform.OS === 'web') window.location.assign(url);
      else await Linking.openURL(url);
      return;
    }

    // Quantity change on an existing subscription. Stripe has accepted it; our
    // seat count updates when the webhook confirms, so say exactly that rather
    // than showing the new number as though it were already true.
    setNotice(`Stripe has your change to ${nextSeats} seats. It appears here once the payment confirms.`);
    load();
  }, [phase, load]);

  const pad = { paddingBottom: insets.bottom + 32 };

  if (phase.kind === 'loading') {
    return (
      <SafeAreaView style={st.screen}>
        <View style={st.center}><ActivityIndicator color={CoachColors.accent} /></View>
      </SafeAreaView>
    );
  }

  if (phase.kind === 'no-org') {
    return (
      <SafeAreaView style={st.screen}>
        <Header router={router} />
        <View style={st.center}>
          <Ionicons name="business-outline" size={40} color={CoachColors.textFaint} />
          <Text style={st.emptyTitle}>You are not part of an organisation</Text>
          <Text style={st.emptyBody}>
            Seat billing is for gyms running several coaches. As an independent coach you keep
            everything you earn, minus the platform fee.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.kind === 'error') {
    return (
      <SafeAreaView style={st.screen}>
        <Header router={router} />
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={40} color={CoachColors.warning} />
          <Text style={st.emptyTitle}>{phase.message}</Text>
          <TouchableOpacity style={st.retry} onPress={load}>
            <Text style={st.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const b = phase.billing;
  const status = statusMeaning(b.seat_status);
  const renews = renewLabel(b.seats_renew_at);
  const neverSubscribed = b.seats_paid === null;
  const canAdd = b.seats_used < b.seats_effective;

  return (
    <SafeAreaView style={st.screen} edges={['top']}>
      <Header router={router} />
      <ScrollView
        contentContainerStyle={[st.body, pad]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} />}
      >
        <Text style={st.orgName}>{b.org_name}</Text>

        {/* ── Seats ───────────────────────────────────────────── */}
        <View style={st.card}>
          <Text style={st.cardLabel}>Seats</Text>
          <View style={st.seatRow}>
            <Text style={st.seatBig}>{b.seats_used}</Text>
            {/* No denominator when nothing is provisioned — "3 of 0" would be
                a lie about a limit that does not exist yet. */}
            {!neverSubscribed && <Text style={st.seatOf}>of {b.seats_paid}</Text>}
          </View>
          <Text style={st.seatSub}>
            {b.seats_used === 1 ? '1 coach working' : `${b.seats_used} coaches working`}
            {b.invites_pending > 0 && ` · ${b.invites_pending} invitation${b.invites_pending === 1 ? '' : 's'} not yet accepted`}
          </Text>

          {neverSubscribed && (
            <Text style={st.freeNote}>
              Your first seat is free. Adding a second coach is what starts billing.
            </Text>
          )}

          {!canAdd && !neverSubscribed && (
            <Text style={st.freeNote}>
              Every seat is in use. Add a seat to invite another coach.
            </Text>
          )}
        </View>

        {/* ── Billing status ──────────────────────────────────── */}
        {status.label !== '' && (
          <View style={[st.card, status.tone === 'warn' && st.cardWarn]}>
            <Text style={st.cardLabel}>Billing</Text>
            <Text style={[st.statusLabel, status.tone === 'warn' && st.statusWarn]}>{status.label}</Text>
            {status.detail !== '' && <Text style={st.statusDetail}>{status.detail}</Text>}

            {/* Price and renewal are omitted, not zeroed, when unknown. */}
            {b.seat_price_cents !== null && b.seats_paid !== null && (
              <Text style={st.priceLine}>
                {money(b.seat_price_cents)} per seat · {money(b.seat_price_cents * b.seats_paid)} a month
              </Text>
            )}
            {renews && b.seat_status === 'active' && (
              <Text style={st.renewLine}>Renews {renews}</Text>
            )}
          </View>
        )}

        {/* ── The gym's cut ───────────────────────────────────── */}
        <View style={st.card}>
          <Text style={st.cardLabel}>Your share of coach revenue</Text>
          {b.org_share_bps > 0 ? (
            <Text style={st.shareBig}>{bpsToPercentLabel(b.org_share_bps)}</Text>
          ) : (
            <>
              <Text style={st.shareNone}>No org share set</Text>
              <Text style={st.statusDetail}>
                Your coaches keep everything they earn, minus the platform fee. Set a share
                only if your gym takes a cut of what its coaches bill.
              </Text>
            </>
          )}
        </View>

        {/* ── Controls, owner only ────────────────────────────── */}
        {b.is_owner ? (
          <View style={st.actions}>
            <TouchableOpacity
              style={[st.primary, busy && st.disabled]}
              disabled={busy}
              onPress={() => changeSeats(Math.max(b.seats_used, (b.seats_paid ?? 1)) + 1)}
            >
              {busy
                ? <ActivityIndicator color={CoachColors.onAccent} />
                : <Text style={st.primaryText}>
                    {neverSubscribed ? 'Buy seats' : 'Add a seat'}
                  </Text>}
            </TouchableOpacity>

            {/* Removing a seat is only offered when there is a spare one to
                remove. Offering it while every seat is filled would present a
                button whose only outcome is an error. */}
            {!neverSubscribed && (b.seats_paid ?? 0) > b.seats_used && (
              <TouchableOpacity
                style={[st.secondary, busy && st.disabled]}
                disabled={busy}
                onPress={() => changeSeats((b.seats_paid ?? 1) - 1)}
              >
                <Text style={st.secondaryText}>Remove a seat</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={st.adminNote}>Only the owner can change seats or payment details.</Text>
        )}

        {notice && <Text style={st.notice}>{notice}</Text>}

        <Text style={st.foot}>
          Seats are counted from coaches who have accepted an invitation. Reducing seats or
          cancelling never removes a coach who is already working.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={st.header}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="chevron-back" size={24} color={CoachColors.textPrimary} />
      </TouchableOpacity>
      <Text style={st.headerTitle}>Seats and billing</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CoachColors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 16, color: CoachColors.textPrimary },
  body: { paddingHorizontal: 20, gap: 14 },
  orgName: { fontFamily: CoachFonts.headingBold, fontSize: 26, color: CoachColors.textPrimary, marginBottom: 2 },

  card: {
    backgroundColor: CoachColors.surface, borderRadius: 24, borderCurve: 'continuous', padding: 20,
    borderWidth: 1, borderColor: CoachColors.borderMuted, gap: 6,
  },
  cardWarn: { borderColor: CoachColors.warning },
  cardLabel: {
    fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  seatRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  seatBig: { fontFamily: CoachFonts.headingBold, fontSize: 40, color: CoachColors.textPrimary },
  seatOf: { fontFamily: CoachFonts.body, fontSize: 18, color: CoachColors.textSecondary },
  seatSub: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary },
  freeNote: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.accent, marginTop: 4 },

  statusLabel: { fontFamily: CoachFonts.headingSemiBold, fontSize: 20, color: CoachColors.textPrimary },
  statusWarn: { color: CoachColors.warning },
  statusDetail: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary, lineHeight: 19 },
  priceLine: { fontFamily: CoachFonts.bodyMedium, fontSize: 14, color: CoachColors.textPrimary, marginTop: 6 },
  renewLine: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },

  shareBig: { fontFamily: CoachFonts.headingBold, fontSize: 32, color: CoachColors.accent },
  shareNone: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textSecondary },

  actions: { gap: 10, marginTop: 4 },
  primary: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', minHeight: 54,
  },
  primaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.onAccent },
  secondary: {
    borderRadius: 999, borderCurve: 'continuous', paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: CoachColors.border,
  },
  secondaryText: { fontFamily: CoachFonts.bodyMedium, fontSize: 15, color: CoachColors.textSecondary },
  disabled: { opacity: 0.6 },
  adminNote: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, textAlign: 'center', marginTop: 6 },
  notice: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.accent, textAlign: 'center' },

  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary, textAlign: 'center' },
  emptyBody: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retry: {
    marginTop: 8, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 12, paddingHorizontal: 24,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  retryText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14, color: CoachColors.textPrimary },

  foot: {
    fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textFaint,
    lineHeight: 18, marginTop: 8,
  },
});
