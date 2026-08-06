/**
 * CoachDetailModal — The Coach Profile Sheet
 *
 * Replaces the old plain-text "Coach Bio" modal.
 * Design: Editorial precision — full-bleed photo hero, specialty tags,
 * dual action CTAs (Message / Book Session), plan discovery link.
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily } from '../../constants/theme';
import { ClientRoute } from '../../types/routes';

const { height: SCREEN_H } = Dimensions.get('window');
const HERO_H = Math.round(SCREEN_H * 0.42);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Coach {
  id: string;
  name: string;
  role: string;
  avatar: string;
  specialty: string;
  bio: string;
}

interface CoachDetailModalProps {
  coach: Coach | null;
  onRequestClose: () => void;
  onBookPress: () => void;
}

// ─── Specialty tag parser ──────────────────────────────────────────────────────

const TAG_COLORS = ['#FF6B35', '#5B7FFF', '#22C55E', '#A855F7', '#FFD700', '#F43F5E'];

function parseSpecialties(specialty: string): string[] {
  return specialty
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function getTagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length];
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={s.statPill}>
      <Ionicons name={icon as any} size={10} color="rgba(255,255,255,0.4)" />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statDot}>·</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CoachDetailModal({
  coach,
  onRequestClose,
  onBookPress,
}: CoachDetailModalProps) {
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  const isVisible = !!coach;

  useEffect(() => {
    if (isVisible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 20,
        tension: 120,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H,
        duration: 260,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible]);

  if (!coach) return null;

  const specialties = parseSpecialties(coach.specialty || '');
  const coachNameUpper = (coach.name || 'Coach').toUpperCase();
  const roleUpper = (coach.role || 'Elite Trainer').toUpperCase();
  const firstName = (coach.name || 'Coach').split(' ')[0];

  const handleBook = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onBookPress();
  };

  const handleMessage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRequestClose();
    setTimeout(() => router.push(ClientRoute.myMessages), 300);
  };

  const handleViewPlans = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRequestClose();
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onRequestClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={onRequestClose}
      />

      {/* Animated bottom sheet */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <SafeAreaView style={s.sheetSafe} edges={['bottom']}>
          {/* HIG drag handle — 44pt grab area, 36×5pt pill */}
          <View style={s.dragArea} accessibilityElementsHidden={true}>
            <View style={s.dragHandle} />
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces
          >
            {/* ── §1 HERO ───────────────────────────────────────────────── */}
            <View style={s.hero}>
              <Image
                source={{ uri: coach.avatar }}
                style={s.heroImg}
                contentFit="cover"
                transition={300}
                accessibilityLabel={`${coach.name} profile photo`}
              />
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', '#000000']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />

              {/* Close button */}
              <TouchableOpacity
                style={s.closeBtn}
                onPress={onRequestClose}
                accessibilityRole="button"
                accessibilityLabel="Close coach profile"
              >
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>

              {/* Role badge */}
              <View style={s.roleBadge}>
                <Text style={s.roleBadgeText}>{roleUpper}</Text>
              </View>

              {/* Coach identity */}
              <View style={s.heroBottom}>
                <Text style={s.heroName}>{coachNameUpper}</Text>

                {/* Stats row */}
                <View style={s.statsRow}>
                  <Ionicons name="star" size={10} color="#FFD700" />
                  <Text style={s.statValue}>4.9</Text>
                  <Text style={s.statDot}>·</Text>
                  <Text style={s.statLabel}>247 clients</Text>
                  <Text style={s.statDot}>·</Text>
                  <Text style={s.statLabel}>12 yr exp</Text>
                </View>
              </View>
            </View>

            {/* ── §2 SPECIALTIES ────────────────────────────────────────── */}
            {specialties.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTag}>SPECIALTIES</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.tagRow}
                >
                  {specialties.map((sp, i) => (
                    <View
                      key={i}
                      style={[s.tag, { borderColor: getTagColor(i) }]}
                    >
                      <View style={[s.tagDot, { backgroundColor: getTagColor(i) }]} />
                      <Text style={[s.tagText, { color: getTagColor(i) }]}>
                        {sp.toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── §3 BIO ────────────────────────────────────────────────── */}
            {!!coach.bio && (
              <View style={s.section}>
                <Text style={s.sectionTag}>ABOUT {firstName.toUpperCase()}</Text>
                <Text style={s.bioText}>{coach.bio}</Text>
              </View>
            )}

            {/* Bottom spacing for sticky CTAs */}
            <View style={{ height: 130 }} />
          </ScrollView>

          {/* ── Sticky CTA ─────────────────────────────────────────────── */}
          <View style={s.ctaWrap}>
            <View style={s.ctaRow}>
              {/* Message */}
              <TouchableOpacity
                style={s.msgBtn}
                onPress={handleMessage}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Message ${coach.name}`}
                accessibilityHint="Opens your messages with this coach"
              >
                <Ionicons name="chatbubble-outline" size={18} color="#FFFFFF" />
                <Text style={s.msgBtnText}>MESSAGE</Text>
              </TouchableOpacity>

              {/* Book session */}
              <TouchableOpacity
                style={s.bookTouchable}
                onPress={handleBook}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={`Book session with ${coach.name}`}
                accessibilityHint="Opens the session booking form"
              >
                <LinearGradient
                  colors={['#FFD700', '#FF9500']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.bookBtn}
                >
                  <Ionicons name="calendar-outline" size={16} color="#000000" />
                  <Text style={s.bookBtnText}>BOOK SESSION</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* View plans link */}
            <TouchableOpacity
              onPress={handleViewPlans}
              accessibilityRole="button"
              accessibilityLabel="View coaching plans"
              accessibilityHint="Scrolls to the coaching plans section"
              style={s.plansLink}
            >
              <Text style={s.plansLinkText}>View Coaching Plans →</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Backdrop
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.9,
    backgroundColor: '#000000',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheetSafe: { flex: 1 },
  // HIG drag handle — 44pt tall grab area, centered 36×5pt pill
  dragArea: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },

  // ── Hero ──
  hero: {
    height: HERO_H,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  roleBadge: {
    position: 'absolute',
    top: 16,
    left: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  roleBadgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 2,
  },
  heroBottom: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 2,
    gap: 8,
  },
  heroName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 34,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },
  statDot: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
  },
  statLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  },

  // ── Sections ──
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 2.5,
    marginBottom: 10,
  },

  // Specialty tags
  tagRow: {
    gap: 8,
    paddingBottom: 4,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  tagText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },

  // Bio
  bioText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 22,
  },

  // ── Sticky CTAs ──
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: '#000000',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  msgBtn: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  msgBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  bookTouchable: {
    flex: 2,
    borderRadius: 14,
    overflow: 'hidden',
  },
  bookBtn: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bookBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
    letterSpacing: 0.5,
  },
  plansLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  plansLinkText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.3,
  },
});
