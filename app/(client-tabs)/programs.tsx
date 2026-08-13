import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { ProgramData, PROGRAMS } from '../../data/programs';

const SCREEN_W = Dimensions.get('window').width;
const HERO_H = 400;

// ─── PROGRAMS LIST SCREEN ────────────────────────────────
export default function ProgramsScreen() {
  const router = useRouter();

  const handleProgramPress = (program: ProgramData) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: ClientRoute.programDetail as any,
      params: { programId: program.id },
    });
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        {/* Hero */}
        <View style={s.hero}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800' }}
            style={s.heroImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            accessible={false}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)', CoachColors.bg] as const}
            locations={[0.3, 0.75, 1]}
            style={s.heroGradient}
            accessible={false}
          />

          {/* Back button */}
          <SafeAreaView style={s.heroNav} edges={['top']}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={s.navBtn}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Go back to workouts"
            >
              <Ionicons name="chevron-back" size={28} color={CoachColors.textPrimary} />
            </TouchableOpacity>
          </SafeAreaView>

          {/* Title overlay */}
          <View style={s.heroContent}>
            <Text style={s.heroTagLabel}>FITLINK</Text>
            <Text style={s.heroTitle} accessibilityRole="header">{`Programs\nby Coaches`}</Text>
            <Text style={s.heroSub}>Curated week-by-week progressions</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={s.divider} />

        {/* Subtitle */}
        <View style={s.sectionPad}>
          <Text style={s.subtitle}>Unlock your performance, week after week.</Text>
          <Text style={s.description}>
            FitLink Coaches curate our Programs and will include workouts custom to your level and schedule. Track progress and unlock new weeks as you continue.
          </Text>
        </View>

        {/* Divider */}
        <View style={s.divider} />

        {/* Program list */}
        <View style={s.sectionPad}>
          <Text style={s.selectTagLabel}>SELF-GUIDED</Text>
          <Text style={s.selectTitle}>Choose a program</Text>
        </View>

        <View style={s.programList}>
          {PROGRAMS.map((program) => (
            <TouchableOpacity
              key={program.id}
              style={s.programCard}
              activeOpacity={0.85}
              onPress={() => handleProgramPress(program)}
              accessibilityRole="button"
              accessibilityLabel={`View program: ${program.title}, ${program.subtitle}`}
            >
              <Image source={{ uri: program.thumbnail }} style={s.programThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`${program.title} thumbnail`} />
              <View style={s.programMeta}>
                <Text style={s.programName}>{program.title}</Text>
                <Text style={s.programSub}>{program.subtitle}</Text>
              </View>
              <View style={s.programChevron}>
                <Ionicons name="chevron-forward" size={16} color={CoachColors.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  scroll: { flex: 1 },

  // Hero
  hero: { width: SCREEN_W, height: HERO_H, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroNav: { position: 'absolute', top: 0, left: 12, right: 12 },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 22,
  },
  heroContent: { position: 'absolute', bottom: 28, left: 20, right: 20 },
  heroTagLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textSecondary,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 44,
    color: CoachColors.textPrimary,
    lineHeight: 48,
    letterSpacing: -1.5,
    marginBottom: 8,
  },
  heroSub: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
    letterSpacing: 0.2,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: 20,
    marginVertical: 28,
  },

  sectionPad: { paddingHorizontal: 20 },
  subtitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    lineHeight: 28,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  description: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    lineHeight: 21,
  },

  selectTagLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  selectTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 20,
  },

  // Program cards
  programList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  programCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    overflow: 'hidden',
    gap: 0,
  },
  programThumb: {
    width: 80,
    height: 80,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 0,
  },
  programMeta: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  programName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  programSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
    lineHeight: 17,
  },
  programChevron: {
    paddingRight: 14,
    paddingLeft: 4,
  },
});
