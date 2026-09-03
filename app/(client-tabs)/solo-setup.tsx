/**
 * Solo setup — "Choose your corner" (design canvas "FitLink Solo Corner",
 * board "Choose a voice").
 *
 * Four personas from lib/soloCharacters.ts. A character sets DELIVERY
 * only — same brain, same numbers. Each card plays the same sample line in
 * its real voice (lib/soloVoice.ts, ElevenLabs per character) so the choice
 * is about delivery, not content.
 *
 * Confirming needs a clients row to write to: a coachless athlete may not
 * have one yet, so `ensureSoloClient()` creates the trainer-less "solo" row
 * on demand before the write, exactly like the corner screen does.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useAlert } from '../../context/AlertContext';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { ensureSoloClient } from '../../lib/soloClient';
import { useSoloVoice, sampleLine } from '../../lib/soloVoice';
import { Orb, SOLO_TINT } from '../../components/solo/Presence';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { SOLO_CHARACTERS, getSoloCharacter, type SoloCharacter } from '../../lib/soloCharacters';

export default function SoloSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { clientData, refreshData } = useClient();
  const { showAlert } = useAlert();
  const voice = useSoloVoice();

  // Start from whatever is already saved on the clients row.
  const [selectedKey, setSelectedKey] = useState<SoloCharacter['key']>(
    getSoloCharacter((clientData as any)?.solo_character).key
  );
  const [saving, setSaving] = useState(false);
  const selected = getSoloCharacter(selectedKey);

  // Hydrate once the row loads (setup can be reached before clientData is
  // ready, e.g. straight from onboarding).
  useEffect(() => {
    const saved = (clientData as any)?.solo_character;
    if (saved) setSelectedKey(getSoloCharacter(saved).key);
  }, [clientData && (clientData as any).solo_character]);

  const choose = useCallback((key: SoloCharacter['key']) => {
    setSelectedKey(key);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const playSample = useCallback((key: SoloCharacter['key']) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    voice.toggle(sampleLine(key), key);
  }, [voice]);

  const confirm = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      let clientId = clientData?.id;
      if (!clientId) {
        const ensured = await ensureSoloClient();
        if (ensured?.clientId) {
          await refreshData();
          clientId = ensured.clientId;
        }
      }
      if (!clientId) {
        showAlert({
          type: 'error',
          title: "Couldn't set up your corner",
          message: 'Check your connection and try again.',
        });
        return;
      }
      const { error } = await supabase
        .from('clients')
        .update({ solo_character: selectedKey })
        .eq('id', clientId);
      if (error) {
        showAlert({
          type: 'error',
          title: "Couldn't save your corner",
          message: error.message || 'Try again in a moment.',
        });
        return;
      }
      await refreshData();
      router.replace('/(client-tabs)/solo' as any);
    } finally {
      setSaving(false);
    }
  }, [saving, clientData?.id, selectedKey, refreshData, router, showAlert]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        {router.canGoBack() ? (
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={19} color={C.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={s.backBtnSpacer} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.kicker} maxFontSizeMultiplier={1.4}>Solo mode</Text>
          <Text style={s.headerTitle} maxFontSizeMultiplier={1.3}>Choose your corner</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(360)}>
          <Text style={s.title} maxFontSizeMultiplier={1.4}>
            Same brain, same numbers. Pick the voice in your ear.
          </Text>
          <Text style={s.sub} maxFontSizeMultiplier={1.4}>
            Tap play to hear each one say the same line. All four are AI, and say so.
          </Text>
        </Animated.View>

        <View style={s.cards}>
          {SOLO_CHARACTERS.map((ch, i) => {
            const isSelected = ch.key === selectedKey;
            const tint = SOLO_TINT[ch.key];
            const isPlayingThis = voice.state.activeText === sampleLine(ch.key) && (voice.state.playing || voice.state.loading);
            const genderLabel = ch.voiceLabel.replace(' voice', '');
            return (
              <Animated.View
                key={ch.key}
                entering={reducedMotion ? undefined : FadeInDown.delay(80 + i * 60).duration(360)}
              >
                <Pressable
                  style={[s.card, isSelected && s.cardSelected]}
                  onPress={() => choose(ch.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${ch.name}, ${genderLabel}. ${ch.tagline}`}
                >
                  <Orb tint={tint} size={64} speaking={isPlayingThis && voice.state.playing} loading={isPlayingThis && voice.state.loading} reduced={reducedMotion} />
                  <View style={s.cardText}>
                    <View style={s.nameRow}>
                      <Text style={[s.name, isSelected && s.nameSelected]} maxFontSizeMultiplier={1.3}>{ch.name}</Text>
                      <Text style={s.voiceLabel} maxFontSizeMultiplier={1.3}>
                        {genderLabel.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={s.tagline} maxFontSizeMultiplier={1.3}>{ch.tagline}</Text>
                  </View>
                  <TouchableOpacity
                    style={s.playBtn}
                    onPress={() => playSample(ch.key)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={isPlayingThis && voice.state.playing ? `Pause ${ch.name}'s sample` : `Play ${ch.name}'s sample`}
                  >
                    {isPlayingThis && voice.state.loading ? (
                      <ActivityIndicator size="small" color={C.textPrimary} />
                    ) : (
                      <Ionicons
                        name={isPlayingThis && voice.state.playing ? 'pause' : 'play'}
                        size={16}
                        color={C.textPrimary}
                      />
                    )}
                  </TouchableOpacity>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[s.ctaBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={s.footNote}>
          <View style={s.footDot} />
          <Text style={s.footNoteText} maxFontSizeMultiplier={1.3}>Change any time from the corner.</Text>
        </View>
        <TouchableOpacity
          style={[s.cta, saving && s.ctaDisabled]}
          onPress={confirm}
          disabled={saving}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Put ${selected.name} in my corner`}
        >
          {saving ? (
            <ActivityIndicator color={C.onAccent} />
          ) : (
            <Text style={s.ctaText} maxFontSizeMultiplier={1.2}>Put {selected.name} in my corner</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 999, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnSpacer: { width: 40, height: 40 },
  kicker: {
    fontFamily: F.bodySemiBold, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase', color: C.textMuted,
  },
  headerTitle: {
    fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary, marginTop: 2,
  },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },
  title: {
    fontFamily: F.headingBold, fontSize: 26, lineHeight: 30,
    color: C.textPrimary,
  },
  sub: {
    fontFamily: F.body, fontSize: 14, lineHeight: 20,
    color: C.textSecondary, marginTop: 6,
  },

  cards: { gap: 10, marginTop: 18 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface,
    borderRadius: 20, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.borderMuted,
    padding: 16,
  },
  cardSelected: { borderColor: C.accent },
  cardText: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary },
  nameSelected: { color: C.accent },
  voiceLabel: {
    fontFamily: F.body, fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase', color: C.textMuted,
  },
  tagline: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.textSecondary },
  playBtn: {
    width: 44, height: 44, borderRadius: 999, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },

  ctaBar: {
    paddingHorizontal: 20, paddingTop: 10, gap: 10,
    backgroundColor: C.bg,
  },
  footNote: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  footDot: { width: 6, height: 6, borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.accent },
  footNoteText: { fontFamily: F.body, fontSize: 13, color: C.textSecondary },
  cta: {
    height: 54, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { fontFamily: F.bodyBold, fontSize: 16, color: C.onAccent },
});
