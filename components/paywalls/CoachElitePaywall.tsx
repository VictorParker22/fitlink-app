/**
 * CoachElitePaywall — Elite tier upgrade screen for coaches
 *
 * Shown when a coach tries to access Elite-gated features.
 * Different value proposition than the client paywall — focused on
 * business growth, client capacity, and advanced analytics.
 *
 * Usage:
 *   const { isCoachElite } = useRevenueCat();
 *   if (!isCoachElite) return <CoachElitePaywall visible onDismiss={...} />;
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

// ─── Elite features ───────────────────────────────────────────────────────────

const ELITE_FEATURES = [
  { icon: 'people',              color: '#5B7FFF', text: 'Unlimited client roster',       sub: 'Starter: max 10 clients' },
  { icon: 'analytics',           color: '#22C55E', text: 'Advanced revenue analytics',    sub: 'MRR, churn, lifetime value' },
  { icon: 'sparkles',            color: '#FFD700', text: 'AI Coach Assistant',             sub: 'GPT-powered program builder' },
  { icon: 'videocam',            color: '#A855F7', text: 'Unlimited live class hosting',  sub: 'Starter: 2 classes/mo' },
  { icon: 'ribbon',              color: '#FF6B35', text: 'Custom branding & profile page',sub: 'Your logo, your colors' },
  { icon: 'card',                color: '#22C55E', text: 'Priority Stripe payouts',       sub: '24h vs standard 7-day' },
  { icon: 'mail',                color: '#5B7FFF', text: 'Client email campaigns',        sub: 'Weekly newsletters & promos' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface CoachElitePaywallProps {
  visible: boolean;
  onDismiss: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoachElitePaywall({ visible, onDismiss }: CoachElitePaywallProps) {
  const { offerings, purchasePackage, restorePurchases, isLoading } = useRevenueCat();
  const [selectedType, setSelectedType] = useState<'annual' | 'monthly'>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Filter packages for the coach_elite offering
  // RC will serve these from the "coach_elite" offering or fall back to current
  const monthlyPkg = offerings?.availablePackages.find(
    (p) => p.packageType === PACKAGE_TYPE.MONTHLY
  );
  const annualPkg = offerings?.availablePackages.find(
    (p) => p.packageType === PACKAGE_TYPE.ANNUAL
  );

  const selectedPkg: PurchasesPackage | undefined =
    selectedType === 'annual' ? annualPkg : monthlyPkg;

  const annualSavings = (() => {
    if (!monthlyPkg || !annualPkg) return null;
    const monthly = monthlyPkg.product.price;
    const annualPerMonth = annualPkg.product.price / 12;
    const pct = Math.round(((monthly - annualPerMonth) / monthly) * 100);
    return pct > 0 ? pct : null;
  })();

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    setPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { success, error } = await purchasePackage(selectedPkg);
    setPurchasing(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        '🎉 Welcome to Elite!',
        'Your Elite features are now unlocked. Grow your business.',
        [{ text: "Let's go", onPress: onDismiss }]
      );
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
      Alert.alert('Restored! 🎉', 'Your Elite subscription has been restored.', [
        { text: 'Continue', onPress: onDismiss },
      ]);
    } else if (success) {
      Alert.alert('Nothing to Restore', 'No previous Elite purchases found.');
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
          {/* Hero gradient */}
          <LinearGradient
            colors={['rgba(255,107,53,0.18)', 'transparent']}
            style={s.heroBg}
          />

          {/* Hero */}
          <View style={s.hero}>
            <View style={s.heroIconWrap}>
              <Text style={{ fontSize: 40 }}>🏆</Text>
            </View>
            <Text style={s.heroTag}>FITLINK ELITE</Text>
            <Text style={s.heroTitle}>Scale your{'\n'}coaching business.</Text>
            <Text style={s.heroSub}>
              Remove every limit. Unlock tools built for coaches who are serious about growth.
            </Text>
          </View>

          {/* Comparison row */}
          <View style={s.compareRow}>
            <View style={s.compareCell}>
              <Text style={s.compareLabel}>STARTER</Text>
              <Text style={s.comparePrice}>Free</Text>
              <Text style={s.compareSub}>10 clients · 2 live classes</Text>
            </View>
            <View style={s.compareArrow}>
              <Ionicons name="arrow-forward" size={20} color="#FF6B35" />
            </View>
            <View style={[s.compareCell, s.compareCellElite]}>
              <Text style={[s.compareLabel, { color: '#FF6B35' }]}>ELITE</Text>
              <Text style={[s.comparePrice, { color: '#FF6B35' }]}>Unlimited</Text>
              <Text style={s.compareSub}>No caps · Full tools</Text>
            </View>
          </View>

          {/* Feature list */}
          <View style={s.features}>
            {ELITE_FEATURES.map((f, i) => (
              <View key={i} style={s.featureRow}>
                <View style={[s.featureIcon, { backgroundColor: `${f.color}18` }]}>
                  <Ionicons name={f.icon as any} size={18} color={f.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureText}>{f.text}</Text>
                  <Text style={s.featureSub}>{f.sub}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Plan toggle */}
          {isLoading ? (
            <ActivityIndicator color="rgba(255,255,255,0.4)" style={{ marginVertical: 24 }} />
          ) : (
            <>
              <View style={s.planToggle}>
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
                  <Text style={[s.planLabel, selectedType === 'annual' && s.planLabelSelected]}>Annual</Text>
                  <Text style={[s.planPrice, selectedType === 'annual' && s.planPriceSelected]}>
                    {annualPkg?.product.priceString ?? '—'}
                  </Text>
                  <Text style={[s.planPeriod, selectedType === 'annual' && s.planPeriodSelected]}>per year</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.planOption, selectedType === 'monthly' && s.planOptionSelected]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedType('monthly'); }}
                  activeOpacity={0.85}
                >
                  <Text style={[s.planLabel, selectedType === 'monthly' && s.planLabelSelected]}>Monthly</Text>
                  <Text style={[s.planPrice, selectedType === 'monthly' && s.planPriceSelected]}>
                    {monthlyPkg?.product.priceString ?? '—'}
                  </Text>
                  <Text style={[s.planPeriod, selectedType === 'monthly' && s.planPeriodSelected]}>per month</Text>
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
                  colors={['#FF6B35', '#FF4500']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.ctaGradient}
                >
                  {purchasing ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="trophy" size={18} color="#FFF" />
                      <Text style={s.ctaText}>
                        Upgrade to Elite {selectedType === 'annual' ? '(Annual)' : '(Monthly)'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={s.legal}>
                Subscriptions auto-renew unless cancelled at least 24 hours before renewal.
                Manage in your device Settings.
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
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 16 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  heroBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },

  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 28 },
  heroIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(255,107,53,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroTag: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: '#FF6B35',
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8,
  },
  heroTitle: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 32, color: '#FFFFFF',
    textAlign: 'center', letterSpacing: -1, lineHeight: 38, marginBottom: 12,
  },
  heroSub: {
    fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.45)',
    textAlign: 'center', lineHeight: 22,
  },

  // Compare row
  compareRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#111113', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#1C1C1E', marginBottom: 24,
  },
  compareCell: { flex: 1, alignItems: 'center', gap: 3 },
  compareCellElite: {
    backgroundColor: 'rgba(255,107,53,0.08)',
    borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.2)',
  },
  compareArrow: { paddingHorizontal: 4 },
  compareLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  comparePrice: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 18, color: '#FFFFFF', letterSpacing: -0.3,
  },
  compareSub: { fontFamily: FontFamily.body, fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },

  features: { gap: 12, marginBottom: 28 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  featureIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  featureText: { fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: '#FFFFFF', letterSpacing: -0.2 },
  featureSub: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 },

  planToggle: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  planOption: {
    flex: 1, backgroundColor: '#111113', borderWidth: 1, borderColor: '#1C1C1E',
    borderRadius: 14, padding: 16, alignItems: 'center', gap: 4, position: 'relative',
  },
  planOptionSelected: { borderColor: '#FF6B35', backgroundColor: 'rgba(255,107,53,0.1)' },
  saveBadge: {
    position: 'absolute', top: -10,
    backgroundColor: '#22C55E', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  saveBadgeText: { fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: '#000', letterSpacing: 0.5 },
  planLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textTransform: 'uppercase' },
  planLabelSelected: { color: '#FF6B35' },
  planPrice: { fontFamily: FontFamily.headingExtraBold, fontSize: 24, color: 'rgba(255,255,255,0.5)', letterSpacing: -0.5 },
  planPriceSelected: { color: '#FFFFFF' },
  planPeriod: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  planPeriodSelected: { color: 'rgba(255,255,255,0.5)' },

  ctaBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 16 },
  ctaGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54 },
  ctaText: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: '#FFFFFF', letterSpacing: -0.3 },

  legal: {
    fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.25)',
    textAlign: 'center', lineHeight: 16, marginBottom: 12,
  },
  restoreBtn: { alignItems: 'center', paddingVertical: 10 },
  restoreText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecorationLine: 'underline' },
});
