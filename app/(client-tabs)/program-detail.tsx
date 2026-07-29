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
import { FontFamily } from '../../constants/theme';
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
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <TouchableOpacity onPress={() => router.push(ClientRoute.programs)} style={{ paddingHorizontal: 16, paddingVertical: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 }}>
          <Ionicons name="barbell-outline" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={{ fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFFFFF', marginTop: 16 }}>Program Not Found</Text>
          <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>This program may no longer be available.</Text>
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
          <Text style={lp.sheetLabel}>Select Program Level</Text>

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
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={lp.helpBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Help me pick a level">
            <Text style={lp.helpText}>Help Me Pick</Text>
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
              colors={['transparent', 'rgba(0,0,0,0.85)', '#000']}
              locations={[0.3, 0.75, 1]}
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={s.heroNav} edges={['top']}>
              <TouchableOpacity onPress={() => router.push(ClientRoute.programs)} style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Go back to programs">
                <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={s.navRight}>
                <TouchableOpacity style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Edit program">
                  <Ionicons name="create-outline" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="View calendar">
                  <Ionicons name="calendar-outline" size={22} color="#FFFFFF" />
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

            <Text style={s.detailsHeader}>Program Details</Text>
            <Text style={s.detailsText} numberOfLines={showFullDetails ? undefined : 4}>
              {program.programDetails}
            </Text>
            <TouchableOpacity onPress={() => setShowFullDetails(!showFullDetails)} style={s.readMoreRow} accessibilityRole="button" accessibilityLabel={showFullDetails ? 'Read less program details' : 'Read more program details'}>
              <Text style={s.readMoreText}>{showFullDetails ? 'Read Less' : 'Read More'}</Text>
              <Ionicons name={showFullDetails ? 'chevron-up' : 'chevron-down'} size={16} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={s.divider} />

            {/* Select Level CTA */}
            <TouchableOpacity style={s.enrollBtn} activeOpacity={0.85} onPress={handleStart} accessibilityRole="button" accessibilityLabel="Select level to start program">
              <Text style={s.enrollText}>Select Level to Start</Text>
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
              <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={s.navTitle}>{program.title}</Text>
            <View style={s.navRight}>
              <TouchableOpacity style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Edit program">
                <Ionicons name="create-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="View calendar">
                <Ionicons name="calendar-outline" size={22} color="#FFFFFF" />
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
                <Ionicons name="chevron-back" size={20} color={currentWeek === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)'} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (currentWeek < totalWeeks - 1) { setCurrentWeek(currentWeek + 1); Haptics.selectionAsync(); } }}
                style={[s.weekArrowBtn, currentWeek === totalWeeks - 1 && s.weekArrowDisabled]}
                disabled={currentWeek === totalWeeks - 1}
                accessibilityRole="button"
                accessibilityLabel="Next week"
              >
                <Ionicons name="chevron-forward" size={20} color={currentWeek === totalWeeks - 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Program details (collapsible) */}
          <Text style={s.detailsHeader}>Program Details</Text>
          <Text style={s.detailsText} numberOfLines={showFullDetails ? undefined : 3}>
            {program.programDetails}
          </Text>
          <TouchableOpacity onPress={() => setShowFullDetails(!showFullDetails)} style={s.readMoreRow} accessibilityRole="button" accessibilityLabel={showFullDetails ? 'Read less program details' : 'Read more program details'}>
            <Text style={s.readMoreText}>{showFullDetails ? 'Read Less' : 'Read More'}</Text>
            <Ionicons name={showFullDetails ? 'chevron-up' : 'chevron-down'} size={16} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Required Sessions */}
          <Text style={s.sectionTitle}>Required Sessions</Text>

          {weekData?.requiredSessions.map((session) => (
            <View key={session.id} style={s.sessionCard}>
              <Image source={{ uri: session.thumbnail }} style={s.sessionThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`${session.title} thumbnail`} />
              <View style={s.sessionMeta}>
                <Text style={s.sessionName} numberOfLines={2}>{session.title}</Text>
                <Text style={s.sessionInfo}>
                  <Text style={{ color: CATEGORY_COLORS[session.category] || '#5B7FFF' }}>{session.category}</Text>
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
              <Text style={s.optionalDesc}>Add on Sessions for an extra boost.</Text>

              {weekData.optionalSessions.map((session) => (
                <View key={session.id} style={s.sessionCard}>
                  <Image source={{ uri: session.thumbnail }} style={s.sessionThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`${session.title} thumbnail`} />
                  <View style={s.sessionMeta}>
                    <Text style={s.sessionName} numberOfLines={2}>{session.title}</Text>
                    <Text style={s.sessionInfo}>
                      <Text style={{ color: CATEGORY_COLORS[session.category] || '#5B7FFF' }}>{session.category}</Text>
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
              {enrolled ? 'Enrolled ✓' : 'Enroll now'}
            </Text>
          </TouchableOpacity>

          {/* Change level */}
          <TouchableOpacity style={s.changeLevelBtn} activeOpacity={0.85} onPress={handleStart} accessibilityRole="button" accessibilityLabel={`Change level, currently ${selectedLevel.label}`}>
            <Text style={s.changeLevelText}>Change Level ({selectedLevel.label})</Text>
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
  container: { flex: 1, backgroundColor: '#000' },
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
  navTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 15, color: '#FFFFFF', flex: 1, textAlign: 'center' },
  heroContent: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  programLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2, marginBottom: 8,
  },
  heroTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 30, color: '#FFFFFF', lineHeight: 36 },

  // Body
  body: { paddingHorizontal: 20, paddingTop: 20 },
  bodySubtitle: {
    fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.55)',
    lineHeight: 22, marginBottom: 8,
  },

  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 24,
  },

  // Week nav
  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20,
  },
  weekLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: 2 },
  weekArrows: { flexDirection: 'row', gap: 8 },
  weekArrowBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  weekArrowDisabled: { opacity: 0.4 },

  // Details
  detailsHeader: { fontFamily: FontFamily.headingSemiBold, fontSize: 17, color: '#FFFFFF', marginBottom: 10 },
  detailsText: { fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 22 },
  readMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, marginBottom: 24 },
  readMoreText: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: '#FFFFFF', textDecorationLine: 'underline' },

  // Sessions
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 17, color: '#FFFFFF', marginBottom: 16 },
  sessionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sessionThumb: { width: 80, height: 60, borderRadius: 6, backgroundColor: '#1A1A1A' },
  sessionMeta: { flex: 1 },
  sessionName: { fontFamily: FontFamily.headingSemiBold, fontSize: 15, color: '#FFFFFF', lineHeight: 20, marginBottom: 4 },
  sessionInfo: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  viewBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 6,
    paddingHorizontal: 16, paddingVertical: 7,
  },
  viewBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: '#FFFFFF' },

  // Optional
  optionalTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 17, color: '#FFFFFF', marginBottom: 6 },
  optionalDesc: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 14 },

  // Enroll
  enrollBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 0,
    marginTop: 28,
  },
  enrollText: { fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: '#FFFFFF' },
  enrolledBtn: { backgroundColor: 'rgba(102,187,106,0.15)', borderColor: '#66BB6A' },
  enrolledText: { color: '#66BB6A' },

  changeLevelBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  changeLevelText: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecorationLine: 'underline' },
});

// ─── LEVEL PICKER STYLES ─────────────────────────────────
const lp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#111', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 20,
  },
  sheetLabel: {
    fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', marginBottom: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 20, marginVertical: 20,
  },
  programName: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 24, color: '#FFFFFF',
    textAlign: 'center',
  },
  levelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  levelLabel: { fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: '#FFFFFF', marginBottom: 4 },
  levelDesc: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  helpBtn: {
    marginHorizontal: 20, marginTop: 24, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  helpText: { fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: '#FFFFFF' },
});
