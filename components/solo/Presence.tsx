/**
 * Presence — the corner's face (design canvas "FitLink Solo Corner").
 *
 * Solo is presence-first, not a chat wall: one persona orb that breathes at
 * rest, pulses while loading, and shows a small bar-meter while speaking —
 * plus the single spoken line the corner is currently saying. Both pieces
 * are shared between solo-setup.tsx (sample-line cards, orb size 64) and
 * solo.tsx (the corner itself, orb size 132).
 *
 * Persona tints are ORB-ONLY — every actionable control (buttons, chips,
 * selection state) stays the single lime accent (DESIGN.md "One accent").
 */

import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { formatClock, type VoiceState } from '../../lib/soloVoice';
import type { SoloCharacter } from '../../lib/soloCharacters';

/** Persona tints — orb glow/ring/fill only, never an action color. */
export const SOLO_TINT: Record<SoloCharacter['key'], string> = {
  reyes: '#9FB4C7',
  imani: '#B7A6F0',
  dane: '#F0A860',
  sol: '#A8D8B0',
};

function hexWithAlpha(hex: string, alphaHex: string): string {
  return `${hex}${alphaHex}`;
}

const BAR_COUNT = 7;

// ── One bar — its own shared value, driven by the parent's random loop ─────
function Bar({ tint, phase }: { tint: string; phase: ReturnType<typeof useSharedValue<number>> }) {
  const style = useAnimatedStyle(() => ({ height: 6 + phase.value * 26 }));
  return <Animated.View style={[s.bar, { backgroundColor: tint }, style]} />;
}

// ── Bar meter — 7 bars, randomised height loop while speaking ───────────────
// Fixed hook count (BAR_COUNT is a constant), each in its own child so the
// shared values are declared unconditionally, once each, in stable order.
function BarMeter({ tint, active, reduced }: { tint: string; active: boolean; reduced: boolean }) {
  const h0 = useSharedValue(0.3);
  const h1 = useSharedValue(0.3);
  const h2 = useSharedValue(0.3);
  const h3 = useSharedValue(0.3);
  const h4 = useSharedValue(0.3);
  const h5 = useSharedValue(0.3);
  const h6 = useSharedValue(0.3);
  const heights = [h0, h1, h2, h3, h4, h5, h6];

  useEffect(() => {
    if (!active || reduced) {
      heights.forEach((h) => {
        // Static mid-height bars under Reduce Motion (or at rest) — a plain
        // silhouette, not a frozen mid-animation frame.
        h.value = withTiming(reduced ? 0.5 : 0.28, { duration: 200 });
      });
      return;
    }
    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      heights.forEach((h) => {
        h.value = withTiming(0.15 + Math.random() * 0.85, {
          duration: 120,
          easing: Easing.inOut(Easing.quad),
        });
      });
    };
    loop();
    const id = setInterval(loop, 120);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduced]);

  return (
    <View style={s.barRow} pointerEvents="none">
      {heights.map((h, i) => <Bar key={i} tint={tint} phase={h} />)}
    </View>
  );
}

export interface OrbProps {
  tint: string;
  size: number;
  speaking?: boolean;
  loading?: boolean;
  reduced?: boolean;
  /** Show the bar-meter row under the orb (Corner screen only). */
  showMeter?: boolean;
  /**
   * Glow diameter as a multiple of `size`. Kept small and circular by
   * default so the glow never bleeds past a clipping card (setup screen's
   * voice cards); the corner screen can opt into a bigger ambient glow by
   * passing a higher value once it needs one, but never above 1.6 — a
   * bigger radius reads as a rectangle once it is squared against the
   * containing box.
   */
  glowScale?: number;
}

/**
 * The persona orb: soft radial fill, a 1px tinted ring, a wide tinted glow
 * behind it. Breathes at rest (scale 1 → 1.04, 2.4s loop); the ring pulses
 * opacity while loading. Reduce Motion is law — both loops freeze at rest.
 */
export function Orb({ tint, size, speaking, loading, reduced, showMeter, glowScale = 1.6 }: OrbProps) {
  const breathe = useSharedValue(1);
  const ringOpacity = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      breathe.value = 1;
      return;
    }
    if (loading || speaking) {
      // Loading/speaking have their own motion (ring pulse / bar meter) —
      // the breathing loop stands down rather than fighting them.
      breathe.value = withTiming(1, { duration: 200 });
      return;
    }
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [reduced, loading, speaking, breathe]);

  useEffect(() => {
    if (reduced || !loading) {
      ringOpacity.value = withTiming(1, { duration: 200 });
      return;
    }
    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [reduced, loading, ringOpacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value }],
    opacity: ringOpacity.value,
  }));

  const glowSize = size * Math.min(glowScale, 1.6);
  const innerSize = size * 0.61;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {/* Soft glow behind everything — a small circle, never a rectangle:
            capped at 1.6x the orb, clipped to its own radius, and kept
            faint enough to read as ambient light rather than a panel. */}
        <View
          pointerEvents="none"
          style={[
            s.glow,
            {
              width: glowSize,
              height: glowSize,
              borderRadius: glowSize / 2,
              top: (size - glowSize) / 2,
              left: (size - glowSize) / 2,
            },
          ]}
        >
          <LinearGradient
            colors={[hexWithAlpha(tint, '33'), hexWithAlpha(tint, '00')]}
            style={{ width: glowSize, height: glowSize, borderRadius: glowSize / 2 }}
          />
        </View>

        {/* 1px tinted ring, breathes at rest / pulses while loading */}
        <Animated.View
          pointerEvents="none"
          style={[
            s.ring,
            { width: size, height: size, borderRadius: size / 2, borderColor: hexWithAlpha(tint, '55') },
            ringStyle,
          ]}
        />

        {/* Solid radial fill */}
        <View
          style={{
            width: innerSize, height: innerSize, borderRadius: innerSize / 2,
            overflow: 'hidden', backgroundColor: tint,
          }}
        >
          <LinearGradient
            colors={[tint, hexWithAlpha(tint, '99'), hexWithAlpha(tint, '33')]}
            start={{ x: 0.35, y: 0.3 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      {showMeter && <BarMeter tint={tint} active={!!speaking} reduced={!!reduced} />}
    </View>
  );
}

export interface SpokenLineProps {
  text: string;
  tint: string;
  state: VoiceState;
  onToggle: () => void;
  /** Muted for the athlete's own echoed line — no progress/clock chrome. */
  muted?: boolean;
}

/**
 * The big spoken quote (Space Grotesk 24/30, centered) with a thin
 * tint-filled progress line and a mono clock underneath. Tap toggles
 * playback of `text` in the corner's voice.
 */
export function SpokenLine({ text, tint, state, onToggle, muted }: SpokenLineProps) {
  const isActive = state.activeText === text && (state.playing || state.loading);
  const progressPct = Math.round(Math.min(1, Math.max(0, state.progress)) * 100);
  const clock = isActive
    ? `${formatClock(state.positionMs)} / ${formatClock(state.durationMs)}`
    : null;

  return (
    <Pressable
      onPress={onToggle}
      style={s.spokenWrap}
      accessibilityRole="button"
      accessibilityLabel={isActive && state.playing ? 'Pause' : 'Play this line'}
    >
      <Text
        style={[s.spokenText, muted && s.spokenTextMuted]}
        maxFontSizeMultiplier={1.4}
        accessibilityLiveRegion="polite"
      >
        {text}
      </Text>
      {!muted && (
        <View style={s.clockRow}>
          {clock && <Text style={s.clockText} maxFontSizeMultiplier={1.3}>{clock}</Text>}
          <View style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                { backgroundColor: tint, width: `${isActive ? progressPct : 0}%` },
              ]}
            />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  glow: { position: 'absolute', overflow: 'hidden', borderCurve: 'continuous', opacity: 0.18 },
  ring: { position: 'absolute', borderWidth: 1 },
  barRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 4,
    height: 32, marginTop: 14,
  },
  bar: { width: 4, borderRadius: 999, borderCurve: 'continuous' },

  spokenWrap: { alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  spokenText: {
    fontFamily: F.headingBold, fontSize: 24, lineHeight: 30,
    color: C.textPrimary, textAlign: 'center',
  },
  spokenTextMuted: {
    fontFamily: F.bodyMedium, fontSize: 13, lineHeight: 18,
    color: C.textFaint,
  },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clockText: {
    fontFamily: F.mono, fontSize: 12, color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    width: 120, height: 2, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.border, overflow: 'hidden',
  },
  progressFill: { height: 2, borderRadius: 999, borderCurve: 'continuous' },
});
