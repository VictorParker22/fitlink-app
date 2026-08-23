/**
 * Solo setup — "Choose your corner" (design canvas "FitLink Solo Mode",
 * board 1).
 *
 * Four personas from lib/soloCharacters.ts. A character sets DELIVERY only —
 * same brain, same numbers. The choice persists to clients.solo_character
 * ({error}-checked, quiet failure tolerable — local state keeps the screen
 * honest either way) and the CTA replaces into the Solo chat.
 *
 * No voice play buttons in v1: voice is v2, so no dead controls — the
 * voiceLabel line carries the male/female voice identity, clearly marked AI.
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { SOLO_CHARACTERS, getSoloCharacter, type SoloCharacter } from '../../lib/soloCharacters';

export default function SoloSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { clientData } = useClient();

  // Start from whatever is already saved on the clients row.
  const [selectedKey, setSelectedKey] = useState<SoloCharacter['key']>(
    getSoloCharacter((clientData as any)?.solo_character).key
  );
  const selected = getSoloCharacter(selectedKey);

  // Persist on tap. Supabase resolves { error } — never throws (INVARIANTS
  // §2). A failed write is quietly tolerated: local state still drives the
  // session, and the next successful tap self-heals the row.
  const choose = useCallback(
    (key: SoloCharacter['key']) => {
      setSelectedKey(key);
      Haptics.selectionAsync().catch(() => {});
      if (!clientData?.id) return;
      (async () => {
        const { error } = await supabase
          .from('clients')
          .update({ solo_character: key })
          .eq('id', clientData.id);
        if (error && __DEV__) console.warn('[SoloSetup] character not saved:', error.message);
      })();
    },
    [clientData?.id]
  );

  const start = useCallback(() => {
    router.replace('/(client-tabs)/solo' as any);
  }, [router]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {router.canGoBack() && (
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
        )}

        <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(360)}>
          <Text style={s.kicker} maxFontSizeMultiplier={1.4}>SOLO SETUP · YOUR CORNER</Text>
          <Text style={s.title} maxFontSizeMultiplier={1.4}>Who's in your corner?</Text>
          <Text style={s.sub} maxFontSizeMultiplier={1.4}>
            Pick the voice and the temperament. Same brain, same numbers — different delivery.
            Change it any time.
          </Text>
        </Animated.View>

        <View style={s.cards}>
          {SOLO_CHARACTERS.map((ch, i) => {
            const isSelected = ch.key === selectedKey;
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
                  accessibilityLabel={`${ch.name}, ${ch.voiceLabel}. ${ch.tagline}`}
                >
                  <View style={s.cardRow}>
                    <View style={[s.iconTile, isSelected && s.iconTileSelected]}>
                      <Ionicons
                        name={ch.icon}
                        size={24}
                        color={isSelected ? C.accent : C.textSecondary}
                      />
                    </View>
                    <View style={s.cardText}>
                      <View style={s.nameRow}>
                        <Text style={s.name} maxFontSizeMultiplier={1.3}>{ch.name}</Text>
                        <Text style={s.voiceLabel} maxFontSizeMultiplier={1.3}>
                          {ch.voiceLabel.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={s.tagline} maxFontSizeMultiplier={1.3}>{ch.tagline}</Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={22} color={C.accent} />
                    )}
                  </View>
                  {isSelected && (
                    <View style={s.sampleBox}>
                      <Text style={s.sampleText} maxFontSizeMultiplier={1.3}>{ch.sample}</Text>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[s.ctaBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={s.cta}
          onPress={start}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Train with ${selected.name}`}
        >
          <Text style={s.ctaText} maxFontSizeMultiplier={1.2}>Train with {selected.name}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },

  backBtn: {
    width: 40, height: 40, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },

  kicker: {
    fontFamily: F.bodySemiBold, fontSize: 11, letterSpacing: 1.4,
    textTransform: 'uppercase', color: C.accent,
  },
  title: {
    fontFamily: F.headingBold, fontSize: 28, lineHeight: 33,
    color: C.textPrimary, marginTop: 6,
  },
  sub: {
    fontFamily: F.body, fontSize: 14.5, lineHeight: 21.5,
    color: C.textSecondary, marginTop: 8,
  },

  cards: { gap: 12, marginTop: 24 },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16, borderCurve: 'continuous',
    borderWidth: 1.5, borderColor: C.borderMuted,
    padding: 16,
  },
  cardSelected: { borderColor: C.accent },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: {
    width: 52, height: 52, borderRadius: 16, borderCurve: 'continuous',
    backgroundColor: C.surfaceRaised,
    borderWidth: 1, borderColor: C.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  iconTileSelected: {
    backgroundColor: C.accentSofter,
    borderColor: 'transparent',
  },
  cardText: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: F.headingSemiBold, fontSize: 17, color: C.textPrimary },
  voiceLabel: {
    fontFamily: F.bodySemiBold, fontSize: 10.5, letterSpacing: 0.8,
    color: C.textFaint,
  },
  tagline: { fontFamily: F.body, fontSize: 13, lineHeight: 18.5, color: C.textSecondary },
  sampleBox: {
    marginTop: 12,
    backgroundColor: C.bg,
    borderRadius: 12, borderCurve: 'continuous',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  sampleText: {
    fontFamily: F.body, fontSize: 12.5, lineHeight: 18.5,
    fontStyle: 'italic', color: C.textSecondary,
  },

  ctaBar: {
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: C.bg,
    borderTopWidth: 1, borderTopColor: C.borderMuted,
  },
  cta: {
    height: 52, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontFamily: F.bodyBold, fontSize: 15.5, color: C.onAccent },
});
