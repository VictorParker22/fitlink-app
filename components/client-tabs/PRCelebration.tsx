import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  useWindowDimensions, ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { insertSquadEvent, SquadShare } from '../../lib/squadEvents';
import { playChime } from '../../lib/sounds';

/**
 * The PR payoff (design turn 22c) — shown in-screen when a strength session
 * ends with a genuine personal record. Named by exercise, shows the athlete's
 * actual numbers against their real prior best, and gives the PR somewhere to
 * go: an editable one-line message that lands in the coach conversation.
 *
 * Rendered as an absolutely-positioned overlay inside the screen — NOT a
 * native Modal — following components/coach/PassPublishedOverlay.tsx.
 * Every number comes from real history; sections with no data are omitted.
 */

const PARTICLE_COLORS = [
  CoachColors.accent,
  'rgba(198,242,78,0.55)',
  CoachColors.textPrimary,
  CoachColors.textMuted,
];

type Particle = {
  x0: number; drift: number; size: number; color: string;
  delay: number; spins: number; fall: number; rot0: number;
};

export interface WeeklyBest {
  label: string;    // e.g. "W1"
  weight: number;   // kg — real logged top weight that week
  isCurrent: boolean;
}

export default function PRCelebration({
  exerciseName,
  weight,
  reps,
  setsCount,
  priorBest,
  gainSinceFirst,   // null when this is the only logged data point
  weeklyBests,      // [] hides the chart
  coachName,
  defaultMessage,
  canSend,
  onSend,
  onDone,
  squad,
}: {
  exerciseName: string;
  weight: number;
  reps: number;
  setsCount: number;
  priorBest: number;
  gainSinceFirst: { kg: number; weeksAgo: number } | null;
  weeklyBests: WeeklyBest[];
  coachName: string;
  defaultMessage: string;
  canSend: boolean;
  onSend: (message: string) => Promise<void>;
  onDone: () => void;
  /** Present when the athlete is on a pass — enables the squad feed share. */
  squad?: SquadShare | null;
}) {
  // absoluteFill View, not a native Modal — Android back would otherwise pop
  // the screen underneath while this was still covering it.
  useAndroidBack(useCallback(() => { onDone(); return true; }, [onDone]));

  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [message, setMessage] = useState(defaultMessage);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [shareSquad, setShareSquad] = useState(true);
  const squadSharedRef = useRef(false);

  const shareWithSquad = () => {
    if (!squad || !shareSquad || squadSharedRef.current) return;
    squadSharedRef.current = true;
    insertSquadEvent(squad, 'pr', {
      exercise: exerciseName,
      weight,
      prev: priorBest,
    });
  };

  const particles = useMemo<Particle[]>(
    () =>
      // Reduce Motion: no confetti fall — the card alone carries the moment.
      Array.from({ length: reduced ? 0 : 30 }, (_, i) => ({
        x0: Math.random() * width,
        drift: (Math.random() - 0.5) * 140,
        size: 5 + Math.random() * 6,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        delay: Math.random() * 0.3,
        spins: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2),
        fall: height * (0.55 + Math.random() * 0.5),
        rot0: Math.random() * 360,
      })),
    [width, height]
  );

  const progress = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.86)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playChime();
    if (reduced) {
      // Reduce Motion: jump to final values with a plain fade at most.
      progress.setValue(1);
      cardScale.setValue(1);
      Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      return;
    }
    Animated.parallel([
      Animated.timing(progress, {
        toValue: 1, duration: 2200,
        easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 13, bounciness: 8 }),
    ]).start();
  }, [reduced]);

  const handleSend = async () => {
    const content = message.trim();
    if (!content || sendState === 'sending' || sendState === 'sent') return;
    setSendState('sending');
    try {
      await onSend(content);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSendState('sent');
      shareWithSquad();
    } catch {
      setSendState('failed');
    }
  };

  const maxBar = Math.max(...weeklyBests.map(w => w.weight), 1);

  return (
    <View style={[StyleSheet.absoluteFill, s.root]} pointerEvents="auto">
      {/* Confetti */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map((p, i) => {
          const start = Math.min(p.delay, 0.3);
          const translateY = progress.interpolate({
            inputRange: [start, 1], outputRange: [-40, p.fall], extrapolate: 'clamp',
          });
          const translateX = progress.interpolate({
            inputRange: [start, (start + 1) / 2, 1],
            outputRange: [0, p.drift * 0.6, p.drift], extrapolate: 'clamp',
          });
          const rotate = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [`${p.rot0}deg`, `${p.rot0 + p.spins * 360}deg`],
          });
          const opacity = progress.interpolate({
            inputRange: [0, start, 0.75, 1], outputRange: [0, 1, 1, 0],
          });
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute', top: 0, left: p.x0,
                width: p.size, height: p.size * 1.6, borderRadius: 2,
                backgroundColor: p.color, opacity,
                transform: [{ translateY }, { translateX }, { rotate }],
              }}
            />
          );
        })}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={{ flex: 1, opacity: cardOpacity, transform: [{ scale: cardScale }] }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.eyebrow}>New best</Text>
            <View style={s.bigRow}>
              <Text style={s.bigNumber}>{formatKg(weight)}</Text>
              <Text style={s.bigUnit}> kg</Text>
            </View>
            <Text style={s.liftLine}>
              {exerciseName}, {setsCount} {setsCount === 1 ? 'set' : 'sets'} of {reps}
            </Text>
            <Text style={s.priorLine}>
              {gainSinceFirst
                ? `Up ${formatKg(gainSinceFirst.kg)} kg since you started${gainSinceFirst.weeksAgo >= 1 ? `, ${gainSinceFirst.weeksAgo === 1 ? 'a week' : `${gainSinceFirst.weeksAgo} weeks`} ago` : ''}`
                : `Previous best: ${formatKg(priorBest)} kg`}
            </Text>

            {weeklyBests.length >= 2 && (
              <View style={s.chartCard}>
                <View style={s.chartRow}>
                  {weeklyBests.map((w, i) => (
                    <View key={`${w.label}-${i}`} style={s.chartCol}>
                      <View
                        style={[
                          s.bar,
                          {
                            height: Math.max(10, Math.round((w.weight / maxBar) * 56)),
                            backgroundColor: w.isCurrent ? CoachColors.accent : '#2E322B',
                          },
                        ]}
                      />
                      <Text style={[s.barLabel, w.isCurrent && s.barLabelCurrent]}>{w.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.chartCaption}>
                  Every session logged, every number real. Nothing here was luck.
                </Text>
              </View>
            )}

            {canSend && (
              <View style={s.tellCard}>
                <Text style={s.tellEyebrow}>Tell someone</Text>
                <Text style={s.tellHint}>
                  This goes straight into your chat with {coachName}. Edit it or send it as is.
                </Text>
                <TextInput
                  style={s.tellInput}
                  value={message}
                  onChangeText={(t) => { setMessage(t); if (sendState === 'failed') setSendState('idle'); }}
                  multiline
                  editable={sendState !== 'sent' && sendState !== 'sending'}
                  placeholder="Write a message"
                  placeholderTextColor={CoachColors.textFaint}
                />
                <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
                  style={[s.sendBtn, (sendState === 'sent') && s.sendBtnDone]}
                  onPress={handleSend}
                  activeOpacity={0.85}
                  disabled={sendState === 'sending' || sendState === 'sent' || !message.trim()}
                >
                  <Text style={[s.sendBtnText, sendState === 'sent' && s.sendBtnTextDone]}>
                    {sendState === 'sent' ? `Sent to ${coachName}` : sendState === 'sending' ? 'Sending…' : `Send to ${coachName}`}
                  </Text>
                </TouchableOpacity>
                {sendState === 'failed' && (
                  <Text style={s.sendError}>Couldn't send — check your connection and try again.</Text>
                )}
              </View>
            )}

            {squad && (
              <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }}
                style={s.squadRow}
                onPress={() => { Haptics.selectionAsync(); setShareSquad(v => !v); }}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: shareSquad }}
              >
                <View style={[s.squadBox, shareSquad && s.squadBoxOn]}>
                  {shareSquad && <View style={s.squadTick} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.squadLabel}>Share with the squad</Text>
                  <Text style={s.squadHint}>
                    Athletes on your pass see "{exerciseName} PR — {formatKg(weight)} kg". Nothing else.
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            <View style={{ height: 16 }} />
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity
              style={s.doneBtn}
              onPress={() => { shareWithSquad(); onDone(); }}
              activeOpacity={0.85}
            >
              <Text style={s.doneBtnText}>Finish session</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function formatKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

const s = StyleSheet.create({
  root: {
    backgroundColor: 'rgba(16,18,16,0.98)',
    zIndex: 100,
    elevation: 100,
  },
  scrollContent: {
    paddingTop: 84,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  eyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.accent,
    letterSpacing: 1.6, textTransform: 'uppercase',
  },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 },
  bigNumber: {
    fontFamily: CoachFonts.headingBold, fontSize: 83, lineHeight: 87.5,
    color: CoachColors.textPrimary, letterSpacing: -2,
  },
  bigUnit: {
    fontFamily: CoachFonts.body, fontSize: 29, color: CoachColors.textMuted,
    marginBottom: 10,
  },
  liftLine: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textPrimary,
    marginTop: 8, textAlign: 'center',
  },
  priorLine: {
    fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted,
    marginTop: 5, textAlign: 'center',
  },

  chartCard: {
    alignSelf: 'stretch',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 18, padding: 16, marginTop: 24,
  },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 76 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textFaint },
  barLabelCurrent: { color: CoachColors.accent, fontFamily: CoachFonts.bodyBold },
  chartCaption: {
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted,
    lineHeight: 20, marginTop: 13, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#21241F',
  },

  tellCard: {
    alignSelf: 'stretch',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 18, padding: 15, marginTop: 12,
  },
  tellEyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 1.1, textTransform: 'uppercase',
  },
  tellHint: {
    fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted,
    marginTop: 6, lineHeight: 19,
  },
  tellInput: {
    backgroundColor: '#1E211D',
    borderWidth: 1, borderColor: '#2E322B',
    borderRadius: 13, padding: 13, marginTop: 12,
    fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textPrimary,
    lineHeight: 22.5, minHeight: 74, textAlignVertical: 'top',
  },
  sendBtn: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
    paddingVertical: 11, alignItems: 'center', marginTop: 11,
  },
  sendBtnDone: { borderColor: 'rgba(198,242,78,0.4)', backgroundColor: CoachColors.accentSofter },
  sendBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.accent },
  sendBtnTextDone: { color: CoachColors.accent },
  sendError: {
    fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.danger,
    marginTop: 8, textAlign: 'center',
  },

  squadRow: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 11,
    marginTop: 12, paddingHorizontal: 4, paddingVertical: 2,
  },
  squadBox: {
    width: 20, height: 20, borderRadius: 6, marginTop: 1,
    borderWidth: 1.5, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  squadBoxOn: { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter },
  squadTick: { width: 10, height: 10, borderRadius: 3, backgroundColor: CoachColors.accent },
  squadLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  squadHint: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted,
    marginTop: 2, lineHeight: 18,
  },

  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  doneBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 16, alignItems: 'center',
  },
  doneBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },
});
