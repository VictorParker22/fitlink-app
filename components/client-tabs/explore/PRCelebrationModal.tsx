import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
// The share pipeline: capture the branded card as a PNG, hand it to the
// system share sheet. Native-only — expo-sharing has no web share target
// worth the edge cases, and the web build simply hides the button.
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useReducedMotion } from '../../../lib/useReducedMotion';

const { width: W, height: H } = Dimensions.get('window');
const PARTICLE_COUNT = 14;

// Spread angles across the full circle in radians
const PARTICLE_ANGLES = Array.from(
  { length: PARTICLE_COUNT },
  (_, i) => (i / PARTICLE_COUNT) * 2 * Math.PI,
);

// Lime accent palette for particle dots
const PARTICLE_COLORS = [
  CoachColors.accent,
  CoachColors.textPrimary,
  CoachColors.accent,
  CoachColors.accentSoft,
];

interface PRCelebrationModalProps {
  visible: boolean;
  exerciseName: string;
  weight: number;
  onDismiss: () => void;
}

export default function PRCelebrationModal({
  visible,
  exerciseName,
  weight,
  onDismiss,
}: PRCelebrationModalProps) {
  // ── Card enter animation ──────────────────────────────────────────────────
  const cardScale  = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // ── Trophy pulse ─────────────────────────────────────────────────────────
  const trophyScale = useRef(new Animated.Value(1)).current;

  // ── Particles — one Animated.Value per particle for distance ─────────────
  const particleAnims = useRef(
    PARTICLE_ANGLES.map(() => ({
      dist: new Animated.Value(0),
      opacity: new Animated.Value(1),
    })),
  ).current;

  // ── Auto-dismiss timer ────────────────────────────────────────────────────
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reduceMotion = useReducedMotion();

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.parallel([
      Animated.timing(cardScale, { toValue: 0.8, duration: 200, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }, [onDismiss, cardScale, cardOpacity, backdropOpacity]);

  // ── Share: the PR as a story-sized branded image ─────────────────────────
  // This is the app's one deliberately viral surface (see
  // .agents/GROWTH_PLAYBOOK.md §3): an athlete's new best, rendered in the
  // brand, shared by the athlete because it is THEIR number. The card that
  // gets captured is the offscreen view below, not this modal — the modal
  // has a dismiss hint and a live backdrop, neither of which belongs in a
  // photo.
  const shareCardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const sharePr = useCallback(async () => {
    if (sharing) return;
    // A share in progress must not be yanked away by the auto-dismiss.
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setSharing(true);
    try {
      const uri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
        // 1080x1350 — the 4:5 portrait every feed accepts uncropped.
        width: 1080,
        height: 1350,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your PR' });
      }
    } catch {
      // A failed share must never crash a celebration. The athlete still
      // has the modal; they lose nothing but the share sheet.
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  useEffect(() => {
    if (!visible) return;

    // One success notification. This used to fire three haptics inside 300ms
    // (success + heavy + medium), which reads as a malfunction rather than a
    // celebration and is exactly the overuse the HIG warns against.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Reset all animated values
    cardScale.setValue(0);
    cardOpacity.setValue(0);
    backdropOpacity.setValue(0);
    trophyScale.setValue(1);
    particleAnims.forEach(p => { p.dist.setValue(0); p.opacity.setValue(1); });

    // Reduce Motion: no burst, no spring, no pulsing trophy. The celebration
    // still appears (and still auto-dismisses) — it just arrives already
    // composed instead of exploding onto the screen.
    if (reduceMotion) {
      backdropOpacity.setValue(1);
      cardOpacity.setValue(1);
      cardScale.setValue(1);
      particleAnims.forEach(p => { p.opacity.setValue(0); });
      dismissTimer.current = setTimeout(() => dismiss(), 3500);
      return () => {
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
      };
    }

    // 1. Backdrop fade in
    Animated.timing(backdropOpacity, {
      toValue: 1, duration: 300, useNativeDriver: true,
    }).start();

    // 2. Card spring in
    Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // 3. Trophy pulse loop (starts 200ms in so card is visible first)
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(trophyScale, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(trophyScale, { toValue: 1,    duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const pulseTimeout = setTimeout(() => pulseAnim.start(), 200);

    // 4. Burst particles outward from center, staggered
    const particleAnimations = particleAnims.map((p, i) =>
      Animated.sequence([
        Animated.delay(i * 30),
        Animated.parallel([
          Animated.timing(p.dist, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(400),
            Animated.timing(p.opacity, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
    );
    Animated.parallel(particleAnimations).start();

    // 5. Auto-dismiss after 3.5s
    dismissTimer.current = setTimeout(() => dismiss(), 3500);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      clearTimeout(pulseTimeout);
      pulseAnim.stop();
    };
  }, [visible, reduceMotion]);

  if (!visible) return null;

  const PARTICLE_RADIUS = W * 0.38; // how far particles travel from center

  return (
    <Modal transparent animationType="none" visible={visible} statusBarTranslucent onRequestClose={dismiss}>
      {/* The wrapper is NOT itself accessible: making it one element swallowed
          the card and VoiceOver announced only "Dismiss…", never the PR
          itself. The card below carries the announcement. */}
      <TouchableWithoutFeedback onPress={dismiss} accessible={false}>
        <View style={s.root}>
          {/* Backdrop */}
          <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]} importantForAccessibility="no" accessibilityElementsHidden />

          {/* Particles */}
          {particleAnims.map((p, i) => {
            const angle = PARTICLE_ANGLES[i];
            const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
            const size = 6 + (i % 4) * 3; // vary sizes: 6, 9, 12, 15
            const tx = p.dist.interpolate({
              inputRange: [0, 1],
              outputRange: [0, Math.cos(angle) * PARTICLE_RADIUS],
            });
            const ty = p.dist.interpolate({
              inputRange: [0, 1],
              outputRange: [0, Math.sin(angle) * PARTICLE_RADIUS],
            });
            return (
              <Animated.View
                key={i}
                importantForAccessibility="no"
                accessibilityElementsHidden
                style={[
                  s.particle,
                  { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
                  { opacity: p.opacity, transform: [{ translateX: tx }, { translateY: ty }] },
                ]}
              />
            );
          })}

          {/* Card — reads as ONE element and is announced on appear, so the
              PR is not a silently-flashed visual for VoiceOver users. */}
          <Animated.View
            accessible
            accessibilityRole="alert"
            accessibilityViewIsModal
            accessibilityLiveRegion="assertive"
            accessibilityLabel={`New personal record. ${weight % 1 === 0 ? weight : weight.toFixed(1)} kilograms lifted on ${exerciseName}. That's your best ever.`}
            accessibilityHint="Double tap anywhere to continue"
            onAccessibilityTap={dismiss}
            style={[
              s.card,
              { opacity: cardOpacity, transform: [{ scale: cardScale }] },
            ]}
          >
            {/* Accent top strip */}
            <View style={s.accentStrip} />

            {/* Trophy */}
            <Animated.View style={[s.trophy, { transform: [{ scale: trophyScale }] }]}>
              <Ionicons name="trophy" size={72} color={CoachColors.accent} />
            </Animated.View>

            {/* Badge */}
            <View style={s.badge}>
              <Text style={s.badgeText}>New PR</Text>
            </View>

            {/* Weight */}
            <Text style={s.weight}>{weight % 1 === 0 ? weight : weight.toFixed(1)}</Text>
            <Text style={s.weightUnit}>kg lifted</Text>

            {/* Exercise name */}
            <Text style={s.exerciseName} numberOfLines={2}>{exerciseName}</Text>

            {/* Motivational line */}
            <Text style={s.sub}>That's your best ever. Keep pushing.</Text>

            {/* Share — native only; web has no share sheet worth faking. */}
            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={s.shareBtn}
                onPress={sharePr}
                disabled={sharing}
                accessibilityRole="button"
                accessibilityLabel="Share this personal record as an image"
              >
                <Ionicons name="share-outline" size={16} color={CoachColors.onAccent} />
                <Text style={s.shareBtnText}>{sharing ? 'Preparing…' : 'Share it'}</Text>
              </TouchableOpacity>
            )}

            {/* Tap-to-dismiss hint */}
            <Text style={s.hint}>Tap anywhere to continue</Text>
          </Animated.View>
          {/* ── The card that actually gets shared ──────────────────────
              Rendered offscreen (not display:none — capture needs layout).
              360x450 locally, captured at 1080x1350. Everything on it is
              the athlete's own number and the brand; no UI chrome, no
              dismiss hints, nothing that reads as a screenshot. */}
          <View
            ref={shareCardRef}
            collapsable={false}
            style={s.shareCard}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            pointerEvents="none"
          >
            <View style={s.shareCardHead}>
              <View style={s.shareCardMark}><Text style={s.shareCardMarkText}>FL</Text></View>
              <Text style={s.shareCardBrand}>FitLink</Text>
            </View>
            <View style={s.shareCardBadge}><Text style={s.shareCardBadgeText}>New personal record</Text></View>
            <Text style={s.shareCardWeight}>
              {weight % 1 === 0 ? weight : weight.toFixed(1)}
              <Text style={s.shareCardUnit}> kg</Text>
            </Text>
            <Text style={s.shareCardExercise} numberOfLines={2}>{exerciseName}</Text>
            <Text style={s.shareCardDate}>
              {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
            <View style={s.shareCardRule} />
            <Text style={s.shareCardFoot}>fitlink.coach</Text>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
  },

  // Particle dots — positioned absolutely at center, then translated via Animated
  particle: {
    position: 'absolute',
  },

  // Card
  card: {
    width: W * 0.82,
    backgroundColor: CoachColors.surface,
    borderRadius: 24,
    borderCurve: 'continuous',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 32,
    borderWidth: 1.5,
    borderColor: CoachColors.border,
    // Elevation for Android
    elevation: 24,
    // Shadow for iOS
    shadowColor: CoachColors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    overflow: 'hidden',
  },
  accentStrip: {
    height: 4,
    width: '140%', // bleed beyond card radius
    backgroundColor: CoachColors.accent,
    marginBottom: 24,
  },
  trophy: {
    marginBottom: 8,
  },
  badge: {
    backgroundColor: CoachColors.accent,
    borderRadius: 100,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 20,
    marginTop: 12,
  },
  badgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12.5,
    color: CoachColors.onAccent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  weight: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 80.5,
    color: CoachColors.textPrimary,
    lineHeight: 87.5,
    textAlign: 'center',
  },
  weightUnit: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 16,
  },
  exerciseName: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  sub: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22.5,
  },
  hint: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    letterSpacing: 0.5,
  },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CoachColors.accent,
    borderRadius: 100,
    borderCurve: 'continuous',
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginBottom: 18,
  },
  shareBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.onAccent,
  },

  // ── The captured card ─────────────────────────────────────────────
  // Offscreen but laid out. 360x450 = the 4:5 story/feed ratio.
  shareCard: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: 360,
    height: 450,
    backgroundColor: CoachColors.bg,
    paddingHorizontal: 32,
    paddingVertical: 34,
    justifyContent: 'flex-start',
  },
  shareCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 34 },
  shareCardMark: {
    width: 30, height: 30, borderRadius: 9, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  shareCardMarkText: { fontFamily: CoachFonts.headingBold, fontSize: 13, color: CoachColors.onAccent },
  shareCardBrand: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary },
  shareCardBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: CoachColors.accent, borderRadius: 100, borderCurve: 'continuous',
    paddingHorizontal: 12, paddingVertical: 5, marginBottom: 22,
  },
  shareCardBadgeText: {
    fontFamily: CoachFonts.bodyMedium, fontSize: 11, color: CoachColors.accent,
    letterSpacing: 1.6, textTransform: 'uppercase',
  },
  shareCardWeight: {
    fontFamily: CoachFonts.headingBold, fontSize: 92, lineHeight: 96,
    color: CoachColors.accent, letterSpacing: -2,
  },
  shareCardUnit: { fontSize: 34, color: CoachColors.textSecondary, letterSpacing: 0 },
  shareCardExercise: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 26,
    color: CoachColors.textPrimary, marginTop: 8,
  },
  shareCardDate: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 6 },
  shareCardRule: { height: 1, backgroundColor: CoachColors.borderMuted, marginTop: 'auto', marginBottom: 14 },
  shareCardFoot: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textSecondary },
});
