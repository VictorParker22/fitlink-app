/**
 * PermissionCards — the shared "why we ask" list used by both onboardings.
 *
 * One card per permission: icon tile, benefit-led copy, and a single Allow
 * button that becomes a lime "On" chip once granted. If the OS has already
 * burned its one-shot prompt (iOS canAskAgain=false), the button becomes
 * "Open Settings" — never a dead Allow.
 *
 * Nothing here blocks the flow: the parent screen's Continue works whether
 * the user granted everything, something, or nothing. Priming, not a wall.
 *
 * `variant` picks the type voice: 'coach' (default, Space Grotesk/Epilogue
 * on CoachColors — trainer-wizard.tsx, unchanged) or 'editorial' (Manrope on
 * the athlete Arrival onboarding's OB tokens — see constants/onboardingDesign.ts
 * — so athlete-permissions.tsx keeps one typographic voice until Home).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { OB, OBFonts, OBRadius } from '../../constants/onboardingDesign';
import { openAppSettings, type PermState } from '../../lib/permissions';

export interface PermissionItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  why: string;
  getState: () => Promise<PermState>;
  request: () => Promise<PermState>;
}

type Variant = 'coach' | 'editorial';

const TOKENS = {
  coach: {
    surface: CoachColors.surface,
    border: CoachColors.borderMuted,
    borderStrong: CoachColors.border,
    iconTile: CoachColors.accentSofter,
    fg: CoachColors.textPrimary,
    muted: CoachColors.textMuted,
    faint: CoachColors.textFaint,
    accent: CoachColors.accent,
    onAccent: CoachColors.onAccent,
    titleFont: CoachFonts.headingSemiBold,
    bodyFont: CoachFonts.body,
    semiBoldFont: CoachFonts.bodySemiBold,
    radius: 16,
  },
  editorial: {
    surface: OB.glass,
    border: OB.line,
    borderStrong: OB.lineStrong,
    iconTile: OB.accentSoft,
    fg: OB.fg,
    muted: OB.muted,
    faint: OB.faint,
    accent: OB.accent,
    onAccent: OB.onAccent,
    titleFont: OBFonts.sansSemiBold,
    bodyFont: OBFonts.sans,
    semiBoldFont: OBFonts.sansSemiBold,
    radius: OBRadius.l,
  },
} as const;

function PermissionCard({ item, t }: { item: PermissionItem; t: (typeof TOKENS)[Variant] }) {
  const [state, setState] = useState<PermState>('ask');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    item.getState().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [item]);

  const onAllow = useCallback(async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (state === 'blocked') {
      openAppSettings();
      return;
    }
    setBusy(true);
    const next = await item.request();
    setBusy(false);
    setState(next);
    if (next === 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [busy, state, item]);

  return (
    <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
      <View style={[s.iconTile, { backgroundColor: t.iconTile }]}>
        <Ionicons name={item.icon} size={22} color={t.accent} />
      </View>
      <View style={s.copy}>
        <Text style={[s.cardTitle, { fontFamily: t.titleFont, color: t.fg }]} maxFontSizeMultiplier={1.4}>{item.title}</Text>
        <Text style={[s.cardWhy, { fontFamily: t.bodyFont, color: t.muted }]} maxFontSizeMultiplier={1.4}>{item.why}</Text>
      </View>
      {state === 'granted' ? (
        <View style={[s.onChip, { backgroundColor: t.accent }]} accessibilityLabel={`${item.title}: on`}>
          <Ionicons name="checkmark" size={14} color={t.onAccent} />
          <Text style={[s.onChipText, { fontFamily: t.semiBoldFont, color: t.onAccent }]} maxFontSizeMultiplier={1.2}>On</Text>
        </View>
      ) : (
        // 44pt Allow button, per the Editorial control minimum.
        <TouchableOpacity
          style={[s.allowBtn, { borderColor: t.borderStrong }]}
          onPress={onAllow}
          activeOpacity={0.85}
          disabled={busy}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={state === 'blocked' ? `Open Settings to allow ${item.title}` : `Allow ${item.title}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color={t.fg} />
          ) : (
            <Text style={[s.allowBtnText, { fontFamily: t.semiBoldFont, color: t.fg }]} maxFontSizeMultiplier={1.2}>
              {state === 'blocked' ? 'Settings' : 'Allow'}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function PermissionCards({ items, variant = 'coach' }: { items: PermissionItem[]; variant?: Variant }) {
  const t = TOKENS[variant];
  return (
    <View style={s.list}>
      {items.map((item) => <PermissionCard key={item.key} item={item} t={t} />)}
      <Text style={[s.footnote, { fontFamily: t.bodyFont, color: t.faint }]} maxFontSizeMultiplier={1.4}>
        Everything here is optional and can be changed any time in Settings.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 16,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15 },
  cardWhy: { fontSize: 12, lineHeight: 17 },
  allowBtn: {
    minWidth: 74,
    height: 44,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  allowBtnText: { fontSize: 13 },
  onChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
  },
  onChipText: { fontSize: 13 },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 4 },
});
