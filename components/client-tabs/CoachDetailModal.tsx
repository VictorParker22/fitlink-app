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

import { CoachColors, CoachFonts } from '../../constants/coachDesign';
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

function parseSpecialties(specialty: string): string[] {
  return specialty
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
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
  const coachName = coach.name || 'Coach';
  const coachRole = coach.role || 'Elite trainer';
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
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', CoachColors.bg]}
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
                <Ionicons name="close" size={18} color={CoachColors.textPrimary} />
              </TouchableOpacity>

              {/* Role badge */}
              <View style={s.roleBadge}>
                <Text style={s.roleBadgeText}>{coachRole}</Text>
              </View>

              {/* Coach identity */}
              <View style={s.heroBottom}>
                <Text style={s.heroName}>{coachName}</Text>
              </View>
            </View>

            {/* ── §2 SPECIALTIES ────────────────────────────────────────── */}
            {specialties.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTag}>Specialties</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.tagRow}
                >
                  {specialties.map((sp, i) => (
                    <View key={i} style={s.tag}>
                      <View style={s.tagDot} />
                      <Text style={s.tagText}>{sp}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── §3 BIO ────────────────────────────────────────────────── */}
            {!!coach.bio && (
              <View style={s.section}>
                <Text style={s.sectionTag}>About {firstName}</Text>
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
                <Ionicons name="chatbubble-outline" size={18} color={CoachColors.textPrimary} />
                <Text style={s.msgBtnText}>Message</Text>
              </TouchableOpacity>

              {/* Book session */}
              <TouchableOpacity
                style={s.bookBtn}
                onPress={handleBook}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={`Book session with ${coach.name}`}
                accessibilityHint="Opens the session booking form"
              >
                <Ionicons name="calendar-outline" size={16} color={CoachColors.onAccent} />
                <Text style={s.bookBtnText}>Book session</Text>
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
              <Text style={s.plansLinkText}>View coaching plans</Text>
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
    backgroundColor: CoachColors.bg,
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
    backgroundColor: CoachColors.border,
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
    borderColor: CoachColors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  roleBadgeText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 8,
    color: CoachColors.textSecondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroBottom: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 2,
    gap: 8,
  },
  heroName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 34,
    color: CoachColors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 38,
  },

  // ── Sections ──
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
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
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSofter,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: CoachColors.accent,
  },
  tagText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: CoachColors.accent,
  },

  // Bio
  bioText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
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
    backgroundColor: CoachColors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CoachColors.borderMuted,
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
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  msgBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12,
    color: CoachColors.textPrimary,
    letterSpacing: 1,
  },
  bookBtn: {
    flex: 2,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: CoachColors.accent,
  },
  bookBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
  plansLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  plansLinkText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.textMuted,
    letterSpacing: 0.3,
  },
});
