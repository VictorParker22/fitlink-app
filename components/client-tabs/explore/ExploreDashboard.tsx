import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';

import ExploreGrid from '../ExploreGrid';
import FeaturedContent from '../FeaturedContent';
import CoachDirectory from '../CoachDirectory';
import CategoryLibraryModal from '../CategoryLibraryModal';
import CoachDetailModal from '../CoachDetailModal';
import BookSessionModal from '../BookSessionModal';

import HeroSpotlight from './HeroSpotlight';
import CoachPlansShowcase, { PlanItem } from './CoachPlansShowcase';
import SessionSpotlight, { SessionItem } from './SessionSpotlight';
import PlanWizardModal from './PlanWizardModal';
import { ContinueWatchingStrip } from './ContinueWatchingStrip';
import { SavedClassesStrip } from './SavedClassesStrip';
import { ClassStatsWidget } from './ClassStatsWidget';

interface Coach {
  id: string;
  name: string;
  role: string;
  avatar: string;
  specialty: string;
  bio: string;
}

interface ExploreDashboardProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showSearchInput: boolean;
  setShowSearchInput: (show: boolean) => void;
  allCoaches: Coach[];
  selectedCoach: Coach | null;
  setSelectedCoach: (coach: Coach | null) => void;
  showBookModal: boolean;
  setShowBookModal: (show: boolean) => void;
  // bookingCoach is decoupled from selectedCoach so the coach reference
  // persists in BookSessionModal even after CoachDetailModal closes.
  bookingCoach: Coach | null;
  setBookingCoach: (coach: Coach | null) => void;
  selectedCategoryLabel: string | null;
  setSelectedCategoryLabel: (label: string | null) => void;
  onWorkoutsListPress: () => void;
  hasActivePlan?: boolean;
}

const FILTER_CATEGORIES = [
  'All', 'Strength', 'HIIT', 'Yoga', 'Pilates', 'Cardio',
  'Boxing', 'Running', 'Recovery', 'Meditation', 'Dance', 'Cycling',
];

export default function ExploreDashboard({
  searchQuery,
  setSearchQuery,
  showSearchInput,
  setShowSearchInput,
  allCoaches,
  selectedCoach,
  setSelectedCoach,
  showBookModal,
  setShowBookModal,
  bookingCoach,
  setBookingCoach,
  selectedCategoryLabel,
  setSelectedCategoryLabel,
  onWorkoutsListPress,
  hasActivePlan = false,
}: ExploreDashboardProps) {
  const scrollRef = useRef<ScrollView>(null);
  const coachSectionY = useRef<number>(600);
  const router = useRouter();

  const scrollToCoaches = () => {
    scrollRef.current?.scrollTo({ y: coachSectionY.current, animated: true });
  };

  // ── Wizard state — separate from CoachDetailModal ──────────────────────
  const [showWizard, setShowWizard] = useState(false);
  const [wizardPlan, setWizardPlan] = useState<PlanItem | null>(null);
  const [wizardCoach, setWizardCoach] = useState<Coach | null>(null);
  const [allMarketplacePlans, setAllMarketplacePlans] = useState<PlanItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');

  const handlePlanSelect = useCallback((plan: PlanItem) => {
    const coach =
      allCoaches.find((c) =>
        c.name.toLowerCase().includes(plan.coachName.toLowerCase().split(' ')[0])
      ) || allCoaches[0] || null;
    setWizardCoach(coach);
    setWizardPlan(plan);
    setShowWizard(true);
  }, [allCoaches]);

  const handleWizardClose = useCallback(() => {
    setShowWizard(false);
    setWizardPlan(null);
    setWizardCoach(null);
  }, []);

  const trainerPlans = wizardPlan
    ? allMarketplacePlans.filter((p) => p.coachName === wizardPlan.coachName)
    : [];

  const handlePlansLoaded = useCallback((plans: PlanItem[]) => {
    setAllMarketplacePlans(plans);
  }, []);

  const handleBookSession = (session: SessionItem) => {
    const coach =
      allCoaches.find((c) =>
        c.name.toLowerCase().includes(session.coachName.toLowerCase().split(' ')[0])
      ) || allCoaches[0];
    // Set bookingCoach only (NOT selectedCoach — that opens CoachDetailModal,
    // which would create two simultaneous modals and freeze the app).
    setBookingCoach(coach);
    setShowBookModal(true);
  };

  return (
    <View style={s.container}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {/* ══ HEADER ══════════════════════════════════════════════════ */}
        <View style={s.header}>
          <View>
            {/* Decorative 9px tag — 32pt "Explore" title is the primary info carrier */}
            <Text style={s.tagHeader} accessibilityElementsHidden={true}>Train · Discover</Text>
            <Text style={s.title}>Explore</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setShowSearchInput(!showSearchInput);
              if (showSearchInput) setSearchQuery('');
            }}
            style={s.searchToggleBtn}
            accessibilityLabel="Search explore content"
            accessibilityHint="Opens a search field to find coaches, plans, and sessions"
            accessibilityRole="button"
          >
            <Ionicons name={showSearchInput ? 'close' : 'search'} size={20} color={CoachColors.textPrimary} />
          </TouchableOpacity>
        </View>

        {showSearchInput && (
          <View style={s.searchBarContainer}>
            <Ionicons name="search" size={16} color={CoachColors.textMuted} style={s.searchIcon} />
            <TextInput
              style={s.searchInputField}
              placeholder="Search coaches, plans, sessions..."
              placeholderTextColor={CoachColors.textFaint}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              autoCorrect={false}
              accessibilityLabel="Search field"
              accessibilityHint="Type to search for coaches, plans, and sessions"
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={s.searchClearBtn}>
                <Ionicons name="close-circle" size={16} color={CoachColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ══ ZONE A — RESUME & STATUS ═════════════════════════════════
            What the user was already doing. Only show what's relevant. */}

        {/* Continue watching — only renders when data exists */}
        <ContinueWatchingStrip />

        {/* Pass summary card — shows only if client has a plan */}
        {hasActivePlan && (
          <TouchableOpacity
            style={s.passSummaryCard}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(ClientRoute.myPass);
            }}
            accessibilityRole="button"
            accessibilityLabel="View your FitLink Pass"
            accessibilityHint="Opens your active coaching plan details"
          >
            <View style={s.passSummaryLeft}>
              <View style={s.passSummaryIconWrap}>
                <Ionicons name="ticket" size={16} color={CoachColors.accent} />
              </View>
              <View>
                {/* 9px decorative — "Your active plan" (15pt) is primary info */}
                <Text style={s.passSummaryLabel} accessibilityElementsHidden={true}>FITLINK PASS</Text>
                <Text style={s.passSummaryTitle}>Your active plan</Text>
              </View>
            </View>
            <View style={s.passSummaryRight}>
              <Text style={s.passSummaryAction}>View →</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={s.zoneDivider} />

        {/* ══ ZONE B — CONTENT LIBRARY ══════════════════════════════════
            Category filter lives directly above what it controls. */}
        <View style={s.zoneHeader} accessibilityRole="header">
          {/* 9px decorative — "Content library" (22pt) is primary info carrier */}
          <Text style={s.zoneAccentTag} accessibilityElementsHidden={true}>BROWSE</Text>
          <Text style={s.zoneTitle}>Content library</Text>
        </View>

        {/* Category filter — adjacent to the content it controls */}
        <FlatList
          data={FILTER_CATEGORIES}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRibbonContent}
          style={s.filterRibbon}
          renderItem={({ item }) => {
            const isActive = activeCategory === item;
            return (
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveCategory(item);
                  setSelectedCategoryLabel(item === 'All' ? null : item);
                }}
                style={[s.filterChip, isActive && s.filterChipActive]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${item}`}
                accessibilityState={{ selected: isActive }}
              >
                {/* 11pt — raised to HIG minimum: chip text IS sole category indicator */}
                <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Saved classes */}
        <SavedClassesStrip />

        {/* 2×2 nav grid — Classes / Collections / Programs / Articles */}
        <ExploreGrid />

        <View style={s.zoneDivider} />

        {/* ══ ZONE C — FIND A COACH ══════════════════════════════════════ */}
        <View
          style={s.zoneHeader}
          onLayout={(e) => { coachSectionY.current = e.nativeEvent.layout.y; }}
          accessibilityRole="header"
        >
          <Text style={s.zoneAccentTag} accessibilityElementsHidden={true}>COACHING</Text>
          <Text style={s.zoneTitle}>Find a coach</Text>
        </View>

        {/* Hero — hidden when client already has a plan (no need to sell them) */}
        {!hasActivePlan && (
          <HeroSpotlight onExploreCoachesPress={scrollToCoaches} />
        )}

        {/* Coach roster */}
        <CoachDirectory
          searchQuery={searchQuery}
          allCoaches={allCoaches}
          onCoachPress={(coach) => setSelectedCoach(coach)}
          onBookPress={(coach) => {
            setSelectedCoach(coach);
            setShowBookModal(true);
          }}
        />

        {/* Plan marketplace — directly below the coaches who own the plans */}
        <CoachPlansShowcase
          allCoaches={allCoaches}
          onPlanSelect={handlePlanSelect}
          onPlansLoaded={handlePlansLoaded}
        />

        {/* Lower-commitment entry point: single sessions */}
        <SessionSpotlight allCoaches={allCoaches} onBookSessionPress={handleBookSession} />

        <View style={s.zoneDivider} />

        {/* ══ ZONE D — YOUR PROGRESS ═════════════════════════════════════ */}
        <View style={s.zoneHeader} accessibilityRole="header">
          <Text style={s.zoneAccentTag} accessibilityElementsHidden={true}>STATS</Text>
          <Text style={s.zoneTitle}>Your progress</Text>
        </View>
        <ClassStatsWidget />

        <View style={s.zoneDivider} />

        {/* ══ ZONE E — EDITORIAL ═════════════════════════════════════════ */}
        <View style={s.zoneHeader} accessibilityRole="header">
          <Text style={s.zoneAccentTag} accessibilityElementsHidden={true}>READ</Text>
          <Text style={s.zoneTitle}>Editorial</Text>
        </View>
        <FeaturedContent searchQuery={searchQuery} />

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      <CategoryLibraryModal
        selectedCategoryLabel={selectedCategoryLabel}
        onRequestClose={() => setSelectedCategoryLabel(null)}
        accentColor={CoachColors.accent}
      />

      <CoachDetailModal
        coach={selectedCoach}
        onRequestClose={() => setSelectedCoach(null)}
        onBookPress={() => {
          // CRITICAL: Never open two Modals simultaneously on iOS — it freezes.
          // Pattern: save the coach, dismiss the first modal, then open the second
          // after the dismiss animation fully completes (~300ms).
          const coachToBook = selectedCoach;
          setBookingCoach(coachToBook);
          setSelectedCoach(null);           // 1. close CoachDetailModal
          setTimeout(() => {
            setShowBookModal(true);         // 2. open BookSessionModal after dismiss
          }, 350);
        }}
      />

      <BookSessionModal
        visible={showBookModal}
        coach={bookingCoach}
        onRequestClose={() => {
          setShowBookModal(false);
          setBookingCoach(null);
          setSelectedCoach(null);
        }}
        accentColor={CoachColors.accent}
      />

      <PlanWizardModal
        visible={showWizard}
        plan={wizardPlan}
        trainerPlans={trainerPlans}
        coach={wizardCoach}
        onRequestClose={handleWizardClose}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  scroll: { paddingTop: 8 },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -0.8,
  },
  searchToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInputField: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },
  searchClearBtn: { padding: 4 },

  // ── Pass summary card (when hasActivePlan) ──
  passSummaryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  passSummaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: CoachColors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passSummaryLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.accent,
    letterSpacing: 2,
    marginBottom: 2,
  },
  passSummaryTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
    letterSpacing: -0.2,
  },
  passSummaryRight: {},
  passSummaryAction: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12,
    color: CoachColors.accent,
    letterSpacing: 1,
  },

  // ── Zone dividers + headers ──
  zoneDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: 16,
    marginVertical: 24,
  },
  zoneHeader: {
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 4, // 4pt between accent tag and title
  },
  // 9px decorative micro eyebrow — VoiceOver skips via accessibilityElementsHidden.
  zoneAccentTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  // 22pt sentence case — primary info carrier for this section.
  zoneTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    letterSpacing: -0.4,
  },

  // ── Category filter ──
  filterRibbon: { marginBottom: 16 },
  filterRibbonContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36, // HIG: visual height close to 44pt when padded
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
  },
  // 11pt — HIG Caption 2 minimum: chip text IS the sole category indicator.
  filterChipText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  filterChipTextActive: { color: CoachColors.onAccent },
});
