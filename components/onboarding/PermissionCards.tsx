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
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { openAppSettings, type PermState } from '../../lib/permissions';

export interface PermissionItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  why: string;
  getState: () => Promise<PermState>;
  request: () => Promise<PermState>;
}

function PermissionCard({ item }: { item: PermissionItem }) {
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
    <View style={s.card}>
      <View style={s.iconTile}>
        <Ionicons name={item.icon} size={22} color={CoachColors.accent} />
      </View>
      <View style={s.copy}>
        <Text style={s.cardTitle} maxFontSizeMultiplier={1.4}>{item.title}</Text>
        <Text style={s.cardWhy} maxFontSizeMultiplier={1.4}>{item.why}</Text>
      </View>
      {state === 'granted' ? (
        <View style={s.onChip} accessibilityLabel={`${item.title}: on`}>
          <Ionicons name="checkmark" size={14} color={CoachColors.onAccent} />
          <Text style={s.onChipText} maxFontSizeMultiplier={1.2}>On</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={s.allowBtn}
          onPress={onAllow}
          activeOpacity={0.85}
          disabled={busy}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={state === 'blocked' ? `Open Settings to allow ${item.title}` : `Allow ${item.title}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color={CoachColors.textPrimary} />
          ) : (
            <Text style={s.allowBtnText} maxFontSizeMultiplier={1.2}>
              {state === 'blocked' ? 'Settings' : 'Allow'}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function PermissionCards({ items }: { items: PermissionItem[] }) {
  return (
    <View style={s.list}>
      {items.map((item) => <PermissionCard key={item.key} item={item} />)}
      <Text style={s.footnote} maxFontSizeMultiplier={1.4}>
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
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: 16,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSofter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  cardTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  cardWhy: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: CoachColors.textMuted,
  },
  allowBtn: {
    minWidth: 74,
    height: 36,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  allowBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
  },
  onChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 12,
  },
  onChipText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    color: CoachColors.onAccent,
  },
  footnote: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textFaint,
    textAlign: 'center',
    marginTop: 4,
  },
});
