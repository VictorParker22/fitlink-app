/**
 * CoachContextHeroCard
 *
 * Context-aware hero that replaces the static "Business Overview" block
 * and the separate "Action Center". Tells the coach exactly what to do next.
 *
 * Priority order (highest wins):
 *   1. Live class going live soon (within 30 min)
 *   2. Session happening today
 *   3. Trial client expiring soon
 *   4. All clear → motivational build CTA
 *
 * Revenue is a secondary anchor (top-right, 22px) — visible but not dominant.
 * The context headline (28px, left) is the primary visual target.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { Spacing, Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useHaptic } from '../../hooks/useHaptic';

type HeroState = 'live_soon' | 'session_today' | 'trial_ending' | 'all_clear';

interface HeroContent {
  state: HeroState;
  eyebrow: string;           // small label above headline
  headline: string;
  sub: string;
  ctaLabel: string;
  ctaRoute: string;
  ctaColor: string;
  ctaIcon: string;
}

function getRelativeTime(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins <= 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  return `in ${hrs}h`;
}

function getDaysLeft(isoDate: string): number {
  return Math.max(0, Math.round((new Date(isoDate).getTime() - Date.now()) / 86400000));
}

export default function CoachContextHeroCard() {
  const router = useRouter();
  const haptic = useHaptic();
  const { trainer, clients, plans, sessions, liveClasses } = useApp();

  const firstName = (trainer?.name || 'Coach').split(' ')[0];
  const initials = (trainer?.name || 'CO').substring(0, 2).toUpperCase();

  // ── Revenue (secondary stat) ───────────────────────────────────────────────
  const activeClients = clients.filter(c => c.status !== 'inactive');
  const revenue = useMemo(() => {
    let total = 0;
    plans.forEach(plan => {
      const subs = activeClients.filter(c => c.plan_id === plan.id).length;
      total += Number(plan.price || 0) * subs;
    });
    return Math.floor(total);
  }, [clients, plans]);

  // ── State resolution ───────────────────────────────────────────────────────
  const hero: HeroContent = useMemo(() => {
    const now = Date.now();
    const THIRTY_MIN = 30 * 60 * 1000;

    // 1. Live class starting soon
    const soonLive = liveClasses?.find(lc => {
      if (lc.status !== 'scheduled') return false;
      const scheduledMs = new Date(lc.scheduled_for).getTime();
      const diff = scheduledMs - now;
      return diff > 0 && diff <= THIRTY_MIN;
    });
    if (soonLive) {
      return {
        state: 'live_soon',
        eyebrow: 'Going live soon',
        headline: soonLive.title,
        sub: `Starting ${getRelativeTime(soonLive.scheduled_for)} · Tap to enter the studio`,
        ctaLabel: 'Enter studio',
        ctaRoute: `/broadcast/${soonLive.id}`,
        ctaColor: CoachColors.danger,
        ctaIcon: 'radio',
      };
    }

    // 2. Session today
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const todaySessions = sessions
      .filter(s => {
        const d = new Date(s.date).getTime();
        return d >= todayStart.getTime() && d <= todayEnd.getTime() && s.status === 'upcoming';
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (todaySessions.length > 0) {
      const next = todaySessions[0];
      const clientName = clients.find(c => c.id === next.client_id)?.name
        || next.group_name
        || 'Session';
      const timeStr = new Date(next.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        state: 'session_today',
        eyebrow: 'Next session',
        headline: clientName,
        sub: `Today · ${timeStr}${todaySessions.length > 1 ? ` · +${todaySessions.length - 1} more` : ''}`,
        ctaLabel: 'View schedule',
        ctaRoute: '/(tabs)/schedule',
        ctaColor: CoachColors.accent,
        ctaIcon: 'calendar',
      };
    }

    // 3. Trial ending within 7 days
    const trialClient = clients.find(c => {
      if (c.status !== 'trial') return false;
      if (!c.trial_end_date) return true; // no date = assume expiring
      return getDaysLeft(c.trial_end_date) <= 7;
    });
    if (trialClient) {
      const daysLeft = trialClient.trial_end_date
        ? getDaysLeft(trialClient.trial_end_date)
        : 0;
      return {
        state: 'trial_ending',
        eyebrow: 'Action required',
        headline: trialClient.name,
        sub: daysLeft === 0
          ? 'Trial expires today · Follow up now'
          : `Trial expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} · Tap to review`,
        ctaLabel: 'Review client',
        ctaRoute: '/(tabs)/clients',
        ctaColor: CoachColors.warning,
        ctaIcon: 'time',
      };
    }

    // 4. All clear
    return {
      state: 'all_clear',
      eyebrow: 'Good ' + getGreeting(),
      headline: `Hello, ${firstName}`,
      sub: activeClients.length > 0
        ? `${activeClients.length} client${activeClients.length !== 1 ? 's' : ''} training with you today`
        : 'Start building your coaching business',
      ctaLabel: activeClients.length > 0 ? 'New workout' : 'Add client',
      ctaRoute: activeClients.length > 0 ? '/create-workout' : '/(tabs)/clients',
      ctaColor: CoachColors.accent,
      ctaIcon: activeClients.length > 0 ? 'barbell' : 'person-add',
    };
  }, [liveClasses, sessions, clients, firstName, activeClients.length]);

  // Dark ink reads best on accent/warning fills; light text on danger.
  const ctaContentColor = hero.ctaColor === CoachColors.danger
    ? CoachColors.textPrimary
    : CoachColors.onAccent;

  return (
    <View style={s.root}>
      {/* Background image */}
      <Image
        source={require('../../assets/images/milestone-bg.png')}
        style={s.bgImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.75)', CoachColors.bg]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView edges={['top']} style={s.safeArea}>
        {/* ── Top Bar ───────────────────────────────────────────────────────── */}
        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/profile')}
              style={s.avatarBtn}
            >
              {trainer?.avatar_url ? (
                <Image source={{ uri: trainer.avatar_url }} style={s.avatarImg} />
              ) : (
                <Text style={s.avatarText}>{initials}</Text>
              )}
            </TouchableOpacity>
            <View>
              <Text style={s.topName}>{firstName}</Text>
              <Text style={s.topTagline}>Build. Coach. Earn.</Text>
            </View>
          </View>

          {/* Revenue — secondary anchor, top-right */}
          <View style={s.revenueBlock}>
            <Text style={s.revenueAmount}>${revenue.toLocaleString()}</Text>
            <Text style={s.revenueSub}>
              {activeClients.length} active client{activeClients.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* ── Context Hero ───────────────────────────────────────────────────── */}
        <View style={s.heroBody}>
          {/* Eyebrow */}
          <View style={s.eyebrowRow}>
            {hero.state === 'live_soon' && <View style={s.liveDot} />}
            <Text style={[
              s.eyebrow,
              hero.state === 'live_soon'  && { color: CoachColors.danger },
              hero.state === 'trial_ending' && { color: CoachColors.warning },
            ]}>
              {hero.eyebrow}
            </Text>
          </View>

          {/* Headline */}
          <Text style={s.headline} numberOfLines={2}>{hero.headline}</Text>

          {/* Sub */}
          <Text style={s.sub}>{hero.sub}</Text>

          {/* CTA — haptic weight matches urgency of the state */}
          <TouchableOpacity
            style={[s.cta, { backgroundColor: hero.ctaColor }]}
            onPress={() => {
              // heavy = urgent action (trial expiring), medium = entry/navigation
              haptic.trigger(hero.state === 'trial_ending' ? 'heavy' : 'medium');
              router.push(hero.ctaRoute as any);
            }}
            activeOpacity={0.85}
          >
            <Ionicons name={hero.ctaIcon as any} size={15} color={ctaContentColor} />
            <Text style={[s.ctaText, { color: ctaContentColor }]}>{hero.ctaLabel}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const s = StyleSheet.create({
  root: {
    width: '100%',
    minHeight: 320,
    overflow: 'hidden',
    backgroundColor: CoachColors.bg,
  },
  bgImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.75,
  },
  safeArea: {
    flex: 1,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: CoachColors.border,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  topName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    letterSpacing: -0.2,
  },
  topTagline: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12,
    color: CoachColors.textMuted,
    letterSpacing: 0.3,
  },

  // Revenue block (secondary, top-right)
  revenueBlock: {
    alignItems: 'flex-end',
  },
  revenueAmount: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },
  revenueSub: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 0.2,
    marginTop: 1,
  },

  // Context hero body
  heroBody: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 36,
    paddingTop: 8,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: CoachColors.danger,
  },
  eyebrow: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 10,
    color: CoachColors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headline: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 6,
  },
  sub: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14,
    color: CoachColors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: Radius.md,
  },
  ctaText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
