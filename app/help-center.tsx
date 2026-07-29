import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const FAQ_SECTIONS = [
  {
    title: 'Getting Started',
    items: [
      { q: 'How do I view my assigned workouts?', a: 'Go to the Explore tab to see the workout plans and on-demand classes your coach has assigned for you. You can also see your daily tasks on the Home tab.' },
      { q: 'How do I join a scheduled session?', a: 'Any upcoming 1-on-1 or group sessions will appear on your Home tab. If it is a virtual session, a "Join Video" button will appear 5 minutes before the start time.' },
    ],
  },
  {
    title: 'Tracking Progress',
    items: [
      { q: 'How do I log my meals?', a: 'Go to the Profile tab and select "Diet & Nutrition" to log your daily meals and water intake. Your coach will automatically see your updates.' },
      { q: 'Where can I track my habits?', a: 'Your daily habits, like step count or sleep goals, are located on the Home tab. Simply tap to check them off as you complete them.' },
      { q: 'How do I update my body metrics?', a: 'Go to the Activity tab to view your progress charts. You can log new weight entries or body measurements from this screen.' },
    ],
  },
  {
    title: 'Billing & Subscriptions',
    items: [
      { q: 'How do I manage my subscription?', a: 'Go to Profile → My Subscription to view your active plans, billing history, or to update your payment method.' },
      { q: 'Can I purchase an on-demand pass?', a: 'Yes! Navigate to the Pass tab to purchase an all-access pass for your coach\'s premium on-demand class library.' },
    ],
  },
  {
    title: 'Account & Support',
    items: [
      { q: 'How do I contact my coach?', a: 'You can send a direct message to your coach from the Profile → Messages section, or use the Contact Support option for technical help.' },
      { q: 'Is my personal data secure?', a: 'Absolutely. FitLink uses enterprise-grade encryption to ensure that your health and fitness data is kept completely private between you and your coach.' },
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HELP CENTER</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.heroTitle}>HOW CAN WE HELP?</Text>
        <Text style={styles.heroSubtitle}>FIND ANSWERS TO COMMON QUESTIONS BELOW</Text>

        {FAQ_SECTIONS.map((section, si) => (
          <View key={si}>
            <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>
            <View style={styles.cardContainer}>
              {section.items.map((item, i) => {
                const key = `${si}-${i}`;
                const isExpanded = expandedItem === key;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.faqItem, i < section.items.length - 1 && styles.faqItemBorder]}
                    activeOpacity={0.8}
                    onPress={() => toggleItem(key)}
                  >
                    <View style={styles.faqHeader}>
                      <Text style={styles.faqQuestion}>{item.q.toUpperCase()}</Text>
                      <Ionicons name={isExpanded ? 'remove' : 'add'} size={20} color={colors.textPrimary} />
                    </View>
                    {isExpanded && (
                      <Text style={styles.faqAnswer}>{item.a}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
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
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 110 },

  heroTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 24, color: colors.textPrimary, textAlign: 'center', marginTop: Spacing.xl, letterSpacing: 1 },
  heroSubtitle: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.sm, letterSpacing: 1.5 },

  sectionLabel: { fontFamily: FontFamily.heading, fontSize: 11, color: colors.textTertiary, letterSpacing: 1.5, marginTop: Spacing['2xl'], marginBottom: Spacing.xs },

  cardContainer: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
  },
  faqItem: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.md },
  faqItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  faqQuestion: { fontFamily: FontFamily.bodyBold, fontSize: 12, color: colors.textPrimary, flex: 1, letterSpacing: 0.5 },
  faqAnswer: { fontFamily: FontFamily.body, fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginTop: Spacing.sm },
});
