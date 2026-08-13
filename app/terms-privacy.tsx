import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const PRIVACY_EMAIL = 'privacy@getfitlink.com';

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of terms',
    content: 'By downloading, installing, or using the FitLink coach app ("the app"), you agree to be bound by these terms of service. If you do not agree, do not use the app.',
  },
  {
    title: '2. Description of service',
    content: 'FitLink provides coaches with tools to manage athletes, build training passes with seasons and tracks, create workouts and meal plans, run live and on-demand classes, message athletes, review check-ins, and collect payments.',
  },
  {
    title: '3. User accounts',
    content: 'You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information when creating an account. You may not share your account with others.',
  },
  {
    title: '4. Health disclaimer',
    content: 'FitLink is not a medical provider. As a coach, you are responsible for the programming you deliver to your athletes and for advising them to consult a qualified healthcare professional before beginning any new exercise or nutrition program.',
  },
  {
    title: '5. Payments, fees & payouts',
    content: 'Payments from athletes are processed by Stripe. FitLink deducts a 10% platform fee from athlete payments before payout to your connected Stripe account. Optional Coach Elite subscriptions are billed through your app store account and are subject to the app store\'s terms. Fees are non-refundable unless required by law.',
  },
  {
    title: '6. Your content',
    content: 'Workouts, meal plans, classes, and other content you create remain yours. By publishing content in the app, you grant FitLink a license to host and deliver it to your athletes. You must have the rights to any content you upload.',
  },
  {
    title: '7. Acceptable use',
    content: 'You agree not to misuse the service. You will not send spam, store illegal content, or harass athletes or other users.',
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
    content: 'We collect the information you provide (name, email, profile details, content you create), usage data (sessions, classes, messages you send through the app), and basic device information (OS and app version).',
  },
  {
    title: 'How we use your data',
    content: 'Your data is used to provide the service, connect you with your athletes, process payments, improve the app, send service-related notifications, and provide customer support. We do not sell your personal data.',
  },
  {
    title: 'Payments',
    content: 'Payment processing is handled by Stripe (athlete payments and payouts) and by your app store via RevenueCat (Coach Elite subscriptions). FitLink does not store your card or bank details.',
  },
  {
    title: 'Data storage & security',
    content: 'Data is stored on Supabase infrastructure and encrypted in transit over HTTPS. Row-level security keeps each account\'s data isolated.',
  },
  {
    title: 'Your rights',
    content: 'You can request a copy of your data or delete your account at any time. Account deletion is available at the bottom of the Profile tab, or you can contact us.',
  },
];

export default function TermsPrivacyScreen() {
  const router = useRouter();

  const openPrivacyEmail = () => {
    Linking.openURL(`mailto:${PRIVACY_EMAIL}`).catch(() =>
      Alert.alert('No mail app found', `Email us at ${PRIVACY_EMAIL}.`)
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Terms & privacy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>Terms of service</Text>
        <Text style={s.lastUpdated}>LAST UPDATED: MAY 2026</Text>

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
          <Ionicons name="mail-outline" size={18} color={CoachColors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.contactTitle}>Privacy questions?</Text>
            <Text style={s.contactEmail}>{PRIVACY_EMAIL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={CoachColors.textFaint} />
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
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.textPrimary },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 60, paddingTop: 16 },

  pageTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 22, color: CoachColors.textPrimary,
    letterSpacing: -0.3, marginBottom: 6,
  },
  lastUpdated: {
    fontFamily: CoachFonts.bodyBold, fontSize: 10.5, color: CoachColors.textFaint,
    letterSpacing: 0.8, marginBottom: 22,
  },

  section: { marginBottom: 22 },
  sectionTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary, marginBottom: 6 },
  sectionContent: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textSecondary, lineHeight: 21 },

  divider: { height: 1, backgroundColor: CoachColors.borderMuted, marginVertical: 26 },

  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginTop: 6,
  },
  contactTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  contactEmail: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textSecondary, marginTop: 1 },
});
