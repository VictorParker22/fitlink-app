import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  Animated, StatusBar, ScrollView, Platform, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useReducedMotion } from '../../lib/useReducedMotion';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Real fitness Unsplash photos — varied disciplines
const PHOTO_CARDS = [
  { id: '1', uri: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=500&q=85' },
  { id: '2', uri: 'https://images.unsplash.com/photo-1534367507873-d2d7e24c797f?w=500&q=85' },
  { id: '3', uri: 'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?w=500&q=85' },
  { id: '4', uri: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=500&q=85' },
];

const CARD_W = SCREEN_WIDTH * 0.36;
const TOP_H = SCREEN_HEIGHT * 0.50;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // ── Animation values
  const logoY = useRef(new Animated.Value(-24)).current;
  const logoOp = useRef(new Animated.Value(0)).current;
  const cardsOp = useRef(new Animated.Value(0)).current;
  const cardsY = useRef(new Animated.Value(24)).current;
  const sheetY = useRef(new Animated.Value(80)).current;
  const sheetOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      // Jump straight to the settled layout — no drop/rise/slide sequence.
      logoY.setValue(0);
      logoOp.setValue(1);
      cardsOp.setValue(1);
      cardsY.setValue(0);
      sheetY.setValue(0);
      sheetOp.setValue(1);
      return;
    }
    Animated.sequence([
      // 1. Logo drops in
      Animated.parallel([
        Animated.timing(logoOp, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(logoY, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
      // 2. Cards rise
      Animated.parallel([
        Animated.timing(cardsOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(cardsY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      // 3. Sheet slides up
      Animated.parallel([
        Animated.timing(sheetOp, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(sheetY, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
    ]).start();
  }, [reduceMotion]);

  const goTrainer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(auth)/coach-signup' as any);
  };

  const goClient = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(auth)/client-signup' as any);
  };

  const goSignIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ═══════════════════════════════════════════
          TOP — Pure black with scrolling photo strip
      ═══════════════════════════════════════════ */}
      <View style={[styles.topSection, { height: TOP_H, paddingTop: insets.top + 8 }]}>

        {/* Logo row */}
        <Animated.View
          style={[
            styles.logoRow,
            { opacity: logoOp, transform: [{ translateY: logoY }] },
          ]}
        >
          <Image
            source={require('../../assets/images/icon.png')}
            style={styles.logoMark}
            resizeMode="contain"
          />
          <View style={styles.logoTextBlock}>
            <Text style={styles.logoName}>FitLink</Text>
            <Text style={styles.logoTagline}>The coaching platform</Text>
          </View>
        </Animated.View>

        {/* Photo cards strip */}
        <Animated.View
          style={[styles.cardsArea, { opacity: cardsOp, transform: [{ translateY: cardsY }] }]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsRow}
            decelerationRate="fast"
            snapToInterval={CARD_W + 10}
          >
            {PHOTO_CARDS.map((card, i) => (
              <View
                key={card.id}
                style={[
                  styles.photoCard,
                  i % 2 === 0 ? styles.cardLow : styles.cardHigh,
                ]}
              >
                <Image
                  source={{ uri: card.uri }}
                  style={styles.photoImg}
                  resizeMode="cover"
                />
                {/* Gold accent bar at top of each card */}
                <View style={styles.cardAccentBar} />
              </View>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Bottom fade into sheet */}
        <LinearGradient
          colors={['transparent', CoachColors.bg]}
          style={styles.bottomFade}
          pointerEvents="none"
        />
      </View>

      {/* ═══════════════════════════════════════════
          BOTTOM — Brutalist luxury sheet
      ═══════════════════════════════════════════ */}
      <Animated.View
        style={[
          styles.sheet,
          {
            opacity: sheetOp,
            transform: [{ translateY: sheetY }],
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {/* Section tag header */}
        <Text style={styles.tagHeader}>Who are you?</Text>
        <Text style={styles.sheetTitle}>Choose your path</Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Trainer row */}
        <TouchableOpacity
          style={styles.roleRow}
          onPress={goTrainer}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="I'm a trainer — set up your business"
        >
          {/* Icon block */}
          <View style={[styles.roleIcon, { borderColor: CoachColors.accent }]}>
            <Ionicons name="barbell-outline" size={22} color={CoachColors.accent} />
          </View>
          <View style={styles.roleText}>
            <Text style={styles.roleTitle}>I'm a trainer</Text>
            <Text style={styles.roleSub}>Set up your business in 4 minutes</Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={CoachColors.textFaint} />
        </TouchableOpacity>

        <View style={styles.rowDivider} />

        {/* Client row */}
        <TouchableOpacity
          style={styles.roleRow}
          onPress={goClient}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="I'm a client — join or find a trainer"
        >
          <View style={[styles.roleIcon, { borderColor: CoachColors.textPrimary }]}>
            <Ionicons name="person-outline" size={22} color={CoachColors.textPrimary} />
          </View>
          <View style={styles.roleText}>
            <Text style={styles.roleTitle}>I'm a client</Text>
            <Text style={styles.roleSub}>Join or find your trainer</Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={CoachColors.textFaint} />
        </TouchableOpacity>

        <View style={styles.rowDivider} />

        {/* Already have account */}
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={goSignIn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Sign in to existing account"
        >
          <Text style={styles.signInText}>I already have an account</Text>
          <Ionicons name="log-in-outline" size={17} color={CoachColors.accent} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },

  // ── TOP SECTION ──────────────────────────────
  topSection: {
    backgroundColor: CoachColors.bg,
    overflow: 'hidden',
  },

  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  logoTextBlock: {
    gap: 2,
  },
  logoName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
    letterSpacing: 5,
    textTransform: 'uppercase',
  },
  logoTagline: {
    fontFamily: CoachFonts.body,
    fontSize: 10,
    color: CoachColors.accent,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  // ── PHOTO CARDS ──────────────────────────────
  cardsArea: {
    flex: 1,
  },
  cardsRow: {
    paddingLeft: 20,
    paddingRight: 12,
    alignItems: 'flex-end',
    gap: 10,
  },
  photoCard: {
    width: CARD_W,
    borderRadius: 4,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  cardLow: {
    height: SCREEN_HEIGHT * 0.23,
    marginBottom: 20,
  },
  cardHigh: {
    height: SCREEN_HEIGHT * 0.29,
    marginBottom: 0,
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  cardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: CoachColors.accent,
  },

  // Fades into the dark bottom
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },

  // ── BOTTOM SHEET ─────────────────────────────
  sheet: {
    flex: 1,
    backgroundColor: CoachColors.bg,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
    paddingHorizontal: 24,
    paddingTop: 32,
  },

  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.accent,
    letterSpacing: 2.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  sheetTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 33.5,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 28,
  },

  divider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginBottom: 0,
  },

  // ── ROLE ROWS ────────────────────────────────
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 22,
    gap: 18,
  },
  roleIcon: {
    width: 50,
    height: 50,
    borderRadius: 4,
    borderCurve: 'continuous',
    borderWidth: 1,
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleText: {
    flex: 1,
    gap: 5,
  },
  roleTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  roleSub: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
    letterSpacing: 0.2,
  },

  rowDivider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
  },

  // ── SIGN IN ──────────────────────────────────
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
  },
  signInText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textSecondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
