import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView,
  Dimensions, Animated, Image, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

const { width: SW, height: SH } = Dimensions.get('window');

interface PayoutSetupModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PayoutSetupModal({ visible, onClose }: PayoutSetupModalProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fade animation for step transitions
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const transitionTo = (nextStep: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  const goNext = () => {
    if (step < 2) transitionTo(step + 1);
    else handleClose();
  };

  const goBack = () => {
    if (step > 0) transitionTo(step - 1);
    else handleClose();
  };

  const handleStripeConnect = async () => {
    if (!user) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        'https://qcmtaskhyhwzyoegtfpw.supabase.co/functions/v1/create-connect-account',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            trainerId: user.id,
            email: user.email,
          }),
        }
      );
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      await Linking.openURL(data.url);
      transitionTo(2);
    } catch (err: any) {
      Alert.alert('Setup error', err.message || 'Failed to start payment setup');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  // ════════════════════════════════════════════
  //  STEP 0 — Get Paid for Your Work
  // ════════════════════════════════════════════
  const renderStep0 = () => (
    <View style={styles.fullScreen}>
      {/* Background image */}
      <Image
        source={require('../../assets/images/payout-hero-bg.jpg')}
        style={styles.bgImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.5, 0.85]}
        style={styles.bgOverlay}
      />

      {/* Content */}
      <View style={[styles.screenContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        {/* Header */}
        <View style={styles.screenHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.stepIndicator}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[styles.stepDot, i === step && styles.stepDotActive]} />
            ))}
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Bottom content */}
        <View style={styles.bottomContent}>
          <View style={styles.iconBadge}>
            <Ionicons name="wallet-outline" size={28} color={CoachColors.accent} />
          </View>

          <Text style={styles.screenTag}>Payouts</Text>
          <Text style={styles.screenTitle}>Get paid for{'\n'}your work</Text>

          <Text style={styles.screenBody}>
            FitLink partners with Stripe — the world's most trusted payment platform — to handle all your payouts securely.
          </Text>

          <Text style={styles.screenBody}>
            You'll be redirected to Stripe's secure portal to connect your bank account. FitLink never sees or stores your banking details.
          </Text>

          <View style={styles.trustRow}>
            <Ionicons name="lock-closed" size={14} color={CoachColors.accent} />
            <Text style={styles.trustText}>Your financial data stays with Stripe, not us</Text>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={goNext} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={CoachColors.onAccent} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ════════════════════════════════════════════
  //  STEP 1 — Connect with Stripe
  // ════════════════════════════════════════════
  const renderStep1 = () => (
    <View style={styles.fullScreen}>
      {/* Background image */}
      <Image
        source={require('../../assets/images/stripe-connect-bg.jpg')}
        style={styles.bgImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.97)']}
        locations={[0, 0.45, 0.8]}
        style={styles.bgOverlay}
      />

      <View style={[styles.screenContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        {/* Header */}
        <View style={styles.screenHeader}>
          <TouchableOpacity onPress={goBack} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.stepIndicator}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[styles.stepDot, i === step && styles.stepDotActive]} />
            ))}
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Bottom content */}
        <View style={styles.bottomContent}>
          {/* Stripe logo */}
          <View style={styles.stripeBadgeLarge}>
            <Text style={styles.stripeBadgeLabel}>Powered by </Text>
            <Image
              source={require('../../assets/images/stripe-logo.jpg')}
              style={styles.stripeLogoImg}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.screenTitle}>Secure payment{'\n'}connection</Text>

          <Text style={styles.screenBody}>
            You'll be redirected to Stripe's secure portal to verify your identity and connect your bank account. This is a one-time setup.
          </Text>

          {/* Trust bullets */}
          <View style={styles.bulletGroup}>
            <View style={styles.bulletItem}>
              <View style={styles.bulletIcon}>
                <Ionicons name="shield-checkmark" size={16} color={CoachColors.accent} />
              </View>
              <Text style={styles.bulletText}>Bank-level 256-bit encryption</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletIcon}>
                <Ionicons name="business-outline" size={16} color={CoachColors.accent} />
              </View>
              <Text style={styles.bulletText}>Trusted by millions of businesses worldwide</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletIcon}>
                <Ionicons name="flash" size={16} color={CoachColors.accent} />
              </View>
              <Text style={styles.bulletText}>Fast payouts directly to your bank account</Text>
            </View>
            <View style={styles.bulletItem}>
              <View style={styles.bulletIcon}>
                <Ionicons name="eye-off-outline" size={16} color={CoachColors.accent} />
              </View>
              <Text style={styles.bulletText}>FitLink never sees your banking details</Text>
            </View>
          </View>

          {/* Connect button */}
          <TouchableOpacity
            style={styles.stripeConnectBtn}
            onPress={handleStripeConnect}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={CoachColors.textPrimary} />
            ) : (
              <>
                <Ionicons name="card-outline" size={18} color={CoachColors.textPrimary} style={{ marginRight: 10 }} />
                <Text style={styles.stripeConnectText}>Connect with Stripe</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipRow} onPress={goNext} activeOpacity={0.7}>
            <Text style={styles.skipText}>I'll set this up later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ════════════════════════════════════════════
  //  STEP 2 — Pricing Breakdown
  // ════════════════════════════════════════════
  const renderStep2 = () => (
    <View style={[styles.fullScreen, { backgroundColor: CoachColors.bg }]}>
      <View style={[styles.screenContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        {/* Header */}
        <View style={styles.screenHeader}>
          <TouchableOpacity onPress={goBack} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.stepIndicator}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[styles.stepDot, i === step && styles.stepDotActive]} />
            ))}
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Scrollable pricing content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.pricingScroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pricingTitle}>Pricing</Text>

          {/* No Subscription */}
          <View style={styles.dividerLabel}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Subscription fee?</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.pricingCard}>
            <Text style={styles.pricingCardTitle}>No flat subscription</Text>
            <Text style={styles.pricingCardBody}>
              We offer complete flexibility with no subscription fee. You only pay when you earn from your training sessions. Perfect for businesses with seasonal schedules or those just starting out.
            </Text>
          </View>

          {/* Payment Service Fee */}
          <View style={styles.dividerLabel}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Payment service fee?</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.pricingCard}>
            <Text style={styles.pricingCardTitle}>No payment service fee</Text>
            <Text style={styles.pricingCardBody}>
              Rest easy knowing your payments are protected by Stripe, a globally trusted platform. Simple, transparent rates with no hidden fees.
            </Text>

            <View style={styles.feeDetailRow}>
              <Text style={styles.feeLabel}>Service fee: free for you</Text>
            </View>
            <View style={styles.feeDivider} />
            <View style={styles.feeDetailRow}>
              <Text style={styles.feeSub}>Your client pays the service fee.</Text>
            </View>
            <View style={styles.feeDivider} />
            <Text style={styles.pricingCardBody}>
              Platform fee: 0% on your first $500/mo.{'\n'}Only 5% on earnings above $500/mo.
            </Text>

            {/* Powered by Stripe */}
            <View style={styles.stripeMini}>
              <Text style={styles.stripeMiniPrefix}>Powered by </Text>
              <Image
                source={require('../../assets/images/stripe-logo.jpg')}
                style={styles.stripeMiniLogo}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Cost When Not Earning */}
          <View style={styles.dividerLabel}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Cost when not earning?</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.pricingCard}>
            <View style={styles.freeHeader}>
              <View style={styles.freePill}>
                <Text style={styles.freePillText}>Free</Text>
              </View>
              <Text style={styles.freeTitle}>Always free. $0.00 / mo</Text>
            </View>
            <Text style={styles.pricingCardBody}>
              We support all forms of success — whether you're earning or giving back to your community. FitLink is completely free when offering community classes, running charity events, providing pro-bono training, or during seasonal breaks.
            </Text>
          </View>

          {/* Done button */}
          <TouchableOpacity style={styles.primaryBtn} onPress={goNext} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Got it</Text>
            <Ionicons name="rocket-outline" size={18} color={CoachColors.onAccent} style={{ marginLeft: 8 }} />
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
      </Animated.View>
    </Modal>
  );
}

// ════════════════════════════════════════════
//  STYLES — 8pt grid system
// ════════════════════════════════════════════
const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },

  // ── Background ──
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SW,
    height: SH,
  },
  bgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // ── Screen content ──
  screenContent: {
    flex: 1,
  },

  // ── Header ──
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerBtn: {
    width: 44,
    height: 44,             // Meets 44pt iOS touch target
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    gap: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CoachColors.border,
  },
  stepDotActive: {
    backgroundColor: CoachColors.accent,
    width: 28,
  },

  // ── Bottom content area ──
  bottomContent: {
    paddingHorizontal: 24,  // Standard mobile margin
  },

  // ── Icon badge ──
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,       // 8pt: icon → tag
  },

  // ── Typography ──
  screenTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.accent,
    letterSpacing: 2.5,
    marginBottom: 8,        // 8pt: tag → title
    textTransform: 'uppercase',
  },
  screenTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: 24,       // 8pt: title → body
  },
  screenBody: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textSecondary,
    lineHeight: 23,         // 1.53× for readability
    marginBottom: 16,       // 8pt: paragraph gap
  },

  // ── Trust row ──
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius.xs,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 32,       // 8pt: trust → button
  },
  trustText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    color: CoachColors.textSecondary,
    flex: 1,
  },

  // ── Primary button (accent) ──
  primaryBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: Radius.xs,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 16,
  },
  primaryBtnText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 16,
    color: CoachColors.onAccent,
    letterSpacing: 0.3,
  },

  // ── Stripe badge large ──
  stripeBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius.xs,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginBottom: 24,       // 8pt: badge → title
  },
  stripeBadgeLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
  },
  stripeLogoImg: {
    width: 48,
    height: 22,
  },

  // ── Bullet group ──
  bulletGroup: {
    gap: 16,                // 8pt: between bullets
    marginBottom: 32,       // 8pt: bullets → button
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bulletIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textSecondary,
    flex: 1,
  },

  // ── Stripe connect button ──
  stripeConnectBtn: {
    backgroundColor: '#635BFF',
    borderRadius: Radius.xs,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 16,
  },
  stripeConnectText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    letterSpacing: 0.3,
  },

  // ── Skip row ──
  skipRow: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  skipText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    textDecorationLine: 'underline',
  },

  // ── Pricing (Step 2) ──
  pricingScroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  pricingTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 34,
    color: CoachColors.textPrimary,
    marginBottom: 32,       // 8pt: title → first section
  },
  dividerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: CoachColors.borderMuted,
  },
  dividerText: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
  },
  pricingCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius.xs,
    padding: 20,            // 8pt: comfortable card padding
    marginBottom: 32,       // 8pt: card-to-section gap
  },
  pricingCardTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    marginBottom: 16,       // 8pt: title → body
  },
  pricingCardBody: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  feeDetailRow: {
    paddingVertical: 12,
  },
  feeLabel: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  feeSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
  },
  feeDivider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
  },

  // ── Stripe mini badge ──
  stripeMini: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.bg,
    borderRadius: Radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  stripeMiniPrefix: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textSecondary,
  },
  stripeMiniLogo: {
    width: 40,
    height: 18,
  },

  // ── Free section ──
  freeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  freePill: {
    backgroundColor: CoachColors.accent,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  freePillText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 10,
    color: CoachColors.onAccent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  freeTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
    flex: 1,
  },
});
