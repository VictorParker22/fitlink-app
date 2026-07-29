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
import { FontFamily } from '../../constants/theme';
import { ClientRoute } from '../../types/routes';
import { ProgramData, PROGRAMS } from '../../data/programs';

const SCREEN_W = Dimensions.get('window').width;
const HERO_H = 320;

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
            colors={['transparent', 'rgba(0,0,0,0.85)', '#000'] as const}
            locations={[0.3, 0.75, 1]}
            style={s.heroGradient}
            accessible={false}
          />

          {/* Back button */}
          <SafeAreaView style={s.heroNav} edges={['top']}>
            <TouchableOpacity
              onPress={() => router.push(ClientRoute.workouts)}
              style={s.navBtn}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Go back to workouts"
            >
              <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </SafeAreaView>

          {/* Title overlay */}
          <View style={s.heroContent}>
            <Text style={s.heroTitle} accessibilityRole="header">Programs{'\n'}by FitLink</Text>
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
          <Text style={s.selectTitle}>Select a Self-Guided Program to Start</Text>
        </View>

        {PROGRAMS.map((program) => (
          <TouchableOpacity
            key={program.id}
            style={s.programRow}
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
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>
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
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroNav: { position: 'absolute', top: 0, left: 12, right: 12 },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heroContent: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  heroTitle: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 34, color: '#FFFFFF', lineHeight: 40,
  },

  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 20, marginVertical: 28,
  },

  sectionPad: { paddingHorizontal: 20 },
  subtitle: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 20, color: '#FFFFFF',
    lineHeight: 28, marginBottom: 16,
  },
  description: {
    fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.5)',
    lineHeight: 22,
  },
  selectTitle: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFFFFF',
    marginBottom: 20,
  },

  // Program row
  programRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingVertical: 16, gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  programThumb: { width: 72, height: 72, borderRadius: 6, backgroundColor: '#1A1A1A' },
  programMeta: { flex: 1 },
  programName: { fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: '#FFFFFF', marginBottom: 4 },
  programSub: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.45)' },
});
