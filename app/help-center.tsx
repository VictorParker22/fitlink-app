import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useReducedMotion } from '../lib/useReducedMotion';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ_SECTIONS = [
  {
    title: 'Athletes & coaching',
    items: [
      { q: 'How do I add a new athlete?', a: 'Go to the Athletes tab and tap the add button, or share your referral link from Profile. Athletes who sign up through your link are connected to you automatically.' },
      { q: 'How do check-ins work?', a: 'Athletes submit check-ins from their app. You review them from the athlete\'s detail screen, where you can see their progress and respond directly.' },
      { q: 'Can I message my athletes?', a: 'Yes. Open any athlete and tap the message icon to chat. You can send text, photos, and file attachments.' },
    ],
  },
  {
    title: 'Programs & passes',
    items: [
      { q: 'What are passes and seasons?', a: 'A pass is what an athlete buys to train with you. Each pass contains seasons, and each season has tracks of programmed content — workouts, classes, and plans.' },
      { q: 'How do I build a workout?', a: 'From the Programs tab, create a workout and add exercises block by block. You can attach swap lists so athletes can substitute exercises when equipment is not available.' },
      { q: 'Can I create meal plans?', a: 'Yes. The meal-plan builder works like the workout builder: build days of meals and add swap lists so athletes can trade meals they don\'t like for approved alternatives.' },
    ],
  },
  {
    title: 'Studio & classes',
    items: [
      { q: 'How do I run a live class?', a: 'Go to the Studio tab and create a live class with a title, category, and duration. Athletes see it in their schedule and join when you go live.' },
      { q: 'What are on-demand classes?', a: 'Recorded classes you publish to your library. Athletes with an active pass can stream them any time from their Explore tab.' },
    ],
  },
  {
    title: 'Earnings & billing',
    items: [
      { q: 'How do payouts work?', a: 'Payments from athletes are processed through Stripe. FitLink takes a 10% platform fee, and the rest is paid out to your connected Stripe account. Track everything in Earnings & payouts.' },
      { q: 'What is Coach Elite?', a: 'Coach Elite is an optional subscription that unlocks premium coach tools. You can subscribe or manage it from the app; billing is handled through your app store account.' },
      { q: 'How does the referral program work?', a: 'Share your referral link from the Referral program screen. You can track sign-ups that came through your link there.' },
    ],
  },
  {
    title: 'Account',
    items: [
      { q: 'How do I update my profile?', a: 'Tap Edit profile on the Profile tab to change your photo, bio, certifications, and specializations.' },
      { q: 'How do I delete my account?', a: 'At the bottom of the Profile tab, tap Delete account. This permanently removes your account and data and cannot be undone.' },
    ],
  },
];

export default function HelpCenterScreen() {
  const router = useRouter();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const reduceMotion = useReducedMotion();

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_SECTIONS;
    return FAQ_SECTIONS
      .map((s) => ({
        ...s,
        items: s.items.filter((it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q)),
      }))
      .filter((s) => s.items.length > 0);
  }, [query]);

  const toggleItem = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Reduce Motion: expand/collapse instantly rather than easing the height.
    if (!reduceMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpandedItem((prev) => (prev === key ? null : key));
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Help center</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.heroTitle}>How can we help?</Text>

        <View style={s.searchWrap}>
          <Ionicons name="search" size={18} color={CoachColors.textFaint} />
          <TextInput
            style={s.searchInput}
            placeholder="Search questions"
            placeholderTextColor={CoachColors.textFaint}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>
          )}
        </View>

        {sections.length === 0 && (
          <Text style={s.emptyText}>No results. Try a different search, or contact support from the Profile tab.</Text>
        )}

        {sections.map((section) => (
          <View key={section.title}>
            <Text style={s.sectionLabel}>{section.title.toUpperCase()}</Text>
            <View style={s.card}>
              {section.items.map((item, i) => {
                const key = `${section.title}-${item.q}`;
                const isExpanded = expandedItem === key;
                return (
                  <View key={key}>
                    <TouchableOpacity
                      style={s.faqItem}
                      activeOpacity={0.7}
                      onPress={() => toggleItem(key)}
                      accessibilityRole="button"
                      accessibilityLabel={item.q}
                      accessibilityHint={isExpanded ? 'Collapses the answer' : 'Expands the answer'}
                      accessibilityState={{ expanded: isExpanded }}
                    >
                      <View style={s.faqHeader}>
                        <Text style={s.faqQuestion}>{item.q}</Text>
                        <Ionicons name={isExpanded ? 'remove' : 'add'} size={20} color={CoachColors.accent} />
                      </View>
                      {isExpanded && <Text style={s.faqAnswer}>{item.a}</Text>}
                    </TouchableOpacity>
                    {i < section.items.length - 1 && <View style={s.divider} />}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <TouchableOpacity style={s.contactRow} activeOpacity={0.7} onPress={() => router.push('/contact-support' as any)}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={CoachColors.accent} />
          <Text style={s.contactRowText}>Still stuck? Contact support</Text>
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
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textPrimary },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 60 },

  heroTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 27, color: CoachColors.textPrimary,
    marginTop: 16, marginBottom: 14, letterSpacing: -0.3,
  },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, paddingHorizontal: 14, height: 44,
  },
  searchInput: { flex: 1, fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary, paddingVertical: 0 },

  emptyText: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary, marginTop: 24, lineHeight: 22.5 },

  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 0.8, marginTop: 22, marginBottom: 8,
  },

  card: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, overflow: 'hidden',
  },
  faqItem: { paddingVertical: 14, paddingHorizontal: 16 },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  faqQuestion: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, flex: 1, lineHeight: 21.5 },
  faqAnswer: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary, lineHeight: 22.5, marginTop: 10 },
  divider: { height: 1, backgroundColor: CoachColors.borderMuted, marginHorizontal: 16 },

  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, marginTop: 28,
  },
  contactRowText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary, flex: 1 },
});
