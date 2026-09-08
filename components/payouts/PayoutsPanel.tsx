/**
 * components/payouts/PayoutsPanel.tsx — the one payouts surface (design
 * canvas "FitLink Payouts", boards 01–03). app/payouts.tsx wraps it in a
 * screen; the sign-up wizard embeds it under its own step title.
 *
 *   not_connected — worked example on a $180 pass using the coach's REAL
 *                   split (no figure while it loads), three reassurances.
 *   in_progress   — amber ring, "What Stripe is waiting for" with the three
 *                   lines Stripe reported as due, and the "athletes can see
 *                   your passes but not pay" note.
 *   connected     — lime ring, a four-row fact card (bank, charges, share,
 *                   timing). Bank numbers never appear in FitLink.
 *
 * PayoutsActions renders the matching buttons so every entry point has the
 * same pair: primary pill + quiet secondary.
 */
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { type PaymentSplit, bpsToPercentLabel, coachKeeps, totalDeduction } from '../../lib/platformFee';
import { type PayoutsDue, type PayoutsState, payoutsHeadline } from '../../lib/payoutsState';

export const EXAMPLE_PRICE = 180;

interface PanelProps {
  state: PayoutsState;
  due: PayoutsDue;
  pendingVerification?: boolean;
  split: PaymentSplit | null;
  /** 'embedded' drops the not-connected headline (the wizard's step title says it). */
  variant?: 'screen' | 'embedded';
  error?: string | null;
}

export function PayoutsPanel({ state, due, pendingVerification = false, split, variant = 'screen', error }: PanelProps) {
  const head = payoutsHeadline(state, pendingVerification);
  return (
    <View style={styles.panel}>
      {state === 'not_connected' ? (
        variant === 'screen' ? (
          <View>
            <Text style={styles.title} maxFontSizeMultiplier={1.3}>{head.title}</Text>
            <Text style={styles.subtitle}>{head.subtitle}</Text>
          </View>
        ) : null
      ) : (
        <View style={styles.statusRow} accessibilityRole="header" accessibilityLabel={`${head.title} ${head.subtitle}`}>
          <View style={[styles.ring, state === 'connected' ? styles.ringOn : styles.ringWaiting]}>
            {state === 'connected'
              ? <Ionicons name="checkmark" size={24} color={C.accent} />
              : <View style={styles.ringDot} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle} maxFontSizeMultiplier={1.3}>{head.title}</Text>
            <Text style={styles.statusSub}>{head.subtitle}</Text>
          </View>
        </View>
      )}

      {state === 'not_connected' && <SplitCard split={split} />}

      {state === 'not_connected' && (
        <View style={styles.infoList}>
          <InfoRow icon="lock-closed-outline" text="Stripe holds your bank and ID details. FitLink never sees them." />
          <InfoRow icon="time-outline" text="Stop any time. Come back and it picks up where you left off." />
          <InfoRow icon="checkmark" text="Your passes are visible now. Athletes can pay once this is done." />
        </View>
      )}

      {state === 'in_progress' && (
        <>
          <View style={styles.card}>
            <Text style={styles.eyebrow} maxFontSizeMultiplier={1.2}>WHAT STRIPE IS WAITING FOR</Text>
            <DueRow label="Your details" waiting={due.details} />
            <DueRow label="Bank account for payouts" waiting={due.bank} />
            <DueRow label="Identity check" waiting={due.identity} />
            <Text style={styles.cardFoot}>
              {pendingVerification
                ? 'Nothing more to do on your side. Stripe emails you if it needs anything else.'
                : 'Read from Stripe when you come back. Anything you already entered is saved there.'}
            </Text>
          </View>
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={C.textSecondary} />
            <Text style={styles.noteText}>Athletes can see your passes and message you. They cannot be charged until Stripe is done.</Text>
          </View>
        </>
      )}

      {state === 'connected' && (
        <>
          <View style={styles.factCard}>
            <FactRow label="Bank" value="On file with Stripe" />
            <FactRow label="Charges" value="Enabled" accent />
            <FactRow label="Your share of each pass" value={split ? bpsToPercentLabel(split.coachKeepsBps) : '—'} />
            <FactRow label="Payout timing" value="2 business days" last />
          </View>
          <Text style={styles.foot}>Bank details, tax forms and payout history live in your Stripe dashboard. FitLink shows earnings, never account numbers.</Text>
        </>
      )}

      {error ? (
        <View style={styles.errorBox} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

interface ActionsProps {
  state: PayoutsState;
  busy: boolean;
  onStart: () => void;
  onDone: () => void;
  onSkip?: () => void;
  onDashboard?: () => void;
  /** Wizard: the primary in the connected state finishes the wizard. */
  doneLabel?: string;
}

export function PayoutsActions({ state, busy, onStart, onDone, onSkip, onDashboard, doneLabel = 'Done' }: ActionsProps) {
  if (state === 'connected') {
    return (
      <View style={styles.actions}>
        <TouchableOpacity style={styles.primary} onPress={onDone} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={doneLabel}>
          <Text style={styles.primaryText}>{doneLabel}</Text>
        </TouchableOpacity>
        {onDashboard ? (
          <TouchableOpacity
            style={[styles.outline, busy && { opacity: 0.6 }]}
            onPress={onDashboard}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open your Stripe dashboard"
            accessibilityState={{ disabled: busy, busy }}
          >
            {busy ? <ActivityIndicator size="small" color={C.textPrimary} /> : (
              <>
                <Ionicons name="open-outline" size={16} color={C.textPrimary} />
                <Text style={styles.outlineText}>Open your Stripe dashboard</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
  const primaryLabel = state === 'in_progress' ? 'Continue with Stripe' : 'Set up payouts with Stripe';
  const skipLabel = state === 'in_progress' ? 'Do this later' : 'Not now';
  return (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[styles.primary, busy && { opacity: 0.6 }]}
        onPress={onStart}
        disabled={busy}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        accessibilityState={{ disabled: busy, busy }}
      >
        {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
      </TouchableOpacity>
      {onSkip ? (
        <TouchableOpacity style={styles.quiet} onPress={onSkip} disabled={busy} accessibilityRole="button" accessibilityLabel={skipLabel}>
          <Text style={styles.quietText}>{skipLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function SplitCard({ split }: { split: PaymentSplit | null }) {
  const keeps = split ? coachKeeps(EXAMPLE_PRICE, split) : null;
  const fee = split ? totalDeduction(EXAMPLE_PRICE, split) : null;
  const keepPct = split ? split.coachKeepsBps / 100 : null;
  return (
    <View style={styles.card} accessible accessibilityLabel={split && keeps != null
      ? `On a ${EXAMPLE_PRICE} dollar pass, ${Math.round(keeps)} dollars reaches you. Your ${bpsToPercentLabel(split.coachKeepsBps)}. Payouts land two business days after an athlete is charged.`
      : `On a ${EXAMPLE_PRICE} dollar pass. Loading your rate.`}>
      <Text style={styles.eyebrow} maxFontSizeMultiplier={1.2}>ON A ${EXAMPLE_PRICE} PASS</Text>
      {split && keeps != null && fee != null && keepPct != null ? (
        <>
          <View style={styles.amountRow}>
            <Text style={styles.amount}>${Math.round(keeps)}</Text>
            <Text style={styles.amountLabel}>reaches you</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${keepPct}%` }]} /></View>
          <View style={styles.splitLabels}>
            <Text style={styles.splitYou}>Your {bpsToPercentLabel(split.coachKeepsBps)}</Text>
            <Text style={styles.splitFee}>
              {split.orgShareBps > 0 ? 'Fees' : 'FitLink'} {bpsToPercentLabel(split.platformFeeBps + split.orgShareBps)} · Stripe fees inside it
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.amountRow}>
            <View style={styles.skeleton} />
            <Text style={styles.amountLabel}>reaches you</Text>
          </View>
          <View style={styles.track} />
          <View style={styles.splitLabels}>
            <Text style={styles.splitYou}>Your share</Text>
            <Text style={styles.splitFee}>Loading your rate…</Text>
          </View>
        </>
      )}
      <Text style={styles.cardFoot}>Payouts land two business days after an athlete is charged.</Text>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}><Ionicons name={icon} size={16} color={C.accent} /></View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function DueRow({ label, waiting }: { label: string; waiting: boolean }) {
  return (
    <View style={styles.dueRow} accessible accessibilityLabel={`${label}: ${waiting ? 'still needed' : 'done'}`}>
      {waiting ? (
        <View style={styles.dueWaiting}><View style={styles.dueWaitingDot} /></View>
      ) : (
        <View style={styles.dueDone}><Ionicons name="checkmark" size={13} color={C.onAccent} /></View>
      )}
      <Text style={styles.dueLabel}>{label}</Text>
    </View>
  );
}

function FactRow({ label, value, accent, last }: { label: string; value: string; accent?: boolean; last?: boolean }) {
  return (
    <View style={[styles.factRow, !last && styles.factRowLine]}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, accent && { color: C.accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 16 },
  title: { fontFamily: F.headingBold, fontSize: 26, lineHeight: 30, color: C.textPrimary, letterSpacing: -0.4 },
  subtitle: { marginTop: 8, fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textSecondary },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ring: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  ringOn: { backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accent },
  ringWaiting: { borderWidth: 1.5, borderColor: C.warning },
  ringDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.warning },
  statusTitle: { fontFamily: F.headingBold, fontSize: 24, lineHeight: 28, color: C.textPrimary },
  statusSub: { marginTop: 4, fontFamily: F.body, fontSize: 14, lineHeight: 19, color: C.textSecondary },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 20, borderCurve: 'continuous', padding: 16, gap: 12 },
  eyebrow: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 2, color: C.textFaint },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amount: { fontFamily: F.headingBold, fontSize: 40, lineHeight: 44, color: C.textPrimary, letterSpacing: -0.9 },
  amountLabel: { fontFamily: F.body, fontSize: 14, color: C.textSecondary },
  skeleton: { width: 96, height: 40, borderRadius: 12, borderCurve: 'continuous', backgroundColor: C.borderMuted },
  track: { height: 6, borderRadius: 999, backgroundColor: C.borderMuted, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 999, backgroundColor: C.accent },
  splitLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  splitYou: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.accent },
  splitFee: { fontFamily: F.body, fontSize: 12.5, color: C.textFaint, flexShrink: 1, textAlign: 'right' },
  cardFoot: { fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: C.textFaint },

  infoList: { gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, borderCurve: 'continuous', backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1, fontFamily: F.body, fontSize: 14, lineHeight: 19, color: C.textPrimary },

  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dueDone: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  dueWaiting: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: C.warning, alignItems: 'center', justifyContent: 'center' },
  dueWaitingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.warning },
  dueLabel: { fontFamily: F.body, fontSize: 14.5, color: C.textPrimary },

  note: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 18, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 16 },
  noteText: { flex: 1, fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: C.textSecondary },

  factCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 20, borderCurve: 'continuous' },
  factRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  factRowLine: { borderBottomWidth: 1, borderBottomColor: C.borderMuted },
  factLabel: { fontFamily: F.body, fontSize: 14, color: C.textSecondary },
  factValue: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary },
  foot: { fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: C.textFaint },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.dangerSoft, borderRadius: 12, borderCurve: 'continuous', paddingVertical: 10, paddingHorizontal: 12 },
  errorText: { flex: 1, fontFamily: F.body, fontSize: 13.5, lineHeight: 18, color: C.danger },

  actions: { gap: 10 },
  primary: { height: 56, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.bodyBold, fontSize: 17, color: C.onAccent },
  outline: { height: 48, borderRadius: 999, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  outlineText: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  quiet: { height: 48, alignItems: 'center', justifyContent: 'center' },
  quietText: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textSecondary },
});
