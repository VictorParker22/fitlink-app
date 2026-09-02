import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useAlert } from '../context/AlertContext';
import { TERMS_URL, PRIVACY_URL } from '../lib/legalLinks';

const PRIVACY_EMAIL = 'privacy@getfitlink.com';

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of terms',
    content: 'By downloading, installing, or using the FitLink app ("the app"), whether as a coach or as an athlete, you agree to be bound by these terms of service. If you do not agree, do not use the app.',
  },
  {
    title: '2. Description of service',
    content: 'FitLink connects coaches and athletes. Coaches use it to manage athletes, build training passes, create workouts and meal plans, run live and on-demand classes, message athletes, review check-ins, and collect payments. Athletes use it to follow their coach\'s programming, log training and check-ins, message their coach, join classes, and pay for coaching or an optional subscription.',
  },
  {
    title: '3. User accounts',
    content: 'You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information when creating an account. You may not share your account with others.',
  },
  {
    title: '4. Health disclaimer',
    content: 'FitLink is not a medical provider and nothing in the app is medical advice. Athletes should consult a qualified healthcare professional before beginning any new exercise or nutrition program. Coaches are responsible for the programming they deliver to their athletes.',
  },
  {
    title: '5. Payments, fees, subscriptions & payouts',
    content: 'Coaching payments from athletes are processed by Stripe. FitLink deducts a platform fee from those payments before payout to the coach\'s connected Stripe account; the current fee is shown in the app before a coach sets a price. Optional subscriptions (the athlete pass, solo mode and Coach Elite) are billed through your App Store or Google Play account, renew automatically unless cancelled at least 24 hours before the end of the current period, and are subject to the store\'s terms. Fees are non-refundable unless required by law.',
  },
  {
    title: '6. Your content',
    content: 'Workouts, meal plans, classes, progress photos, check-ins and other content you create remain yours. By publishing content in the app, you grant FitLink a license to host it and deliver it to the people you share it with. You must have the rights to any content you upload.',
  },
  {
    title: '7. Acceptable use',
    content: 'You agree not to misuse the service. You will not send spam, store illegal content, or harass other users.',
  },
  {
    title: '8. Intellectual property',
    content: 'The FitLink app, including its design, code, and branding, is owned by FitLink. You may not copy, modify, or redistribute the app.',
  },
  {
    title: '9. Limitation of liability',
    content: 'FitLink is provided "as is" without warranties. To the extent permitted by law, we are not liable for injuries, damages, or losses arising from use of the service or from programs delivered through it.',
  },
  {
    title: '10. Changes to terms',
    content: 'We may modify these terms at any time. Continued use of the app after changes take effect constitutes acceptance of the modified terms.',
  },
];

const PRIVACY_SECTIONS = [
  {
    title: 'Information we collect',
    content: 'We collect the information you provide (name, email, profile details, content you create), health and fitness data you choose to share (workouts, check-ins, and, if you connect it, Apple Health or Health Connect data), usage data (sessions, classes, messages you send through the app), and basic device information (OS and app version). If you use contact matching to invite people, your contacts stay on your device and are never uploaded.',
  },
  {
    title: 'How we use your data',
    content: 'Your data is used to provide the service, connect coaches and athletes, process payments, improve the app, send service-related notifications, and provide customer support. We do not sell your personal data.',
  },
  {
    title: 'Payments',
    content: 'Payment processing is handled by Stripe (coaching payments and payouts) and by your App Store or Google Play account via RevenueCat (subscriptions). FitLink does not store your card or bank details.',
  },
  {
    title: 'Data storage & security',
    content: 'Data is stored on Supabase infrastructure and encrypted in transit over HTTPS. Row-level security keeps each account\'s data isolated.',
  },
  {
    title: 'Your rights',
    content: 'You can request a copy of your data or delete your account at any time. Account deletion is available from your profile, or you can contact us.',
  },
];

export default function TermsPrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showAlert } = useAlert();

  // The hosted documents are the canonical versions; the text below is a
  // summary. If the browser refuses the URL the summary is already on screen.
  const openHosted = (url: string) => {
    Linking.openURL(url).catch(() =>
      showAlert({ type: 'info', title: 'Could not open the browser', message: 'The summary below covers the same terms.' })
    );
  };

  const openPrivacyEmail = () => {
    Linking.openURL(`mailto:${PRIVACY_EMAIL}`).catch(() =>
      showAlert({ type: 'info', title: 'No mail app found', message: `Email us at ${PRIVACY_EMAIL}.` })
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Terms & privacy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={s.hostedRow}>
          <TouchableOpacity style={s.hostedBtn} activeOpacity={0.8} onPress={() => openHosted(TERMS_URL)} accessibilityRole="link" accessibilityLabel="Open full terms of use">
            <Ionicons name="document-text-outline" size={18} color={CoachColors.textPrimary} />
            <Text style={s.hostedText} maxFontSizeMultiplier={1.3}>Terms of use</Text>
            <Ionicons name="open-outline" size={14} color={CoachColors.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity style={s.hostedBtn} activeOpacity={0.8} onPress={() => openHosted(PRIVACY_URL)} accessibilityRole="link" accessibilityLabel="Open full privacy policy">
            <Ionicons name="shield-checkmark-outline" size={18} color={CoachColors.textPrimary} />
            <Text style={s.hostedText} maxFontSizeMultiplier={1.3}>Privacy policy</Text>
            <Ionicons name="open-outline" size={14} color={CoachColors.textFaint} />
          </TouchableOpacity>
        </View>
        <Text style={s.summaryNote}>
          The full documents live on the web. What follows is a summary.
        </Text>

        <Text style={s.pageTitle}>Terms of service</Text>
        <Text style={s.lastUpdated}>LAST UPDATED: SEPTEMBER 2026</Text>

        {TERMS_SECTIONS.map((section) => (
          <View key={section.title} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <Text style={s.sectionContent}>{section.content}</Text>
          </View>
        ))}

        <View style={s.divider} />

        <Text style={s.pageTitle}>Privacy policy</Text>

        {PRIVACY_SECTIONS.map((section) => (
          <View key={section.title} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <Text style={s.sectionContent}>{section.content}</Text>
          </View>
        ))}

        <TouchableOpacity style={s.contactCard} activeOpacity={0.7} onPress={openPrivacyEmail}>
          <Ionicons name="mail-outline" size={20} color={CoachColors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.contactTitle}>Privacy questions?</Text>
            <Text style={s.contactEmail}>{PRIVACY_EMAIL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={CoachColors.textFaint} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textPrimary },
  // paddingBottom is applied inline from the real bottom inset (pushed route: no tab bar).
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  hostedRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  hostedBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 12, minHeight: 44,
  },
  hostedText: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  summaryNote: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint, lineHeight: 19, marginBottom: 24,
  },

  pageTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary,
    letterSpacing: -0.3, marginBottom: 6,
  },
  lastUpdated: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.textFaint,
    letterSpacing: 0.8, marginBottom: 22,
  },

  section: { marginBottom: 22 },
  sectionTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary, marginBottom: 6 },
  sectionContent: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary, lineHeight: 23.5 },

  divider: { height: 1, backgroundColor: CoachColors.borderMuted, marginVertical: 26 },

  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 16, paddingVertical: 14, marginTop: 6,
  },
  contactTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  contactEmail: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary, marginTop: 1 },
});
