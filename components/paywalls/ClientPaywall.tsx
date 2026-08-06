/**
 * ClientPaywall — Subscription screen for clients
 *
 * Shown when a client tries to access a gated feature without an active
 * "client_premium" entitlement. Presents monthly and annual packages with
 * a clear value proposition, feature list, and restore link.
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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { PACKAGE_TYPE, PurchasesPackage } from 'react-native-purchases';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { FontFamily } from '../../constants/theme';

// ─── Feature list ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: 'barbell-outline',    color: '#FF6B35', text: 'Unlimited workout access' },
  { icon: 'nutrition-outline',  color: '#22C55E', text: 'Personalised nutrition plans' },
  { icon: 'heart-outline',      color: '#FF6B35', text: 'Apple Health & Google Fit sync' },
  { icon: 'chatbubble-outline', color: '#5B7FFF', text: 'Direct messaging with your coach' },
  { icon: 'trending-up',        color: '#A855F7', text: 'Progress tracking & analytics' },
  { icon: 'checkmark-circle',   color: '#22C55E', text: 'Daily habit tracker & streaks' },
  { icon: 'calendar-outline',   color: '#FFD700', text: 'Session booking & scheduling' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClientPaywallProps {
  visible: boolean;
  onDismiss: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientPaywall({ visible, onDismiss }: ClientPaywallProps) {
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
      Alert.alert('Purchase Failed', error);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const { success, restored, error } = await restorePurchases();
    setRestoring(false);
    if (restored) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Restored! 🎉', 'Your subscription has been restored.', [
        { text: 'Continue', onPress: onDismiss },
      ]);
    } else if (success) {
      Alert.alert('Nothing to Restore', 'No previous purchases found for this account.');
    } else {
      Alert.alert('Error', error || 'Could not restore purchases.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.closeBtn} onPress={onDismiss}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Hero */}
          <LinearGradient
            colors={['rgba(91,127,255,0.2)', 'transparent']}
            style={s.heroBg}
          />
          <View style={s.hero}>
            <View style={s.heroIconWrap}>
              <Text style={{ fontSize: 40 }}>⚡</Text>
            </View>
            <Text style={s.heroTag}>FITLINK PREMIUM</Text>
            <Text style={s.heroTitle}>Train smarter.{'\n'}Every day.</Text>
            <Text style={s.heroSub}>
              Everything you need to hit your goals — on one platform with your coach.
            </Text>
          </View>

          {/* Feature list */}
          <View style={s.features}>
            {FEATURES.map((f, i) => (
              <View key={i} style={s.featureRow}>
                <View style={[s.featureIcon, { backgroundColor: `${f.color}18` }]}>
                  <Ionicons name={f.icon as any} size={18} color={f.color} />
                </View>
                <Text style={s.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          {/* Plan toggle */}
          {isLoading ? (
            <ActivityIndicator color="rgba(255,255,255,0.4)" style={{ marginVertical: 24 }} />
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
                      <Text style={s.saveBadgeText}>SAVE {annualSavings}%</Text>
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
              >
                <LinearGradient
                  colors={['#5B7FFF', '#4A6FEF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.ctaGradient}
                >
                  {purchasing ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={18} color="#FFF" />
                      <Text style={s.ctaText}>
                        Start {selectedType === 'annual' ? 'Annual' : 'Monthly'} Plan
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Legal + restore */}
              <Text style={s.legal}>
                Subscriptions auto-renew unless cancelled at least 24 hours before the end of
                the current period. Manage in your device Settings.
              </Text>

              <TouchableOpacity
                style={s.restoreBtn}
                onPress={handleRestore}
                disabled={restoring}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
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
  container: { flex: 1, backgroundColor: '#0A0A0C' },
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  heroBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },

  // Hero
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 32 },
  heroIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(91,127,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(91,127,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#5B7FFF',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -1,
    lineHeight: 38,
    marginBottom: 12,
  },
  heroSub: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 22,
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
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },

  // Plan toggle
  planToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  planOption: {
    flex: 1,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  planOptionSelected: {
    borderColor: '#5B7FFF',
    backgroundColor: 'rgba(91,127,255,0.1)',
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#22C55E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  saveBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: '#000',
    letterSpacing: 0.5,
  },
  planLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planLabelSelected: { color: '#5B7FFF' },
  planPrice: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: -0.5,
  },
  planPriceSelected: { color: '#FFFFFF' },
  planPeriod: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  planPeriodSelected: { color: 'rgba(255,255,255,0.5)' },

  // CTA
  ctaBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 16 },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
  },
  ctaText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },

  // Legal
  legal: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  restoreBtn: { alignItems: 'center', paddingVertical: 10 },
  restoreText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textDecorationLine: 'underline',
  },
});
