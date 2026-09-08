/**
 * invite/[code].tsx — what a person sees when they open an invite link
 * (design canvas "FitLink Invitations": board 04 the coach invite, board 05
 * the move-coach confirmation, and the live variant).
 *
 * Reached by fitlink://invite/<CODE>, by the code-entry screen, and by
 * AuthGuard resuming a parked code after sign-in. The screen asks invite-info
 * which kind the code is, then branches on who is looking:
 *
 *   signed out          park the code, show the coach, "Accept and set up my
 *                       account" → the athlete account step; the guard brings
 *                       them back here once a session exists.
 *   athlete, coach kind Accept → accept_invite. 'needs_switch_confirmation'
 *                       renders board 05; success refreshes ClientContext and
 *                       lands on Home.
 *   athlete, live kind  Watch → accept_invite, then the live player.
 *   coach               invites are for athletes.
 *
 * Nothing here claims success before the RPC resolves (INVARIANTS §4), and the
 * one haptic is the success notification on accept.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as SecureStore from '../../lib/secureStore';
import { clientOnboardedKey } from '../../lib/onboardingFlags';
import { useAuth } from '../../context/AuthContext';
import { useClientIdentity } from '../../context/ClientContext';
import Avatar from '../../components/Avatar';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import {
  type InviteInfo, type AcceptInviteFailure,
  acceptInvite, clearPendingInviteCode, fetchInviteInfo, firstName, hapticMoment,
  isValidCode, normalizeCode, setPendingInviteCode,
} from '../../lib/invites';

type Phase = 'loading' | 'ready' | 'not_found' | 'network' | 'error';

interface Outcome {
  reason: AcceptInviteFailure | 'accepted_scheduled';
  message?: string;
}

export default function InviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = normalizeCode(params.code);
  const { user, userRole, isAuthenticated, loading: authLoading } = useAuth();
  const { refreshData, trainer: currentTrainer } = useClientIdentity();

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [switchTo, setSwitchTo] = useState<{ currentCoachName: string } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const load = useCallback(async () => {
    if (!isValidCode(code)) { setPhase('not_found'); return; }
    setPhase('loading');
    const res = await fetchInviteInfo(code);
    if (!res.ok) {
      setPhase(res.reason === 'not_found' ? 'not_found' : res.reason === 'network' ? 'network' : 'error');
      return;
    }
    setInfo(res.info);
    setPhase('ready');
  }, [code]);

  useEffect(() => { load(); }, [load]);

  // The parking spot: a signed-out person keeps the code for after sign-up;
  // a signed-in one is already here, so the spot is emptied (otherwise the
  // guard would keep steering them back to this screen).
  useEffect(() => {
    if (authLoading || phase !== 'ready' || !info || info.expired) return;
    if (isAuthenticated) clearPendingInviteCode();
    else setPendingInviteCode(code);
  }, [authLoading, isAuthenticated, phase, info, code]);

  const coachFirst = firstName(info?.coach.name) || 'Your coach';
  const isTrainer = isAuthenticated && userRole === 'trainer';
  const isAthlete = isAuthenticated && userRole === 'client';

  const goHome = () => {
    if (isAthlete) router.replace('/(client-tabs)' as any);
    else if (isTrainer) router.replace('/(tabs)' as any);
    else router.replace('/(auth)/welcome' as any);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else goHome();
  };

  /**
   * The invite replaces the intake: an athlete who arrived through a coach's
   * link has no onboarding draft and no device flag, and the next cold start
   * would otherwise open the legacy client-onboarding form. Best-effort; the
   * roster attachment already happened server-side.
   */
  const markOnboarded = async () => {
    if (!user) return;
    await SecureStore.setItemAsync(clientOnboardedKey(user.id), 'true').catch(() => {});
    const meta = (user.user_metadata ?? {}) as Record<string, any>;
    const data: Record<string, any> = { client_onboarded: true };
    if (!meta.onboarding_path) data.onboarding_path = 'coach';
    const { error } = await supabase.auth.updateUser({ data });
    if (error && __DEV__) console.warn('[Invite] client_onboarded not written:', error.message);
  };

  const runAccept = async (confirmSwitch: boolean) => {
    if (accepting || !info) return;
    setAccepting(true);
    setOutcome(null);
    const res = await acceptInvite(code, confirmSwitch);
    if (!res.ok) {
      if (res.reason === 'needs_switch') {
        setSwitchTo({ currentCoachName: res.currentCoachName || currentTrainer?.name || 'your current coach' });
      } else {
        hapticMoment('fail');
        setOutcome({ reason: res.reason, message: res.message });
      }
      setAccepting(false);
      return;
    }
    hapticMoment('done');
    await clearPendingInviteCode();
    if (res.kind === 'live') {
      const classId = res.liveClassId || info.live?.class_id;
      if (info.live?.status === 'live' && classId) {
        router.replace(`/live-player/${classId}` as any);
        return;
      }
      setOutcome({ reason: 'accepted_scheduled' });
      setAccepting(false);
      return;
    }
    await markOnboarded();
    await refreshData().catch(() => {});
    router.replace('/(client-tabs)' as any);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const bottomPad = Math.max(insets.bottom, 16) + 8;

  const renderBody = () => {
    if (phase === 'loading' || authLoading) {
      return <View style={s.center}><ActivityIndicator color={C.textMuted} /></View>;
    }

    if (phase === 'network') {
      return (
        <Notice
          title="We couldn't reach FitLink."
          body="Check your connection and try again."
          primary={{ label: 'Try again', onPress: load }}
          secondary={{ label: isAuthenticated ? 'Go to home' : 'Look around first', onPress: goHome }}
        />
      );
    }

    if (phase === 'error') {
      return (
        <Notice
          title="Something went wrong."
          body="The invite could not be read right now. Try again in a moment."
          primary={{ label: 'Try again', onPress: load }}
          secondary={{ label: isAuthenticated ? 'Go to home' : 'Look around first', onPress: goHome }}
        />
      );
    }

    if (phase === 'not_found' || !info) {
      return (
        <Notice
          title="We couldn't find that invite."
          body="Check the code against the message you were sent, or ask your coach for a fresh link."
          primary={{ label: 'Enter a different code', onPress: () => router.replace('/invite/enter' as any) }}
          secondary={{ label: isAuthenticated ? 'Go to home' : 'Look around first', onPress: goHome }}
        />
      );
    }

    if (info.expired || outcome?.reason === 'expired') {
      // invite-info marks a live invite expired once the class ended or was
      // cancelled; say that, not "the link expired".
      const liveOver = info.kind === 'live' && info.live && (info.live.status === 'ended' || info.live.status === 'cancelled');
      return (
        <Notice
          title={liveOver ? (info.live?.status === 'cancelled' ? 'This class was cancelled.' : 'This class has ended.') : 'This invite has expired.'}
          body={liveOver
            ? `Ask ${coachFirst} when the next one is.`
            : `Ask ${coachFirst} for a new link. Every invite carries a date, and this one has passed.`}
          primary={{ label: 'Enter a different code', onPress: () => router.replace('/invite/enter' as any) }}
          secondary={{ label: isAuthenticated ? 'Go to home' : 'Look around first', onPress: goHome }}
        />
      );
    }

    if (isTrainer) {
      return (
        <Notice
          title="Invites are for athletes."
          body="You are signed in as a coach. An athlete opens this link on their own phone to join a roster or watch a class."
          primary={{ label: 'Back to your dashboard', onPress: goHome }}
        />
      );
    }

    if (outcome?.reason === 'already_accepted') {
      return (
        <Notice
          title="You already accepted this invite."
          body={info.kind === 'live' ? 'You are on the list for this class.' : `You are on ${coachFirst}'s roster.`}
          primary={{ label: 'Go to home', onPress: goHome }}
        />
      );
    }
    if (outcome?.reason === 'not_found') {
      return (
        <Notice
          title="We couldn't find that invite."
          body="It may have been withdrawn. Ask your coach for a fresh link."
          primary={{ label: 'Go to home', onPress: goHome }}
        />
      );
    }
    if (outcome?.reason === 'trainer_cannot_accept') {
      return (
        <Notice
          title="Invites are for athletes."
          body="This account is a coach account, so it cannot join a roster."
          primary={{ label: 'Go to home', onPress: goHome }}
        />
      );
    }
    if (outcome?.reason === 'accepted_scheduled') {
      return (
        <Notice
          title="You're on the list."
          body={`Come back when ${coachFirst} goes live and this link will take you straight in.`}
          primary={{ label: 'Go to home', onPress: goHome }}
        />
      );
    }

    // Board 05 — moving coach.
    if (switchTo) {
      const current = switchTo.currentCoachName;
      const currentFirst = firstName(current) || 'your coach';
      return (
        <View style={s.body}>
          <Text style={s.eyebrow} maxFontSizeMultiplier={1.2}>MOVING COACH</Text>
          <Text style={s.headline} maxFontSizeMultiplier={1.25} accessibilityRole="header">
            You already train with {currentFirst}.
          </Text>
          <View style={s.switchRow}>
            <CoachCard
              label="Now"
              name={current}
              avatarUrl={currentTrainer?.name === current ? currentTrainer?.avatar_url ?? null : null}
              specialization={currentTrainer?.name === current ? currentTrainer?.specialization ?? null : null}
              compact
            />
            <Ionicons name="arrow-forward" size={20} color={C.textFaint} style={{ marginTop: 28 }} />
            <CoachCard
              label="New"
              name={info.coach.name}
              avatarUrl={info.coach.avatar_url}
              specialization={info.coach.specialization}
              compact
              accent
            />
          </View>
          <Text style={s.listLabel} maxFontSizeMultiplier={1.2}>IF YOU MOVE</Text>
          <View style={s.listCard}>
            <ListLine text={`${coachFirst} becomes your coach and sees what you log from today.`} />
            <ListLine text={`${currentFirst} stops seeing your new sessions and check-ins.`} />
            <ListLine text="Everything you have logged so far stays in your account." />
          </View>
          {outcome?.reason === 'error' ? <Text style={s.error} maxFontSizeMultiplier={1.3}>{outcome.message || 'That did not go through. Try again.'}</Text> : null}
          <View style={s.actions}>
            <PrimaryButton label={`Move to ${coachFirst}`} onPress={() => runAccept(true)} busy={accepting} />
            <SecondaryButton label={`Stay with ${currentFirst}`} onPress={goHome} disabled={accepting} />
          </View>
        </View>
      );
    }

    // Live variant.
    if (info.kind === 'live' && info.live) {
      const status = info.live.status;
      const isLive = status === 'live';
      const statusLine =
        isLive ? 'Live now'
        : status === 'ended' ? 'This class has ended.'
        : status === 'cancelled' ? 'This class was cancelled.'
        : `Not live yet. Come back when ${coachFirst} goes live and this link will take you in.`;
      return (
        <View style={s.body}>
          <Text style={s.eyebrow} maxFontSizeMultiplier={1.2}>LIVE CLASS</Text>
          <Text style={s.headline} maxFontSizeMultiplier={1.25} accessibilityRole="header">
            {coachFirst} invited you to watch.
          </Text>
          <View style={s.classCard}>
            <Text style={s.classTitle} maxFontSizeMultiplier={1.3}>{info.live.title}</Text>
            <View style={s.classCoach}>
              <Avatar name={info.coach.name} imageUrl={info.coach.avatar_url} size="sm" />
              <Text style={s.classCoachName} maxFontSizeMultiplier={1.3}>{info.coach.name}</Text>
            </View>
            <View style={s.statusRow}>
              {isLive ? <View style={s.liveDot} /> : null}
              <Text style={[s.statusText, isLive && { color: C.accent }]} maxFontSizeMultiplier={1.3}>{statusLine}</Text>
            </View>
          </View>
          {outcome?.reason === 'error' ? <Text style={s.error} maxFontSizeMultiplier={1.3}>{outcome.message || 'That did not go through. Try again.'}</Text> : null}
          <View style={s.actions}>
            {!isAuthenticated ? (
              <>
                <PrimaryButton label="Set up my account to watch" onPress={() => router.push(`/(auth)/account?role=client&invite=${code}` as any)} />
                <SecondaryButton label="Look around first" onPress={goHome} />
              </>
            ) : isLive ? (
              <>
                <PrimaryButton label="Watch" onPress={() => runAccept(false)} busy={accepting} />
                <SecondaryButton label="Not now" onPress={goHome} disabled={accepting} />
              </>
            ) : status === 'scheduled' ? (
              <>
                <PrimaryButton label="Accept" onPress={() => runAccept(false)} busy={accepting} />
                <SecondaryButton label="Not now" onPress={goHome} disabled={accepting} />
              </>
            ) : (
              <PrimaryButton label="Go to home" onPress={goHome} />
            )}
          </View>
        </View>
      );
    }

    // Board 04 — the coach invite.
    return (
      <View style={s.body}>
        <Text style={s.eyebrow} maxFontSizeMultiplier={1.2}>INVITATION</Text>
        <Text style={s.headline} maxFontSizeMultiplier={1.25} accessibilityRole="header">
          {coachFirst} invited you to train together.
        </Text>
        <CoachCard
          name={info.coach.name}
          avatarUrl={info.coach.avatar_url}
          specialization={info.coach.specialization || (info.coach.specializations?.length ? info.coach.specializations.join(' · ') : null)}
          bio={info.coach.bio}
        />
        <Text style={s.explain} maxFontSizeMultiplier={1.4}>
          {isAuthenticated
            ? `Accepting puts you on ${coachFirst}'s roster. Your sessions, check-ins and messages with ${coachFirst} live here.`
            : `Accepting makes you an account and puts you on ${coachFirst}'s roster. Your sessions, check-ins and messages with ${coachFirst} live here.`}
        </Text>
        {outcome?.reason === 'error' ? <Text style={s.error} maxFontSizeMultiplier={1.3}>{outcome.message || 'That did not go through. Try again.'}</Text> : null}
        <View style={s.actions}>
          {!isAuthenticated ? (
            <>
              <PrimaryButton label="Accept and set up my account" onPress={() => router.push(`/(auth)/account?role=client&invite=${code}` as any)} />
              <SecondaryButton label="Look around first" onPress={goHome} />
            </>
          ) : (
            <>
              <PrimaryButton label="Accept" onPress={() => runAccept(false)} busy={accepting} />
              <SecondaryButton label="Not now" onPress={goHome} disabled={accepting} />
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <View style={[s.top, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={goBack} style={s.iconBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={s.wordmark} maxFontSizeMultiplier={1.2} accessibilityLabel="FitLink">FITLINK</Text>
        <View style={s.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {renderBody()}
      </ScrollView>
    </View>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function CoachCard({ name, avatarUrl, specialization, bio, label, compact, accent }: {
  name: string;
  avatarUrl: string | null;
  specialization?: string | null;
  bio?: string | null;
  label?: string;
  compact?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={[s.coachCard, compact && s.coachCardCompact, accent && s.coachCardAccent]} accessibilityLabel={`${label ? `${label}: ` : ''}${name}${specialization ? `, ${specialization}` : ''}`}>
      {label ? <Text style={s.cardLabel} maxFontSizeMultiplier={1.2}>{label.toUpperCase()}</Text> : null}
      <Avatar name={name} imageUrl={avatarUrl} size={compact ? 'lg' : 'xl'} />
      <Text style={[s.coachName, compact && { fontSize: 16, lineHeight: 20 }]} numberOfLines={2} maxFontSizeMultiplier={1.25}>{name}</Text>
      {specialization ? <Text style={s.coachSpec} numberOfLines={compact ? 1 : 2} maxFontSizeMultiplier={1.3}>{specialization}</Text> : null}
      {!compact && bio ? <Text style={s.coachBio} numberOfLines={4} maxFontSizeMultiplier={1.4}>{bio}</Text> : null}
    </View>
  );
}

function ListLine({ text }: { text: string }) {
  return (
    <View style={s.listLine}>
      <View style={s.listDot} />
      <Text style={s.listText} maxFontSizeMultiplier={1.4}>{text}</Text>
    </View>
  );
}

function Notice({ title, body, primary, secondary }: {
  title: string;
  body: string;
  primary: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View style={s.body}>
      <Text style={s.headline} maxFontSizeMultiplier={1.25} accessibilityRole="header">{title}</Text>
      <Text style={s.explain} maxFontSizeMultiplier={1.4}>{body}</Text>
      <View style={s.actions}>
        <PrimaryButton label={primary.label} onPress={primary.onPress} />
        {secondary ? <SecondaryButton label={secondary.label} onPress={secondary.onPress} /> : null}
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <TouchableOpacity
      style={[s.primaryBtn, busy && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
    >
      {busy ? <ActivityIndicator size="small" color={C.onAccent} /> : <Text style={s.primaryBtnText} maxFontSizeMultiplier={1.2}>{label}</Text>}
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={s.secondaryBtn} onPress={onPress} disabled={disabled} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={s.secondaryBtnText} maxFontSizeMultiplier={1.2}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: F.headingBold, fontSize: 14, letterSpacing: 3, color: C.textPrimary },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 240 },
  body: { flex: 1, gap: 16 },

  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2, color: C.accent },
  headline: { fontFamily: F.headingBold, fontSize: 30, lineHeight: 34, color: C.textPrimary, letterSpacing: -0.4 },
  explain: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.textSecondary },
  error: { fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: C.danger },

  coachCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 24, borderCurve: 'continuous', padding: 20, gap: 10, alignItems: 'flex-start',
  },
  coachCardCompact: { flex: 1, padding: 16, borderRadius: 16, gap: 8 },
  coachCardAccent: { borderColor: C.accent },
  cardLabel: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.5, color: C.textFaint },
  coachName: { fontFamily: F.headingBold, fontSize: 22, lineHeight: 26, color: C.textPrimary, marginTop: 4 },
  coachSpec: { fontFamily: F.bodyMedium, fontSize: 14, color: C.textSecondary },
  coachBio: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.textMuted, marginTop: 2 },

  switchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  listLabel: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.5, color: C.textFaint, marginTop: 4 },
  listCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 16, gap: 12,
  },
  listLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  listDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginTop: 8 },
  listText: { flex: 1, fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textPrimary },

  classCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 24, borderCurve: 'continuous', padding: 20, gap: 12,
  },
  classTitle: { fontFamily: F.headingBold, fontSize: 22, lineHeight: 26, color: C.textPrimary },
  classCoach: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  classCoachName: { fontFamily: F.bodyMedium, fontSize: 14.5, color: C.textSecondary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.borderMuted, paddingTop: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  statusText: { flex: 1, fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.textMuted },

  actions: { marginTop: 'auto', paddingTop: 16, gap: 4 },
  primaryBtn: {
    height: 52, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: F.bodyBold, fontSize: 15.5, color: C.onAccent },
  secondaryBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textSecondary },
});
