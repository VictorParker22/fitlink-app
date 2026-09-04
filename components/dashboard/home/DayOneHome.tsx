import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppBusiness } from '../../../context/AppContext';
import { useRenderCount } from '../../../lib/devRenderCount';
import NewCoachSetupCards from '../NewCoachSetupCards';
import ExampleAtRiskCard from '../ExampleAtRiskCard';
import CardImage from '../../ui/CardImage';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

// First-run flag (golden path for a brand-new coach).
const EXAMPLE_DISMISSED_KEY = 'coach_example_atrisk_dismissed';

interface DayOneHomeProps {
  paddingTop: number;
  paddingBottom: number;
  onOpenProfile: () => void;
  onAddClient: () => void;
  onBrowseLibrary: () => void;
}

/**
 * Day-one empty state — the setup checklist instead of empty charts.
 * Business slice only (the coach's first name).
 */
const DayOneHome = React.memo(function DayOneHome({
  paddingTop, paddingBottom, onOpenProfile, onAddClient, onBrowseLibrary,
}: DayOneHomeProps) {
  useRenderCount('DayOneHome');
  const { trainer } = useAppBusiness();
  const firstName = trainer?.name?.split(' ')[0] || 'Coach';

  // ── Golden path: example card dismissal (first-run only) ─────────────────
  // Hidden until the persisted flag is read so it never flashes for coaches
  // who already dismissed it.
  const [exampleDismissed, setExampleDismissed] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(EXAMPLE_DISMISSED_KEY)
      .then(v => setExampleDismissed(v === '1'))
      .catch(() => { /* keep hidden on read failure */ });
  }, []);
  const dismissExample = useCallback(() => {
    setExampleDismissed(true);
    AsyncStorage.setItem(EXAMPLE_DISMISSED_KEY, '1').catch(() => {});
  }, []);

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  return (
    <View style={[emptyStyles.root, { paddingTop }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={emptyStyles.header}>
          <View>
            <Text style={emptyStyles.dateText}>{dateLabel}</Text>
            <Text style={emptyStyles.welcomeText}>Welcome, {firstName}</Text>
          </View>
          <TouchableOpacity
            style={emptyStyles.avatarCircle}
            onPress={onOpenProfile}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
          >
            <Text style={emptyStyles.avatarInitial}>{firstName[0]?.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        <View style={emptyStyles.section}>
          <TouchableOpacity
            style={emptyStyles.primaryCta}
            onPress={onAddClient}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add your first client"
          >
            <CardImage source={require('../../../assets/images/card-add-client.jpg')} />
            <View style={emptyStyles.primaryCtaPill}>
              <Text style={emptyStyles.primaryCtaText}>Add your first client</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={emptyStyles.section}>
          <NewCoachSetupCards />
        </View>

        <View style={emptyStyles.section}>
          <Text style={emptyStyles.sectionTitle}>Today</Text>
          <View style={emptyStyles.placeholderCard}>
            <Text style={emptyStyles.placeholderTitle}>Nothing booked yet.</Text>
            <Text style={emptyStyles.placeholderBody}>
              Once you have athletes, your sessions for the day show here with a join button.
            </Text>
          </View>
        </View>

        <View style={emptyStyles.section}>
          {!exampleDismissed ? (
            <ExampleAtRiskCard onDismiss={dismissExample} />
          ) : (
            <>
              <Text style={emptyStyles.sectionTitle}>Needs attention</Text>
              <View style={emptyStyles.placeholderCard}>
                <Text style={emptyStyles.placeholderTitle}>This is where the app nudges you.</Text>
                <Text style={emptyStyles.placeholderBody}>
                  Athletes going quiet, trials about to end, check-ins waiting on a reply.
                </Text>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={emptyStyles.libraryCard}
          activeOpacity={0.85}
          onPress={onBrowseLibrary}
          accessibilityRole="button"
          accessibilityLabel="Browse your workout and pass library"
        >
          <CardImage source={require('../../../assets/images/card-new-workout.jpg')} />
          <Text style={emptyStyles.libraryLinkText}>Browse your workout and pass library →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
});

export default DayOneHome;

// ── Day-one empty state styles ──────────────────────────────────────────────
const emptyStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  dateText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
  },
  welcomeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 27,
    color: CoachColors.textPrimary,
    marginTop: 2,
  },
  avatarCircle: {
    width: 38, height: 38, borderRadius: 19, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 18,
    color: CoachColors.onAccent,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 22,
  },
  // Image-backed hero CTA: CardImage fills the rounded clip; the lime pill
  // rides on top so the call to action keeps its accent punch.
  primaryCta: {
    height: 150,
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    padding: 16,
  },
  primaryCtaPill: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 17,
    color: CoachColors.onAccent,
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginBottom: 11,
  },
  placeholderCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderStyle: 'dashed',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 18,
  },
  placeholderTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  placeholderBody: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    marginTop: 4,
    lineHeight: 20,
  },
  // Image-backed library shortcut; label sits on the bottom scrim.
  libraryCard: {
    marginHorizontal: 20,
    marginTop: 22,
    height: 96,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 16,
  },
  libraryLinkText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
});
