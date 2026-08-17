/**
 * ClientPaywall — Subscription screen for clients
 *
 * Shown when a client tries to access a gated feature without an active
 * "client_premium" entitlement. Presents monthly and annual packages with
 * a clear value proposition, feature list, and restore link.
 *
 * Styled with the shared CoachColors/CoachFonts tokens (dark, single lime
 * accent) so gated content matches the rebuilt athlete surface.
 *
 * Usage:
 *   const { isClientPremium } = useRevenueCat();
 *   if (!isClientPremium) return <ClientPaywall onDismiss={...} />;
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PACKAGE_TYPE, PurchasesPackage } from 'react-native-purchases';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

// ─── Feature list ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: 'barbell-outline',    text: 'Unlimited workout access' },
  { icon: 'nutrition-outline',  text: 'Personalised nutrition plans' },
  { icon: 'heart-outline',      text: 'Apple Health and Google Fit sync' },
  { icon: 'chatbubble-outline', text: 'Direct messaging with your coach' },
  // Outline like the rest of the list — these two were the only filled glyphs.
  { icon: 'trending-up-outline',      text: 'Progress tracking and analytics' },
  { icon: 'checkmark-circle-outline', text: 'Daily habit tracker and streaks' },
  { icon: 'calendar-outline',   text: 'Session booking and scheduling' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClientPaywallProps {
  visible: boolean;
  onDismiss: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientPaywall({ visible, onDismiss }: ClientPaywallProps) {
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
      onDismiss();
    } else if (error) {
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
          {/* Hero */}
          <View style={s.hero}>
            <View style={s.heroIconWrap}>
              <Ionicons name="flash" size={36} color={CoachColors.accent} />
            </View>
            <Text style={s.heroTag}>FitLink premium</Text>
            <Text style={s.heroTitle}>Train smarter.{'\n'}Every day.</Text>
            <Text style={s.heroSub}>
              Everything you need to hit your goals — on one platform with your coach.
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

          {/* Plan toggle */}
          {isLoading ? (
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

  // Hero
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 32 },
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
