/**
 * PaywallLegal — the footer every paywall must carry.
 *
 * App Store Review 3.1.2 requires an auto-renewable subscription screen to
 * state the renewal mechanics and link to functional terms of use and
 * privacy policy. Three paywalls (athlete pass, solo, coach Elite) each
 * previously had their own partial version or none at all; this is the one
 * copy of that prose, so the wording cannot drift between screens.
 *
 * Links open the hosted documents in the browser. If the OS refuses the URL
 * (no browser, a restricted profile) we fall back to the in-app summary at
 * /terms-privacy rather than failing silently — a legal link that does
 * nothing on tap is exactly what a reviewer tests for.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { TERMS_URL, PRIVACY_URL } from '../../lib/legalLinks';

const DISCLOSURE =
  'Payment is charged to your App Store or Google Play account at confirmation. ' +
  'The subscription renews automatically at the same price unless cancelled at least ' +
  '24 hours before the end of the current period. Manage or cancel in your store account settings.';

interface PaywallLegalProps {
  /** Extra top spacing when the footer sits under a CTA block. */
  style?: object;
}

export default function PaywallLegal({ style }: PaywallLegalProps) {
  const router = useRouter();

  const open = (url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url).catch(() => {
      // Hosted page unreachable from this device: show the in-app summary.
      router.push('/terms-privacy' as any);
    });
  };

  return (
    <View style={[s.wrap, style]}>
      <Text style={s.disclosure} maxFontSizeMultiplier={1.4}>{DISCLOSURE}</Text>
      <View style={s.links}>
        <TouchableOpacity
          onPress={() => open(TERMS_URL)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel="Terms of use"
        >
          <Text style={s.link} maxFontSizeMultiplier={1.4}>Terms of use</Text>
        </TouchableOpacity>
        <Text style={s.dot} maxFontSizeMultiplier={1.4}>·</Text>
        <TouchableOpacity
          onPress={() => open(PRIVACY_URL)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel="Privacy policy"
        >
          <Text style={s.link} maxFontSizeMultiplier={1.4}>Privacy policy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  disclosure: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: CoachColors.textFaint,
    textAlign: 'center',
  },
  links: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  link: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12,
    color: CoachColors.textSecondary,
    textDecorationLine: 'underline',
  },
  dot: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textFaint },
});
