import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

/**
 * FitLink Ops (designs 27a health / 27b attack signals) — internal only.
 *
 * ── THE HARDEST THING ABOUT THIS SCREEN ─────────────────────────────
 * 27a asks for API p95, error rate, crash-free sessions, downloads today,
 * push delivery, release adoption and dependency health. NONE of those are
 * measured anywhere in this system today (see the migration header for what
 * each would need). So they are not on this screen as numbers. They are on it
 * as a list of things nobody is watching.
 *
 * That is the entire design decision here. A dashboard whose dots are green
 * because nothing is checking them answers "is it up" with a guess, and it
 * looks exactly like an answer — which is worse than not having the screen,
 * because you would stop asking. Naming the gap keeps the question alive.
 *
 * ── 27b, and the rule that shapes it ────────────────────────────────
 * "Ranked by blast radius, not recency." The RPC orders on distinct actors
 * first, volume second: 300 accounts trying once is a bigger deal than one
 * account trying 10,000 times, and a recency sort puts the wrong one on top.
 *
 * "Every automatic action is stated together with who it may have hurt."
 * collateral_count is NULL when nobody has measured it, and that renders as
 * "not measured", never as "0 affected". Zero is a promise that nobody was
 * caught in the net; NULL is an admission that we did not look. The design's
 * whole argument — mitigation paired with repair — collapses if those two
 * render identically.
 *
 * ── What this screen deliberately cannot do ─────────────────────────
 * 27b's action buttons (keep pause, block ASN, lift pause, report to Stripe)
 * are NOT here. There is no rate-limiter, no ASN blocklist and no pause
 * mechanism to drive them — a button whose only effect is to look decisive is
 * worse than its absence. The signals are real; the levers are not built yet.
 */

interface Health {
  window_hours: number;
  payments_succeeded: number;
  payments_failed: number;
  payment_success_rate: number | null;
  revenue_cents: number;
  auth_denials: number;
  denial_actors: number;
  denial_anonymous: number;
  new_coaches: number;
  new_athletes: number;
  coaches_active: number;
  critical_events: number;
}

interface Signal {
  signal_key: string;
  event_type: string;
  subject: string | null;
  severity: 'info' | 'warn' | 'critical';
  occurrences: number;
  distinct_actors: number;
  anonymous_hits: number;
  first_seen: string;
  last_seen: string;
  collateral_count: number | null;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; health: Health; signals: Signal[] };

/** Things 27a asks for that nothing in this system measures. */
const NOT_MEASURED: { label: string; needs: string }[] = [
  { label: 'API latency and error rate', needs: 'APM on the edge functions' },
  { label: 'Crash-free sessions', needs: 'App Store Connect + Play Console' },
  { label: 'Downloads', needs: 'App Store Connect + Play Console' },
  { label: 'Release adoption', needs: 'App Store Connect + Play Console' },
  { label: 'Push delivery rate', needs: 'reading Expo/APNs receipts back' },
  { label: 'Dependency health', needs: 'real probes, not a drawn green dot' },
];

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Event types are dotted namespaces meant for machines. This turns the ones we
 * actually emit into a sentence an on-call person can read at 3am. Anything
 * unmapped falls through to the raw type — better an unfamiliar string than a
 * confident mislabel.
 */
function describe(s: Signal): string {
  switch (s.event_type) {
    case 'auth.denied':
      return s.anonymous_hits > 0 && s.distinct_actors === 0
        ? 'Unauthenticated calls rejected'
        : 'Calls rejected — signed in, but not permitted';
    case 'account.binding_rejected':
      return 'Attempts to bind an account that belongs to someone else';
    case 'org.share_changed':
      return 'A gym changed its cut of coach revenue';
    case 'org.seats_applied':
      return 'Seat count changed';
    default:
      return s.event_type;
  }
}

const SEV_COLOR: Record<Signal['severity'], string> = {
  critical: CoachColors.danger,
  warn: CoachColors.warning,
  info: CoachColors.textMuted,
};

export default function OpsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [tab, setTab] = useState<'health' | 'signals'>('health');
  const [hours, setHours] = useState(24);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Both RPCs raise for a non-admin rather than returning nothing, so a
    // permission failure is distinguishable from a quiet day (§ migration).
    const [h, s] = await Promise.all([
      supabase.rpc('ops_health', { p_hours: hours }),
      supabase.rpc('ops_signals', { p_hours: hours }),
    ]);

    if (h.error || s.error) {
      const msg = (h.error?.message || s.error?.message || '').toLowerCase();
      if (msg.includes('not permitted')) { setPhase({ kind: 'denied' }); return; }
      setPhase({ kind: 'error', message: 'We could not load ops data.' });
      return;
    }

    const health = (Array.isArray(h.data) ? h.data[0] : h.data) as Health | undefined;
    if (!health) { setPhase({ kind: 'error', message: 'No health data returned.' }); return; }

    setPhase({ kind: 'ready', health, signals: (s.data ?? []) as Signal[] });
  }, [hours]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (phase.kind === 'loading') {
    return (
      <SafeAreaView style={st.screen}>
        <View style={st.center}><ActivityIndicator color={CoachColors.accent} /></View>
      </SafeAreaView>
    );
  }

  if (phase.kind === 'denied') {
    return (
      <SafeAreaView style={st.screen}>
        <Header router={router} />
        <View style={st.center}>
          <Ionicons name="lock-closed-outline" size={40} color={CoachColors.textFaint} />
          <Text style={st.emptyTitle} maxFontSizeMultiplier={1.3}>This is an internal screen</Text>
          <Text style={st.emptyBody}>
            Ops data is limited to FitLink staff. Nothing here is part of your account.
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
          <Text style={st.emptyTitle} maxFontSizeMultiplier={1.3}>{phase.message}</Text>
          <TouchableOpacity style={st.retry} onPress={load} accessibilityRole="button">
            <Text style={st.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { health, signals } = phase;
  const criticals = signals.filter((s) => s.severity === 'critical').length;

  return (
    <SafeAreaView style={st.screen} edges={['top']}>
      <Header router={router} />

      <View style={st.tabs}>
        {(['health', 'signals'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[st.tab, tab === t && st.tabOn]}
            onPress={() => setTab(t)}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[st.tabText, tab === t && st.tabTextOn]} maxFontSizeMultiplier={1.2}>
              {t === 'health' ? 'Health' : 'Attack signals'}
            </Text>
            {t === 'signals' && criticals > 0 && (
              <View style={st.badge}><Text style={st.badgeText} maxFontSizeMultiplier={1.2}>{criticals}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={st.windowRow}>
        {[24, 168, 720].map((h) => (
          <TouchableOpacity
            key={h}
            onPress={() => setHours(h)}
            style={[st.chip, hours === h && st.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: hours === h }}
          >
            <Text style={[st.chipText, hours === h && st.chipTextOn]} maxFontSizeMultiplier={1.2}>
              {h === 24 ? '24 hours' : h === 168 ? '7 days' : '30 days'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} />}
      >
        {tab === 'health' ? (
          <>
            <View style={st.grid}>
              {/* Metric renders cardLabel + big, both capped inside the component */}
              <Metric
                label="Payment success"
                /* NULL means nothing was attempted. 0% would read as "every
                   payment failed", which is the opposite of the truth. */
                value={health.payment_success_rate === null ? null : `${health.payment_success_rate}%`}
                sub={health.payment_success_rate === null
                  ? 'No payments attempted in this window'
                  : `${health.payments_succeeded} charged · ${health.payments_failed} declined`}
              />
              <Metric label="Revenue" value={money(health.revenue_cents)} sub="Succeeded charges, this window" />
              <Metric
                label="Coaches active"
                value={String(health.coaches_active)}
                sub="Published, messaged or assigned something"
              />
              <Metric
                label="New accounts"
                value={String(health.new_coaches + health.new_athletes)}
                sub={`${health.new_coaches} coaches · ${health.new_athletes} athletes`}
              />
            </View>

            <View style={[st.card, health.critical_events > 0 && st.cardAlert]}>
              <Text style={st.cardLabel} maxFontSizeMultiplier={1.2}>Rejected calls</Text>
              <Text style={st.big} maxFontSizeMultiplier={1.2}>{health.auth_denials}</Text>
              <Text style={st.sub}>
                {health.denial_actors} signed-in caller{health.denial_actors === 1 ? '' : 's'} ·{' '}
                {health.denial_anonymous} with no identity
              </Text>
              {health.critical_events > 0 && (
                <Text style={st.alertText}>
                  {health.critical_events} critical. See attack signals.
                </Text>
              )}
            </View>

            {/* The honest half of 27a. */}
            <View style={st.card}>
              <Text style={st.cardLabel} maxFontSizeMultiplier={1.2}>Not measured yet</Text>
              <Text style={st.sub}>
                Design 27a asks for these. Nothing in the system records them, so they are
                named here rather than shown as numbers we did not compute.
              </Text>
              <View style={st.gapList}>
                {NOT_MEASURED.map((g) => (
                  <View key={g.label} style={st.gapRow}>
                    <Ionicons name="ellipse-outline" size={9} color={CoachColors.textFaint} />
                    <Text style={st.gapLabel}>{g.label}</Text>
                    <Text style={st.gapNeeds}>{g.needs}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            {signals.length === 0 ? (
              <View style={st.card}>
                <Text style={st.cardLabel} maxFontSizeMultiplier={1.2}>No signals</Text>
                <Text style={st.sub}>
                  Nothing above informal severity was recorded in this window. That is a real
                  reading from the audit log, not an empty placeholder.
                </Text>
              </View>
            ) : (
              <>
                <Text style={st.rankNote}>Ranked by blast radius — distinct callers first, volume second.</Text>
                {signals.map((s) => (
                  <View key={s.signal_key} style={st.card}>
                    <View style={st.sigHead}>
                      <View style={[st.sev, { backgroundColor: SEV_COLOR[s.severity] }]} />
                      <Text style={st.sigTitle}>{describe(s)}</Text>
                      <Text style={st.sigAgo}>{ago(s.last_seen)}</Text>
                    </View>

                    {s.subject && <Text style={st.sigSubject} maxFontSizeMultiplier={1.2}>{s.subject}</Text>}

                    <Text style={st.sub}>
                      {s.occurrences} attempt{s.occurrences === 1 ? '' : 's'}
                      {s.distinct_actors > 0 && ` · ${s.distinct_actors} signed-in caller${s.distinct_actors === 1 ? '' : 's'}`}
                      {s.anonymous_hits > 0 && ` · ${s.anonymous_hits} with no identity`}
                    </Text>
                    <Text style={st.sigWindow}>
                      First seen {ago(s.first_seen)} ago
                    </Text>

                    {/* NULL is "we did not look", not "nobody was hurt". The two
                        must never render the same way. */}
                    <Text style={s.collateral_count === null ? st.unmeasured : st.collateral}>
                      {s.collateral_count === null
                        ? 'Collateral not measured — we do not know who else this caught'
                        : `${s.collateral_count} legitimate ${s.collateral_count === 1 ? 'account' : 'accounts'} affected`}
                    </Text>
                  </View>
                ))}
                <Text style={st.foot}>
                  There are no action buttons here. FitLink has no rate limiter, ASN blocklist or
                  pause switch to drive them yet — a control that only looks decisive is worse
                  than its absence. The signals are real; the levers are not built.
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, sub }: { label: string; value: string | null; sub: string }) {
  return (
    <View style={st.tile}>
      <Text style={st.cardLabel} maxFontSizeMultiplier={1.2}>{label}</Text>
      {/* An omitted value renders as a dash with its reason underneath —
          never as 0, which would be a claim. */}
      <Text style={[st.big, value === null && st.bigAbsent]} maxFontSizeMultiplier={1.2}>{value ?? '—'}</Text>
      <Text style={st.sub}>{sub}</Text>
    </View>
  );
}

function Header({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={st.header}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={24} color={CoachColors.textPrimary} />
      </TouchableOpacity>
      <View style={st.headerMid}>
        <Text style={st.headerTitle} maxFontSizeMultiplier={1.3}>FitLink Ops</Text>
        <View style={st.internal}><Text style={st.internalText} maxFontSizeMultiplier={1.2}>Internal</Text></View>
      </View>
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
  headerMid: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 16, color: CoachColors.textPrimary },
  internal: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 8, paddingVertical: 2,
  },
  internalText: {
    fontFamily: CoachFonts.bodyMedium, fontSize: 10, color: CoachColors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  tabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 20, marginBottom: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: CoachColors.accent },
  tabText: { fontFamily: CoachFonts.bodyMedium, fontSize: 15, color: CoachColors.textMuted },
  tabTextOn: { color: CoachColors.textPrimary },
  badge: {
    backgroundColor: CoachColors.danger, borderRadius: 999, borderCurve: 'continuous',
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: '#fff' },

  windowRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  chip: {
    borderRadius: 999, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.borderMuted,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  chipOn: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  chipText: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },
  chipTextOn: { color: CoachColors.accent },

  body: { paddingHorizontal: 20, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexGrow: 1, flexBasis: '46%', backgroundColor: CoachColors.surface,
    borderRadius: 20, borderCurve: 'continuous', padding: 16, borderWidth: 1, borderColor: CoachColors.borderMuted, gap: 4,
  },
  card: {
    backgroundColor: CoachColors.surface, borderRadius: 20, borderCurve: 'continuous', padding: 18,
    borderWidth: 1, borderColor: CoachColors.borderMuted, gap: 5,
  },
  cardAlert: { borderColor: CoachColors.danger },
  cardLabel: {
    fontFamily: CoachFonts.bodyMedium, fontSize: 11, color: CoachColors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  big: { fontFamily: CoachFonts.headingBold, fontSize: 28, color: CoachColors.textPrimary },
  bigAbsent: { color: CoachColors.textFaint },
  sub: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textSecondary, lineHeight: 18 },
  alertText: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.danger, marginTop: 2 },

  gapList: { gap: 8, marginTop: 8 },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  gapLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textPrimary },
  gapNeeds: { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textFaint },

  rankNote: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginBottom: 2 },
  sigHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sev: { width: 8, height: 8, borderRadius: 4, borderCurve: 'continuous' },
  sigTitle: { flex: 1, fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary },
  sigAgo: { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textFaint },
  sigSubject: { fontFamily: CoachFonts.mono, fontSize: 11, color: CoachColors.textMuted },
  sigWindow: { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textFaint },
  collateral: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.warning, marginTop: 4 },
  unmeasured: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textFaint, marginTop: 4, fontStyle: 'italic' },

  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary, textAlign: 'center' },
  emptyBody: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retry: {
    marginTop: 8, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 12, paddingHorizontal: 24,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  retryText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14, color: CoachColors.textPrimary },
  foot: { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textFaint, lineHeight: 17, marginTop: 6 },
});
