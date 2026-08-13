import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, StatusBar, Platform, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { CATEGORY_COLORS } from '../../data/categoryColors';
import { PROGRAMS, ProgramData, ProgramLevel, ProgramSession } from '../../data/programs';
import { ClientRoute } from '../../types/routes';

const SCREEN_W = Dimensions.get('window').width;
const HERO_H = 280;



export default function ProgramDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ programId: string }>();

  const program = PROGRAMS.find(p => p.id === params.programId);
  if (!program) return (
    <View style={{ flex: 1, backgroundColor: CoachColors.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <TouchableOpacity onPress={() => router.push(ClientRoute.programs)} style={{ paddingHorizontal: 16, paddingVertical: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={28} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 }}>
          <Ionicons name="barbell-outline" size={48} color={CoachColors.textFaint} />
          <Text style={{ fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary, marginTop: 16 }}>Program not found</Text>
          <Text style={{ fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 8 }}>This program may no longer be available.</Text>
        </View>
      </SafeAreaView>
    </View>
  );

  const [selectedLevel, setSelectedLevel] = useState<ProgramLevel | null>(null);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  // If no level selected, show the level picker on first visit
  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowLevelPicker(true);
  };

  const handleSelectLevel = (level: ProgramLevel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedLevel(level);
    setCurrentWeek(0);
    setShowLevelPicker(false);
  };

  const handleViewSession = (session: ProgramSession) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: ClientRoute.classDetail as any,
      params: {
        id: session.id,
        title: session.title,
        category: session.category,
        level: 'All Levels',
        instructor: session.instructor,
        durationMin: '30',
        thumbnail: session.thumbnail,
        tags: `${session.category},Program`,
      },
    });
  };

  const handleEnroll = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEnrolled(true);
  };

  const weekData = selectedLevel?.weeks[currentWeek];
  const totalWeeks = selectedLevel?.weeks.length || 0;

  // ─── LEVEL PICKER MODAL ─────────────────────────────────
  const renderLevelPicker = () => (
    <Modal visible={showLevelPicker} transparent animationType="slide" onRequestClose={() => setShowLevelPicker(false)}>
      <View style={lp.overlay}>
        <View style={lp.sheet}>
          {/* Drag handle */}
          <View style={lp.handle} />
          <Text style={lp.sheetLabel}>Select program level</Text>

          <View style={lp.divider} />

          <Text style={lp.programName}>{program.title}</Text>

          <View style={lp.divider} />

          {program.levels.map((level) => (
            <TouchableOpacity
              key={level.level}
              style={lp.levelRow}
              activeOpacity={0.85}
              onPress={() => handleSelectLevel(level)}
              accessibilityRole="button"
              accessibilityLabel={`Select level: ${level.label}`}
            >
              <View>
                <Text style={lp.levelLabel}>{level.label}</Text>
                <Text style={lp.levelDesc}>{level.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={CoachColors.textMuted} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={lp.helpBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Help me pick a level">
            <Text style={lp.helpText}>Help me pick</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ─── NO LEVEL SELECTED YET ──────────────────────────────
  if (!selectedLevel) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" />
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
          {/* Hero */}
          <View style={s.hero}>
            <Image source={{ uri: program.heroImage }} style={s.heroImage} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`${program.title} hero image`} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.85)', CoachColors.bg]}
              locations={[0.3, 0.75, 1]}
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={s.heroNav} edges={['top']}>
              <TouchableOpacity onPress={() => router.push(ClientRoute.programs)} style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Go back to programs">
                <Ionicons name="chevron-back" size={28} color={CoachColors.textPrimary} />
              </TouchableOpacity>
              <View style={s.navRight}>
                <TouchableOpacity style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Edit program">
                  <Ionicons name="create-outline" size={22} color={CoachColors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="View calendar">
                  <Ionicons name="calendar-outline" size={22} color={CoachColors.textPrimary} />
                </TouchableOpacity>
              </View>
            </SafeAreaView>
            <View style={s.heroContent}>
              <Text style={s.programLabel}>YOUR PROGRAM</Text>
              <Text style={s.heroTitle} accessibilityRole="header">{program.title}</Text>
            </View>
          </View>

          <View style={s.body}>
            <Text style={s.bodySubtitle}>
              Complete all {program.sessionsPerWeek} required sessions every week for {program.weeksCount} consecutive weeks to complete this program.
            </Text>

            <View style={s.divider} />

            <Text style={s.detailsHeader}>Program details</Text>
            <Text style={s.detailsText} numberOfLines={showFullDetails ? undefined : 4}>
              {program.programDetails}
            </Text>
            <TouchableOpacity onPress={() => setShowFullDetails(!showFullDetails)} style={s.readMoreRow} accessibilityRole="button" accessibilityLabel={showFullDetails ? 'Read less program details' : 'Read more program details'}>
              <Text style={s.readMoreText}>{showFullDetails ? 'Read less' : 'Read more'}</Text>
              <Ionicons name={showFullDetails ? 'chevron-up' : 'chevron-down'} size={16} color={CoachColors.textPrimary} />
            </TouchableOpacity>

            <View style={s.divider} />

            {/* Select Level CTA */}
            <TouchableOpacity style={s.enrollBtn} activeOpacity={0.85} onPress={handleStart} accessibilityRole="button" accessibilityLabel="Select level to start program">
              <Text style={s.enrollText}>Select level to start</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {renderLevelPicker()}
      </View>
    );
  }

  // ─── LEVEL SELECTED — SHOW WEEK VIEW ────────────────────
  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        {/* Hero */}
        <View style={s.hero}>
          <Image source={{ uri: program.heroImage }} style={s.heroImage} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`${program.title} hero image`} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)', '#000']}
            locations={[0.3, 0.75, 1]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={s.heroNav} edges={['top']}>
            <TouchableOpacity onPress={() => router.push(ClientRoute.programs)} style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Go back to programs">
              <Ionicons name="chevron-back" size={28} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <Text style={s.navTitle}>{program.title}</Text>
            <View style={s.navRight}>
              <TouchableOpacity style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Edit program">
                <Ionicons name="create-outline" size={22} color={CoachColors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="View calendar">
                <Ionicons name="calendar-outline" size={22} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          <View style={s.heroContent}>
            <Text style={s.programLabel}>YOUR PROGRAM</Text>
            <Text style={s.heroTitle} accessibilityRole="header">{program.title}</Text>
          </View>
        </View>

        <View style={s.body}>
          <Text style={s.bodySubtitle}>
            Complete all {program.sessionsPerWeek} required sessions every week for {program.weeksCount} consecutive weeks to complete this program.
          </Text>

          {/* Week navigation */}
          <View style={s.weekNav}>
            <Text style={s.weekLabel}>WEEK  {currentWeek + 1}</Text>
            <View style={s.weekArrows}>
              <TouchableOpacity
                onPress={() => { if (currentWeek > 0) { setCurrentWeek(currentWeek - 1); Haptics.selectionAsync(); } }}
                style={[s.weekArrowBtn, currentWeek === 0 && s.weekArrowDisabled]}
                disabled={currentWeek === 0}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
              >
                <Ionicons name="chevron-back" size={20} color={currentWeek === 0 ? CoachColors.textFaint : CoachColors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (currentWeek < totalWeeks - 1) { setCurrentWeek(currentWeek + 1); Haptics.selectionAsync(); } }}
                style={[s.weekArrowBtn, currentWeek === totalWeeks - 1 && s.weekArrowDisabled]}
                disabled={currentWeek === totalWeeks - 1}
                accessibilityRole="button"
                accessibilityLabel="Next week"
              >
                <Ionicons name="chevron-forward" size={20} color={currentWeek === totalWeeks - 1 ? CoachColors.textFaint : CoachColors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Program details (collapsible) */}
          <Text style={s.detailsHeader}>Program details</Text>
          <Text style={s.detailsText} numberOfLines={showFullDetails ? undefined : 3}>
            {program.programDetails}
          </Text>
          <TouchableOpacity onPress={() => setShowFullDetails(!showFullDetails)} style={s.readMoreRow} accessibilityRole="button" accessibilityLabel={showFullDetails ? 'Read less program details' : 'Read more program details'}>
            <Text style={s.readMoreText}>{showFullDetails ? 'Read less' : 'Read more'}</Text>
            <Ionicons name={showFullDetails ? 'chevron-up' : 'chevron-down'} size={16} color={CoachColors.textPrimary} />
          </TouchableOpacity>

          {/* Required Sessions */}
          <Text style={s.sectionTitle}>Required sessions</Text>

          {weekData?.requiredSessions.map((session) => (
            <View key={session.id} style={s.sessionCard}>
              <Image source={{ uri: session.thumbnail }} style={s.sessionThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`${session.title} thumbnail`} />
              <View style={s.sessionMeta}>
                <Text style={s.sessionName} numberOfLines={2}>{session.title}</Text>
                <Text style={s.sessionInfo}>
                  <Text style={{ color: CATEGORY_COLORS[session.category] || CoachColors.textSecondary }}>{session.category}</Text>
                  {'  •  '}{session.instructor}
                </Text>
              </View>
              <TouchableOpacity style={s.viewBtn} activeOpacity={0.85} onPress={() => handleViewSession(session)} accessibilityRole="button" accessibilityLabel={`View session: ${session.title}`}>
                <Text style={s.viewBtnText}>View</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Optional Sessions */}
          {weekData && weekData.optionalSessions.length > 0 && (
            <>
              <View style={s.divider} />
              <Text style={s.optionalTitle}>Optional</Text>
              <Text style={s.optionalDesc}>Add on sessions for an extra boost.</Text>

              {weekData.optionalSessions.map((session) => (
                <View key={session.id} style={s.sessionCard}>
                  <Image source={{ uri: session.thumbnail }} style={s.sessionThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`${session.title} thumbnail`} />
                  <View style={s.sessionMeta}>
                    <Text style={s.sessionName} numberOfLines={2}>{session.title}</Text>
                    <Text style={s.sessionInfo}>
                      <Text style={{ color: CATEGORY_COLORS[session.category] || CoachColors.textSecondary }}>{session.category}</Text>
                      {'  •  '}{session.instructor}
                    </Text>
                  </View>
                  <TouchableOpacity style={s.viewBtn} activeOpacity={0.85} onPress={() => handleViewSession(session)} accessibilityRole="button" accessibilityLabel={`View session: ${session.title}`}>
                    <Text style={s.viewBtnText}>View</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* Enroll button */}
          <TouchableOpacity
            style={[s.enrollBtn, enrolled && s.enrolledBtn]}
            activeOpacity={0.85}
            onPress={handleEnroll}
            disabled={enrolled}
            accessibilityRole="button"
            accessibilityLabel={enrolled ? 'Enrolled in program' : 'Enroll in program'}
          >
            <Text style={[s.enrollText, enrolled && s.enrolledText]}>
              {enrolled ? 'Enrolled' : 'Enroll now'}
            </Text>
          </TouchableOpacity>

          {/* Change level */}
          <TouchableOpacity style={s.changeLevelBtn} activeOpacity={0.85} onPress={handleStart} accessibilityRole="button" accessibilityLabel={`Change level, currently ${selectedLevel.label}`}>
            <Text style={s.changeLevelText}>Change level ({selectedLevel.label})</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {renderLevelPicker()}
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
  heroNav: {
    position: 'absolute', top: 0, left: 12, right: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navRight: { flexDirection: 'row', gap: 4 },
  navTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary, flex: 1, textAlign: 'center' },
  heroContent: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  programLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textMuted,
    letterSpacing: 2, marginBottom: 8,
  },
  heroTitle: { fontFamily: CoachFonts.headingBold, fontSize: 30, color: CoachColors.textPrimary, lineHeight: 36 },

  // Body
  body: { paddingHorizontal: 20, paddingTop: 20 },
  bodySubtitle: {
    fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary,
    lineHeight: 22, marginBottom: 8,
  },

  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: CoachColors.borderMuted,
    marginVertical: 24,
  },

  // Week nav
  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20,
  },
  weekLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textSecondary, letterSpacing: 2 },
  weekArrows: { flexDirection: 'row', gap: 8 },
  weekArrowBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  weekArrowDisabled: { opacity: 0.4 },

  // Details
  detailsHeader: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, marginBottom: 10 },
  detailsText: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary, lineHeight: 22 },
  readMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, marginBottom: 24 },
  readMoreText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary, textDecorationLine: 'underline' },

  // Sessions
  sectionTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, marginBottom: 16 },
  sessionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CoachColors.borderMuted,
  },
  sessionThumb: { width: 80, height: 60, borderRadius: 6, backgroundColor: CoachColors.surface },
  sessionMeta: { flex: 1 },
  sessionName: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary, lineHeight: 20, marginBottom: 4 },
  sessionInfo: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },
  viewBtn: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 6,
    paddingHorizontal: 16, paddingVertical: 7,
  },
  viewBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },

  // Optional
  optionalTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, marginBottom: 6 },
  optionalDesc: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginBottom: 14 },

  // Enroll
  enrollBtn: {
    backgroundColor: CoachColors.accent, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: CoachColors.accent, borderRadius: 999,
    marginTop: 28,
  },
  enrollText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 16, color: CoachColors.onAccent },
  enrolledBtn: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  enrolledText: { color: CoachColors.accent },

  changeLevelBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  changeLevelText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, textDecorationLine: 'underline' },
});

// ─── LEVEL PICKER STYLES ─────────────────────────────────
const lp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CoachColors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: CoachColors.border,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetLabel: {
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary,
    textAlign: 'center', marginBottom: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: CoachColors.borderMuted,
    marginHorizontal: 20, marginVertical: 20,
  },
  programName: {
    fontFamily: CoachFonts.headingBold, fontSize: 24, color: CoachColors.textPrimary,
    textAlign: 'center',
  },
  levelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CoachColors.borderMuted,
  },
  levelLabel: { fontFamily: CoachFonts.headingSemiBold, fontSize: 16, color: CoachColors.textPrimary, marginBottom: 4 },
  levelDesc: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },
  helpBtn: {
    marginHorizontal: 20, marginTop: 24, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: CoachColors.border,
  },
  helpText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 16, color: CoachColors.textPrimary },
});
