/**
 * CornerCard — the Home lead for a coachless athlete (design canvas
 * "FitLink Solo Mode", board "s-home"). Sits above everything else on
 * (client-tabs)/index.tsx when the athlete has no coach: Solo is the lead
 * door, "Find a coach" is the other one, both honest.
 *
 * States (all derived from real data, never invented — DESIGN.md §Imagery
 * / real-data-or-omitted):
 *   - No solo row yet (clientData null)        → "Set up", sample line.
 *   - Solo row but no character chosen yet      → "Set up", sample line.
 *   - Character chosen, not premium (or a 402   → "Paid feature", sample
 *     from the server said so)                    line.
 *   - Character chosen and premium is active    → "Ready", today's brief
 *                                                  once it loads (cached
 *                                                  once/day locally).
 *
 * The brief itself is fetched at most once a day per client — AsyncStorage
 * key `solo_brief_<clientId>_<YYYY-MM-DD>` — and only when there is a real
 * premium window to spend the call on.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useWorkout } from '../../context/WorkoutContext';
import { computeStreak } from '../../lib/streak';
import { getSoloCharacter } from '../../lib/soloCharacters';
import { useSoloVoice, sampleLine, formatClock } from '../../lib/soloVoice';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';

// Orb glow only — delivery tint, same four characters as soloCharacters.ts.
const PERSONA_TINT: Record<string, string> = {
  reyes: '#9FB4C7',
  imani: '#B7A6F0',
  dane: '#F0A860',
  sol: '#A8D8B0',
};

export default function CornerCard() {
  const router = useRouter();
  const { clientData, todayWorkout, workouts } = useClient();
  const { workoutHistory } = useWorkout();
  const voice = useSoloVoice();

  const character = getSoloCharacter((clientData as any)?.solo_character);
  const tint = PERSONA_TINT[character.key] ?? PERSONA_TINT.reyes;
  const hasCharacter = !!(clientData as any)?.solo_character;
  const premiumUntilRaw = (clientData as any)?.premium_until as string | undefined;
  const premiumActive = !!premiumUntilRaw && new Date(premiumUntilRaw).getTime() > Date.now();

  const [brief, setBrief] = useState<string | null>(null);
  const [serverDenied, setServerDenied] = useState(false);

  const pillState: 'ready' | 'setup' | 'paid' =
    !clientData || !hasCharacter ? 'setup' : !premiumActive || serverDenied ? 'paid' : 'ready';

  // ── Today's brief — real data only, fetched at most once a day ──────────
  const workoutRow = todayWorkout?.workouts || todayWorkout;
  const sessionName: string | null = workoutRow?.name || workoutRow?.title || null;

  const buildContext = useCallback((): Record<string, string> => {
    const ctx: Record<string, string> = {};
    if (todayWorkout && sessionName) ctx.todays_workout = sessionName;
    const streak = computeStreak(workoutHistory, workouts);
    if (streak.days > 0) {
      ctx.training_streak = `${streak.days} consecutive day${streak.days === 1 ? '' : 's'}`;
    }
    return ctx;
  }, [todayWorkout, sessionName, workoutHistory, workouts]);

  useEffect(() => {
    if (!clientData?.id || !premiumActive) return;
    let alive = true;
    (async () => {
      const todayKey = new Date().toISOString().split('T')[0];
      const cacheKey = `solo_brief_${clientData.id}_${todayKey}`;
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          if (alive) setBrief(cached);
          return;
        }
      } catch {}
      try {
        const { data, error } = await supabase.functions.invoke('solo-corner', {
          body: { mode: 'brief', context: buildContext(), character: character.key },
        });
        if (!alive) return;
        if (error) {
          const status = (error as any)?.context?.status;
          if (status === 402) setServerDenied(true);
          return;
        }
        const reply: string | undefined = data?.reply;
        if (reply) {
          setBrief(reply);
          AsyncStorage.setItem(cacheKey, reply).catch(() => {});
        }
      } catch {
        // Quiet — the sample line covers this card either way.
      }
    })();
    return () => { alive = false; };
    // Re-runs only if the client or the premium window changes.
  }, [clientData?.id, premiumActive, character.key, buildContext]);

  // ── Voice ─────────────────────────────────────────────────────────────
  const speakText = brief ?? sampleLine(character.key);
  const isActiveVoice = voice.state.activeText === speakText;
  const isPlaying = isActiveVoice && (voice.state.playing || voice.state.loading);
  const knownDuration = isActiveVoice && voice.state.durationMs > 0 ? formatClock(voice.state.durationMs) : null;

  const handleHearIt = useCallback(() => {
    voice.toggle(speakText, character.key);
  }, [voice, speakText, character.key]);

  const handleOpen = useCallback(() => {
    router.push((hasCharacter ? ClientRoute.solo : ClientRoute.soloSetup) as any);
  }, [router, hasCharacter]);

  const quoteText = brief ? `“${brief}”` : character.sample;
  const pillLabel = pillState === 'ready' ? 'Ready' : pillState === 'setup' ? 'Set up' : 'Paid feature';
  const pillDotColor = pillState === 'ready' ? C.accent : pillState === 'paid' ? C.warning : C.textFaint;

  return (
    <View style={s.card}>
      {/* Soft tinted glow disc, top-right corner. Decorative only. */}
      <View style={[s.glow, { backgroundColor: tint }]} pointerEvents="none" />

      <View style={s.row1}>
        <Text style={s.kicker} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          YOUR CORNER · {character.name.toUpperCase()} · AI
        </Text>
        <View style={s.pill}>
          <View style={[s.pillDot, { backgroundColor: pillDotColor }]} />
          <Text style={s.pillText} maxFontSizeMultiplier={1.2}>{pillLabel}</Text>
        </View>
      </View>

      <View style={s.row2}>
        <View style={s.orbWrap}>
          <View style={[s.orbGlow, { backgroundColor: tint + '33' }]} />
          <View style={[s.orbRing, { borderColor: tint + '66' }]} />
          <View style={[s.orbCore, { backgroundColor: tint }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.quote} maxFontSizeMultiplier={1.3} numberOfLines={3}>
            {quoteText}
          </Text>
          {brief && (
            <Text style={s.briefMeta} maxFontSizeMultiplier={1.3}>
              Today's brief{knownDuration ? ` · ${knownDuration}` : ''}
            </Text>
          )}
        </View>
      </View>

      <View style={s.row3}>
        <Pressable
          style={s.hearBtn}
          onPress={handleHearIt}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Stop hearing your corner' : 'Hear your corner'}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color={C.onAccent} />
          <Text style={s.hearBtnText} maxFontSizeMultiplier={1.3}>Hear it</Text>
        </Pressable>
        <Pressable
          style={s.openBtn}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel="Open the corner"
        >
          <Text style={s.openBtnText} maxFontSizeMultiplier={1.3}>Open the corner</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 24, borderCurve: 'continuous',
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted,
    overflow: 'hidden',
    padding: 20,
    gap: 16,
  },
  glow: {
    position: 'absolute', right: -60, top: -60, width: 240, height: 240,
    borderRadius: 999, borderCurve: 'continuous', opacity: 0.25,
  },
  row1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: {
    flex: 1,
    fontFamily: F.bodySemiBold, fontSize: 11, letterSpacing: 1.2,
    color: C.textMuted,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillDot: { width: 6, height: 6, borderRadius: 999, borderCurve: 'continuous' },
  pillText: { fontFamily: F.body, fontSize: 12, color: C.textSecondary },

  row2: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  orbWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  orbGlow: { position: 'absolute', top: -28, left: -28, right: -28, bottom: -28, borderRadius: 999, borderCurve: 'continuous' },
  orbRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999, borderCurve: 'continuous', borderWidth: 1 },
  orbCore: { width: 52, height: 52, borderRadius: 999, borderCurve: 'continuous' },

  quote: { fontFamily: F.headingBold, fontSize: 20, lineHeight: 24, color: C.textPrimary },
  briefMeta: { fontFamily: F.body, fontSize: 13, color: C.textSecondary, marginTop: 6, fontVariant: ['tabular-nums'] },

  row3: { flexDirection: 'row', gap: 10 },
  hearBtn: {
    flex: 1, height: 48, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  hearBtnText: { fontFamily: F.bodyBold, fontSize: 15, color: C.onAccent },
  openBtn: {
    flex: 1, height: 48, borderRadius: 999, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  openBtnText: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
});
