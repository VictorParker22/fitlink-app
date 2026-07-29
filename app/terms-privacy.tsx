import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useMemo } from 'react';

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    content: 'By downloading, installing, or using the FitLink Client App ("the App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App.',
  },
  {
    title: '2. Description of Service',
    content: 'FitLink provides fitness clients with a portal to view workouts, track habits, log meals, and communicate with their fitness coach. The service is provided in conjunction with your coach\'s subscription.',
  },
  {
    title: '3. User Accounts',
    content: 'You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information when creating an account. You may not share your account with others.',
  },
  {
    title: '4. Health Disclaimer',
    content: 'FitLink is not a medical provider. Always consult with a qualified healthcare professional before beginning any new exercise or nutrition program. You participate in workouts at your own risk.',
  },
  {
    title: '5. Data & Privacy',
    content: 'We take your privacy seriously. All data is stored securely using enterprise-grade encryption. We do not sell your personal health or fitness data to third parties. Your data is shared only with your authorized coach.',
  },
  {
    title: '6. Payments & Subscriptions',
    content: 'If you purchase passes or subscriptions through the App, payment processing is handled by our secure third-party payment processor. All fees are non-refundable unless stated otherwise by your coach.',
  },
  {
    title: '7. Acceptable Use',
    content: 'You agree not to misuse the service. You will not send spam, store illegal content, or harass other users or coaches.',
  },
  {
    title: '8. Intellectual Property',
    content: 'The FitLink app, including its design, code, and content, is owned by FitLink Inc. Workouts and content provided by your coach belong to them or FitLink.',
  },
  {
    title: '9. Limitation of Liability',
    content: 'FitLink is provided "as is" without warranties. We are not liable for any injuries, damages, or losses arising from your use of the service or the fitness programs provided.',
  },
  {
    title: '10. Changes to Terms',
    content: 'We reserve the right to modify these terms at any time. Continued use constitutes acceptance of modified terms.',
  },
];

export default function TermsPrivacyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TERMS & PRIVACY</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>LAST UPDATED: MAY 2026</Text>

        {TERMS_SECTIONS.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        <Text style={styles.privacyHeader}>PRIVACY POLICY</Text>

        {[
          { title: 'Information We Collect', content: 'We collect information you provide (name, email, phone), usage data (sessions, workouts created), and device information (OS, app version) for analytics.' },
          { title: 'How We Use Your Data', content: 'Your data is used to provide the service, improve the app, send service-related notifications, and provide customer support.' },
          { title: 'Data Storage & Security', content: 'Data is stored on Supabase infrastructure with enterprise-grade encryption. All API calls use HTTPS. Row Level Security ensures data isolation between users.' },
          { title: 'Your Rights', content: 'You can request a copy of your data, request deletion of your account, or opt out of non-essential communications at any time by contacting support.' },
          { title: 'Contact', content: 'For privacy-related questions, contact us at privacy@getfitlink.com.' },
        ].map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 110, paddingTop: Spacing.lg },

  lastUpdated: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: colors.textTertiary, marginBottom: Spacing.xl, letterSpacing: 1.5 },

  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontFamily: FontFamily.heading, fontSize: 11, color: colors.textPrimary, marginBottom: Spacing.sm, letterSpacing: 1 },
  sectionContent: { fontFamily: FontFamily.body, fontSize: 13, color: colors.textSecondary, lineHeight: 22 },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: Spacing['2xl'] },
  privacyHeader: { fontFamily: FontFamily.headingExtraBold, fontSize: 20, color: colors.textPrimary, marginBottom: Spacing.xl, letterSpacing: 1 },
});
