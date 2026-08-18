/**
 * ClientPaywall — the athlete pass, sold honestly.
 *
 * client_premium gates exactly one thing: playback of paid on-demand
 * classes. So that is exactly what this screen sells. The old version
 * advertised messaging, analytics, habits and booking — all of which are
 * free — which was an App Store 2.3.1 risk and a refund generator. If a
 * feature is ever gated behind premium later, its line is added HERE in
 * the same commit as the gate, never before.
 *
 * The hero is the class the athlete just tried to open (when the caller
 * passes it) — the strongest sales asset we own is the specific thing they
 * wanted ten seconds ago, not an abstract promise. Real data or omitted:
 * no class context, no fake montage — the copy carries the screen alone.
 *
 * onPurchased exists apart from onDismiss so the caller can RESUME the
 * blocked class immediately — the reward for paying is the thing they
 * wanted, not a success screen.
 *
 * Prices render exclusively from the offering's priceString. No fallback
 * numbers anywhere: a price we invented is a fabricated metric in a suit.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
// PACKAGE_TYPE is a runtime enum; PurchasesPackage is a type. Both come from
// the platform-split module — the real SDK cannot be imported on web.
import { PACKAGE_TYPE } from '../../lib/revenuecat-sdk';
import type { PurchasesPackage } from '../../lib/revenuecat-sdk';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

// ─── What client_premium actually unlocks — nothing else may be listed ───────

const FEATURES = [
  { icon: 'play-circle-outline', text: 'Every paid class, from every coach on FitLink' },
  { icon: 'sparkles-outline',    text: 'New classes the moment coaches publish them' },
  { icon: 'settings-outline',    text: 'Cancel anytime in your device settings' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClientPaywallProps {
  visible: boolean;
  onDismiss: () => void;
  /** Fires after a confirmed purchase, so the caller can resume the class. */
  onPurchased?: () => void;
  /** The class that triggered this — its real thumbnail/title/coach. */
  blockedClass?: { title: string; coachName?: string | null; thumbnailUrl?: string | null } | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientPaywall({ visible, onDismiss, onPurchased, blockedClass }: ClientPaywallProps) {
  // A Modal inherits no safe area — the scroll supplies its own bottom clearance.
  const insets = useSafeAreaInsets();
  const { offerings, purchasePackage, restorePurchases, isLoading } = useRevenueCat();
  const [selectedType, setSelectedType] = useState<'annual' | 'monthly'>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Find packages from offering
  const monthlyPkg = offerings?.availablePackages.find(
    (p) => p.packageType === PACKAGE_TYPE.MONTHLY
  );
  const annualPkg = offerings?.availablePackages.find(
    (p) => p.packageType === PACKAGE_TYPE.ANNUAL
  );

  const selectedPkg: PurchasesPackage | undefined =
    selectedType === 'annual' ? annualPkg : monthlyPkg;

  // Calculate annual savings vs monthly
  const annualSavings = (() => {
    if (!monthlyPkg || !annualPkg) return null;
    const monthlyPrice = monthlyPkg.product.price;
    const annualEquiv = annualPkg.product.price / 12;
    const savePct = Math.round(((monthlyPrice - annualEquiv) / monthlyPrice) * 100);
    return savePct > 0 ? savePct : null;
  })();

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    setPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { success, error } = await purchasePackage(selectedPkg);
    setPurchasing(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Purchased > dismissed: the caller resumes the blocked class.
      if (onPurchased) onPurchased();
      else onDismiss();
    } else if (error) {
      // A cancelled purchase returns no error and lands here silently.
      Alert.alert('Purchase failed', error);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const { success, restored, error } = await restorePurchases();
    setRestoring(false);
    if (restored) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Restored', 'Your subscription has been restored.', [
        { text: 'Continue', onPress: onDismiss },
      ]);
    } else if (success) {
      Alert.alert('Nothing to restore', 'No previous purchases found for this account.');
    } else {
      Alert.alert('Error', error || 'Could not restore purchases.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity hitSlop={6} style={s.closeBtn} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close paywall">
            <Ionicons name="close" size={22} color={CoachColors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Hero — the class they were just denied, when we have it. */}
          <View style={s.hero}>
            {blockedClass?.thumbnailUrl ? (
              <View style={s.classCard}>
                <Image source={{ uri: blockedClass.thumbnailUrl }} style={s.classThumb} resizeMode="cover" />
                <View style={s.classScrim} />
                <View style={s.lockChip}>
                  <Ionicons name="lock-closed" size={12} color={CoachColors.onAccent} />
                </View>
                <View style={s.classMeta}>
                  <Text style={s.classTitle} numberOfLines={2}>{blockedClass.title}</Text>
                  {blockedClass.coachName ? (
                    <Text style={s.classCoach} numberOfLines={1}>with {blockedClass.coachName}</Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={s.heroIconWrap}>
                <Ionicons name="play-circle" size={36} color={CoachColors.accent} />
              </View>
            )}
            <Text style={s.heroTag}>Athlete pass</Text>
            <Text style={s.heroTitle}>Every class,{'\n'}from every coach.</Text>
            <Text style={s.heroSub}>
              One pass unlocks on-demand classes across FitLink
              {blockedClass ? ' — starting with this one.' : '.'}
            </Text>
          </View>

          {/* Feature list */}
          <View style={s.features}>
            {FEATURES.map((f, i) => (
              <View key={i} style={s.featureRow}>
                <View style={s.featureIcon}>
                  <Ionicons name={f.icon as any} size={20} color={CoachColors.accent} />
                </View>
                <Text style={s.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          {/* Plan toggle.
              On web there is no store: RevenueCat purchases are native-only,
              so offerings are null and every price would be a placeholder.
              Say so instead of rendering a dead button under empty prices. */}
          {Platform.OS === 'web' ? (
            <View style={s.webNote}>
              <Text style={s.webNoteText}>
                Subscriptions are managed in the FitLink app. Open it on your phone to start or
                restore your pass.
              </Text>
            </View>
          ) : isLoading ? (
            <ActivityIndicator color={CoachColors.textMuted} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <View style={s.planToggle}>
                {/* Annual */}
                <TouchableOpacity
                  style={[s.planOption, selectedType === 'annual' && s.planOptionSelected]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedType('annual'); }}
                  activeOpacity={0.85}
                >
                  {annualSavings && (
                    <View style={s.saveBadge}>
                      <Text style={s.saveBadgeText}>Save {annualSavings}%</Text>
                    </View>
                  )}
                  <Text style={[s.planLabel, selectedType === 'annual' && s.planLabelSelected]}>
                    Annual
                  </Text>
                  <Text style={[s.planPrice, selectedType === 'annual' && s.planPriceSelected]}>
                    {annualPkg?.product.priceString ?? '—'}
                  </Text>
                  <Text style={[s.planPeriod, selectedType === 'annual' && s.planPeriodSelected]}>
                    per year
                  </Text>
                </TouchableOpacity>

                {/* Monthly */}
                <TouchableOpacity
                  style={[s.planOption, selectedType === 'monthly' && s.planOptionSelected]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedType('monthly'); }}
                  activeOpacity={0.85}
                >
                  <Text style={[s.planLabel, selectedType === 'monthly' && s.planLabelSelected]}>
                    Monthly
                  </Text>
                  <Text style={[s.planPrice, selectedType === 'monthly' && s.planPriceSelected]}>
                    {monthlyPkg?.product.priceString ?? '—'}
                  </Text>
                  <Text style={[s.planPeriod, selectedType === 'monthly' && s.planPeriodSelected]}>
                    per month
                  </Text>
                </TouchableOpacity>
              </View>

              {/* CTA */}
              <TouchableOpacity
                style={[s.ctaBtn, (!selectedPkg || purchasing) && { opacity: 0.6 }]}
                onPress={handlePurchase}
                disabled={!selectedPkg || purchasing}
                activeOpacity={0.88}
                accessibilityRole="button"
              >
                {purchasing ? (
                  <ActivityIndicator size="small" color={CoachColors.onAccent} />
                ) : (
                  <Text style={s.ctaText}>
                    Start {selectedType === 'annual' ? 'annual' : 'monthly'} plan
                  </Text>
                )}
              </TouchableOpacity>

              {/* Legal + restore */}
              <Text style={s.legal}>
                Subscriptions auto-renew unless cancelled at least 24 hours before the end of
                the current period. Manage in your device Settings.
              </Text>

              <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                style={s.restoreBtn}
                onPress={handleRestore}
                disabled={restoring}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={CoachColors.textMuted} />
                ) : (
                  <Text style={s.restoreText}>Restore purchases</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // paddingBottom is applied inline from the real bottom inset (pageSheet Modal: no safe area inherited).
  scroll: { paddingHorizontal: 24 },

  // Web: no store, no prices, no purchase button — just the truth.
  webNote: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  webNoteText: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: CoachColors.textSecondary,
    textAlign: 'center',
  },

  // Hero
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 32 },
  classCard: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: CoachColors.surface,
    marginBottom: 20,
  },
  classThumb: { ...StyleSheet.absoluteFillObject },
  classScrim: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 84,
    backgroundColor: 'rgba(16,18,16,0.72)',
  },
  lockChip: {
    position: 'absolute', top: 10, right: 10,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  classMeta: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  classTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 17,
    color: CoachColors.textPrimary, lineHeight: 21,
  },
  classCoach: {
    fontFamily: CoachFonts.bodyMedium, fontSize: 13,
    color: 'rgba(255,255,255,0.78)', marginTop: 2,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 33.5,
    color: CoachColors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 40.5,
    marginBottom: 12,
  },
  heroSub: {
    fontFamily: CoachFonts.body,
    fontSize: 17,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    lineHeight: 24.5,
  },

  // Features
  features: { gap: 10, marginBottom: 28 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: CoachColors.accentSofter,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },

  // Plan toggle
  planToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  planOption: {
    flex: 1,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  planOptionSelected: {
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSofter,
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  saveBadgeText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
  planLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planLabelSelected: { color: CoachColors.accent },
  planPrice: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 27,
    color: CoachColors.textMuted,
    letterSpacing: -0.5,
  },
  planPriceSelected: { color: CoachColors.textPrimary },
  planPeriod: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textFaint,
  },
  planPeriodSelected: { color: CoachColors.textSecondary },

  // CTA
  ctaBtn: {
    borderRadius: 14,
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    marginBottom: 16,
  },
  ctaText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 18,
    color: CoachColors.onAccent,
    letterSpacing: -0.3,
  },

  // Legal
  legal: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  restoreBtn: { alignItems: 'center', paddingVertical: 10 },
  restoreText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
    textDecorationLine: 'underline',
  },
});
