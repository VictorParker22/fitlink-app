import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Dimensions,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W, height: H } = Dimensions.get('window');

// ─── Carousel slides ──────────────────────────────────────────────────────────
const SLIDES = [
  {
    headline: 'TRAIN SMARTER,\nNOT HARDER',
    sub: 'Your personal coach, your goals, your schedule — all in one place.',
  },
  {
    headline: 'CONNECT WITH\nELITE COACHES',
    sub: 'Get matched with certified trainers who push you to your peak.',
  },
  {
    headline: 'TRACK EVERY\nREP & RESULT',
    sub: 'Real-time progress rings, streaks, and milestones keep you accountable.',
  },
  {
    headline: 'GO LIVE,\nANYWHERE',
    sub: 'Join live sessions or train on-demand — at the gym, at home, any time.',
  },
  {
    headline: 'A NEW WORLD\nOF TRAINING',
    sub: 'The future of fitness coaching is here. Ready to start?',
  },
];

const SLIDE_INTERVAL = 3800;

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);

  // Animated values
  const textOpacity = useRef(new Animated.Value(1)).current;
  const textY = useRef(new Animated.Value(0)).current;
  const bgScale = useRef(new Animated.Value(1)).current;

  // Auto-advance carousel
  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out current text
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(textY, { toValue: -12, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        setActiveIndex(i => (i + 1) % SLIDES.length);
        textY.setValue(12);
        // Fade new text in
        Animated.parallel([
          Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(textY, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start();
      });
    }, SLIDE_INTERVAL);

    // Subtle Ken Burns on background
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgScale, { toValue: 1.06, duration: SLIDE_INTERVAL * SLIDES.length / 2, useNativeDriver: true }),
        Animated.timing(bgScale, { toValue: 1.0, duration: SLIDE_INTERVAL * SLIDES.length / 2, useNativeDriver: true }),
      ])
    ).start();

    return () => clearInterval(interval);
  }, []);

  const slide = SLIDES[activeIndex];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Full-screen background with Ken Burns ── */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: bgScale }] }]}>
        <ImageBackground
          source={require('../../assets/images/welcome-bg.png')}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      </Animated.View>

      {/* ── Multi-stop gradient overlay ── */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.15)',
          'rgba(0,0,0,0.05)',
          'rgba(0,0,0,0.50)',
          'rgba(0,0,0,0.88)',
        ]}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Brand name (top) ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.brand}>FITLINK</Text>
      </View>

      {/* ── Content area (bottom) ── */}
      <View style={[styles.bottomContent, { paddingBottom: insets.bottom + 24 }]}>

        {/* Animated headline + sub */}
        <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textY }] }}>
          <Text style={styles.headline}>{slide.headline}</Text>
          <Text style={styles.sub}>{slide.sub}</Text>
        </Animated.View>

        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                i === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* CTA buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.btnSignUp}
            activeOpacity={0.85}
            onPress={() => router.push('/(auth)/create-account')}
          >
            <Text style={styles.btnSignUpText}>SIGN UP</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.btnLogin}
            activeOpacity={0.85}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.btnLoginText}>LOG IN</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Top bar ──
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  brand: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    letterSpacing: 6,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  // ── Bottom content ──
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
  },
  headline: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 1.5,
    color: '#FFFFFF',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  sub: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 28,
  },

  // ── Dots ──
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 32,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 20,
    borderRadius: 4,
  },

  // ── Buttons ──
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    backdropFilter: 'blur(12px)', // web hint, RN ignores gracefully
  },
  btnSignUp: {
    flex: 1,
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnSignUpText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    letterSpacing: 3,
    color: '#FFFFFF',
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  btnLogin: {
    flex: 1,
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnLoginText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.75)',
  },
});
