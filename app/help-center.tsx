import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Card from '../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const FAQ_SECTIONS = [
  {
    title: 'Getting Started',
    items: [
      { q: 'How do I add my first client?', a: 'Go to the Clients tab and tap the + button in the top right. Fill in their details and optionally assign a plan. You can also share an invite link for clients to sign up themselves.' },
      { q: 'How do clients access their portal?', a: 'When you add a client with their email or phone, they can log in to the FitLink app using the same credentials. They\'ll see their assigned workouts, upcoming sessions, and can message you directly.' },
      { q: 'How do I book a session?', a: 'Go to the Schedule tab and tap the + button. Choose the session type (1-on-1, Group, or Virtual), select a client, pick a date/time, and set the duration.' },
    ],
  },
  {
    title: 'Managing Clients',
    items: [
      { q: 'How do I change a client\'s status?', a: 'Tap on a client in the Clients tab, then tap the edit icon in the top right. You can change their status between Active, Trial, and Inactive.' },
      { q: 'Can I assign workouts to clients?', a: 'Yes! Create workout templates in the Workouts section, then assign them to specific clients. Clients will see assigned workouts in their portal.' },
      { q: 'How do referrals work?', a: 'Share your referral link from the Profile → Referral Program section. When someone signs up using your link, they appear in your referral tracking dashboard.' },
    ],
  },
  {
    title: 'Billing & Plans',
    items: [
      { q: 'How do I create subscription plans?', a: 'Go to Profile → Subscription Plans. You can view your plans and their revenue. New plans can be created from the web dashboard.' },
      { q: 'How is revenue calculated?', a: 'Monthly Recurring Revenue (MRR) is calculated by multiplying each plan\'s price by its active subscriber count. You can see a full breakdown in the Subscriptions and Analytics screens.' },
    ],
  },
  {
    title: 'Account & Security',
    items: [
      { q: 'How do I change my password?', a: 'Go to Settings and update your email. For password resets, use the "Forgot Password" option on the login screen.' },
      { q: 'Is my data secure?', a: 'Yes. FitLink uses Supabase with Row Level Security (RLS), meaning you can only access your own data. All connections are encrypted with TLS.' },
    ],
  },
];

export default function HelpCenterScreen() {
  const router = useRouter();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const toggleItem = (key: string) => {
    setExpandedItem((prev) => prev === key ? null : key);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help Center</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.heroTitle}>How can we help?</Text>
        <Text style={styles.heroSubtitle}>Find answers to common questions below</Text>

        {FAQ_SECTIONS.map((section, si) => (
          <View key={si}>
            <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>
            <Card noPadding>
              {section.items.map((item, i) => {
                const key = `${si}-${i}`;
                const isExpanded = expandedItem === key;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.faqItem, i < section.items.length - 1 && styles.faqItemBorder]}
                    activeOpacity={0.7}
                    onPress={() => toggleItem(key)}
                  >
                    <View style={styles.faqHeader}>
                      <Text style={styles.faqQuestion}>{item.q}</Text>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
                    </View>
                    {isExpanded && (
                      <Text style={styles.faqAnswer}>{item.a}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </Card>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  heroTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: colors.textPrimary, textAlign: 'center', marginTop: Spacing.lg },
  heroSubtitle: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.xs },

  sectionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.md },

  faqItem: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.base },
  faqItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  faqQuestion: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary, flex: 1 },
  faqAnswer: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textSecondary, lineHeight: 20, marginTop: Spacing.sm },
});
