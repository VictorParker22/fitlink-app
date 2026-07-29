import React, { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily, Radius } from '../../../constants/theme';
import { getCategoryColor } from '../../../data/categoryColors';
import ExploreGrid from '../ExploreGrid';
import FeaturedContent from '../FeaturedContent';
import CoachDirectory from '../CoachDirectory';
import CategoryLibraryModal from '../CategoryLibraryModal';
import CoachDetailModal from '../CoachDetailModal';
import BookSessionModal from '../BookSessionModal';

import HeroSpotlight from './HeroSpotlight';
import CoachPlansShowcase, { PlanItem } from './CoachPlansShowcase';
import SessionSpotlight, { SessionItem } from './SessionSpotlight';
import FitLinkPassPreview from './FitLinkPassPreview';
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
  selectedCategoryLabel: string | null;
  setSelectedCategoryLabel: (label: string | null) => void;
  onWorkoutsListPress: () => void;
  hasActivePlan?: boolean;
}

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
  selectedCategoryLabel,
  setSelectedCategoryLabel,
  onWorkoutsListPress,
  hasActivePlan = false,
}: ExploreDashboardProps) {
  const scrollRef = useRef<ScrollView>(null);
  const plansSectionY = useRef<number>(300);

  const scrollToPlans = () => {
    scrollRef.current?.scrollTo({ y: plansSectionY.current, animated: true });
  };

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardPlan, setWizardPlan] = useState<PlanItem | null>(null);
  const [allMarketplacePlans, setAllMarketplacePlans] = useState<PlanItem[]>([]);

  const handlePlanSelect = useCallback((plan: PlanItem) => {
    const coach = allCoaches.find((c) => c.name.toLowerCase().includes(plan.coachName.toLowerCase().split(' ')[0])) || allCoaches[0];
    setSelectedCoach(coach);
    setWizardPlan(plan);
    setShowWizard(true);
  }, [allCoaches, setSelectedCoach]);

  const handleWizardClose = useCallback(() => {
    setShowWizard(false);
    setWizardPlan(null);
    setSelectedCoach(null);
  }, [setSelectedCoach]);

  // Get all plans from the same trainer as the selected plan for tier selection
  const trainerPlans = wizardPlan
    ? allMarketplacePlans.filter((p) => p.coachName === wizardPlan.coachName)
    : [];

  const handlePlansLoaded = useCallback((plans: PlanItem[]) => {
    setAllMarketplacePlans(plans);
  }, []);

  const handleBookSession = (session: SessionItem) => {
    const coach = allCoaches.find((c) => c.name.toLowerCase().includes(session.coachName.toLowerCase().split(' ')[0])) || allCoaches[0];
    setSelectedCoach(coach);
    setShowBookModal(true);
  };

  const FILTER_CATEGORIES = ['All', 'Strength', 'HIIT', 'Yoga', 'Pilates', 'Cardio', 'Boxing', 'Running', 'Recovery', 'Meditation', 'Dance', 'Cycling'];
  const [activeCategory, setActiveCategory] = useState('All');

  return (
    <View style={s.container}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.tagHeader}>FITLINK MARKETPLACE // COACHING HUB</Text>
            <Text style={s.title}>Explore</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setShowSearchInput(!showSearchInput);
              if (showSearchInput) setSearchQuery('');
            }}
            style={s.searchToggleBtn}
            accessibilityLabel="Search explore content"
            accessibilityRole="button"
          >
            <Ionicons name={showSearchInput ? 'close' : 'search'} size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Search Input Box */}
        {showSearchInput && (
          <View style={s.searchBarContainer}>
            <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" style={s.searchIcon} />
            <TextInput
              style={s.searchInputField}
              placeholder="Search coaches, plans, sessions..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              autoCorrect={false}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={s.searchClearBtn}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Category Quick-Filter Ribbon */}
        <FlatList
          data={FILTER_CATEGORIES}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRibbonContent}
          style={s.filterRibbon}
          renderItem={({ item }) => {
            const isActive = activeCategory === item;
            const chipColor = item === 'All' ? '#5B7FFF' : getCategoryColor(item);
            return (
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveCategory(item);
                  if (item === 'All') {
                    setSelectedCategoryLabel(null);
                  } else {
                    setSelectedCategoryLabel(item);
                  }
                }}
                style={[
                  s.filterChip,
                  isActive && { backgroundColor: chipColor, borderColor: chipColor },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>
                  {item.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* § 1 ContinueWatchingStrip */}
        <ContinueWatchingStrip />
        <View style={s.sectionDivider} />

        {/* § 2 Hero Spotlight */}
        <HeroSpotlight onExploreCoachesPress={scrollToPlans} />
        <View style={s.sectionDivider} />

        {/* § 3 ClassStatsWidget */}
        <ClassStatsWidget />
        <View style={s.sectionDivider} />

        {/* § 4 SavedClassesStrip */}
        <SavedClassesStrip />
        <View style={s.sectionDivider} />

        {/* § 5 Coach Plans Showcase */}
        <View onLayout={(e) => { plansSectionY.current = e.nativeEvent.layout.y; }}>
          <CoachPlansShowcase allCoaches={allCoaches} onPlanSelect={handlePlanSelect} onPlansLoaded={handlePlansLoaded} />
        </View>

        {/* Divider */}
        <View style={s.sectionDivider} />

        {/* § 3 Featured Coaches Roster */}
        <CoachDirectory
          searchQuery={searchQuery}
          allCoaches={allCoaches}
          onCoachPress={(coach) => setSelectedCoach(coach)}
          onBookPress={(coach) => {
            setSelectedCoach(coach);
            setShowBookModal(true);
          }}
        />

        {/* Divider */}
        <View style={s.sectionDivider} />

        {/* § 4 Session Spotlight (Try Before You Buy) */}
        <SessionSpotlight allCoaches={allCoaches} onBookSessionPress={handleBookSession} />

        {/* Divider */}
        <View style={s.sectionDivider} />

        {/* § 5 FitLink Pass Teaser */}
        <FitLinkPassPreview
          hasActivePlan={hasActivePlan}
          onExplorePlansPress={scrollToPlans}
          onSubscribePress={() => {
            // Open wizard with the first available plan if exists
            if (allMarketplacePlans.length > 0) {
              handlePlanSelect(allMarketplacePlans[0]);
            } else {
              scrollToPlans();
            }
          }}
        />

        {/* Divider */}
        <View style={s.sectionDivider} />

        {/* § 6 Content Discovery Grid */}
        <ExploreGrid />

        {/* Divider */}
        <View style={s.sectionDivider} />

        {/* § 7 Featured Editorial Reads */}
        <FeaturedContent searchQuery={searchQuery} />

        {/* Bottom inset space */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Category Library Modal */}
      <CategoryLibraryModal
        selectedCategoryLabel={selectedCategoryLabel}
        onRequestClose={() => setSelectedCategoryLabel(null)}
        accentColor="#4D94FF"
      />

      {/* Coach Detail Modal */}
      <CoachDetailModal
        coach={selectedCoach}
        onRequestClose={() => setSelectedCoach(null)}
        onBookPress={() => setShowBookModal(true)}
      />

      {/* Coach Booking Modal */}
      <BookSessionModal
        visible={showBookModal}
        coach={selectedCoach}
        onRequestClose={() => {
          setShowBookModal(false);
          setSelectedCoach(null);
        }}
        accentColor="#4D94FF"
      />

      {/* Plan Purchase Wizard */}
      <PlanWizardModal
        visible={showWizard}
        plan={wizardPlan}
        trainerPlans={trainerPlans}
        coach={selectedCoach}
        onRequestClose={handleWizardClose}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  scroll: { paddingTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 2,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  searchToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInputField: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
  },
  searchClearBtn: { padding: 4 },
  sectionDivider: {
    height: 1,
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    marginBottom: 20,
  },
  filterRibbon: {
    marginBottom: 16,
  },
  filterRibbonContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: '#0C0C0E',
  },
  filterChipText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
});
