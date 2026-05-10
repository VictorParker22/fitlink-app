import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Card from '../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme'
import { useTheme } from '../context/ThemeContext';

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    content: 'By downloading, installing, or using FitLink ("the App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App.',
  },
  {
    title: '2. Description of Service',
    content: 'FitLink provides fitness trainers with tools to manage clients, schedule sessions, create workouts, and communicate with clients. The service includes a trainer dashboard and a client portal.',
  },
  {
    title: '3. User Accounts',
    content: 'You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information when creating an account. You may not share your account with others.',
  },
  {
    title: '4. Acceptable Use',
    content: 'You agree not to misuse the service or help anyone else do so. You will not send spam, store illegal content, or attempt to access other users\' data.',
  },
  {
    title: '5. Data & Privacy',
    content: 'We take your privacy seriously. All data is stored securely using Supabase with Row Level Security (RLS). Your personal data is encrypted in transit and at rest. We do not sell your data to third parties.',
  },
  {
    title: '6. Client Data',
    content: 'As a trainer, you are responsible for obtaining proper consent before storing client information. You agree to handle client data in accordance with applicable privacy laws.',
  },
  {
    title: '7. Payments & Subscriptions',
    content: 'If you use paid features, payment processing is handled by our third-party payment processor. Subscription fees are billed in advance on a monthly basis.',
  },
  {
    title: '8. Intellectual Property',
    content: 'The FitLink app, including its design, code, and content, is owned by FitLink Inc. You retain ownership of your content (workouts, client data, etc.) that you create using the App.',
  },
  {
    title: '9. Limitation of Liability',
    content: 'FitLink is provided "as is" without warranties. We are not liable for any indirect, incidental, or consequential damages arising from your use of the service.',
  },
  {
    title: '10. Changes to Terms',
    content: 'We reserve the right to modify these terms at any time. We will notify you of significant changes through the App. Continued use constitutes acceptance of modified terms.',
  },
];

export default function TermsPrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Privacy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last updated: May 2026</Text>

        {TERMS_SECTIONS.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        <Text style={styles.privacyHeader}>Privacy Policy</Text>

        {[
          { title: 'Information We Collect', content: 'We collect information you provide (name, email, phone), usage data (sessions, workouts created), and device information (OS, app version) for analytics.' },
          { title: 'How We Use Your Data', content: 'Your data is used to provide the service, improve the app, send service-related notifications, and provide customer support.' },
          { title: 'Data Storage & Security', content: 'Data is stored on Supabase infrastructure with enterprise-grade encryption. All API calls use HTTPS. Row Level Security ensures data isolation between users.' },
          { title: 'Your Rights', content: 'You can request a copy of your data, request deletion of your account, or opt out of non-essential communications at any time by contacting support.' },
          { title: 'Contact', content: 'For privacy-related questions, contact us at privacy@getfitlink.com.' },
        ].map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  lastUpdated: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, marginBottom: Spacing.lg },

  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary, marginBottom: Spacing.xs },
  sectionContent: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xl },
  privacyHeader: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: Colors.textPrimary, marginBottom: Spacing.lg },
});
