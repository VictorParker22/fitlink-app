import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Dimensions, StatusBar } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
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

function DotIndicator({ isActive }: { isActive: boolean }) {
  const width = useSharedValue(isActive ? 22 : 7);
  const color = useSharedValue(isActive ? '#FF6B35' : 'rgba(255,255,255,0.30)');

  useEffect(() => {
    width.value = withSpring(isActive ? 22 : 7);
    color.value = withTiming(isActive ? '#FF6B35' : 'rgba(255,255,255,0.30)', { duration: 300 });
  }, [isActive]);

  const style = useAnimatedStyle(() => {
    return {
      width: width.value,
      backgroundColor: color.value,
    };
  });

  return <Animated.View style={[styles.dot, style]} />;
}

function AnimatedButton({
  title,
  onPress,
  isPrimary,
}: {
  title: string;
  onPress: () => void;
  isPrimary?: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[isPrimary ? styles.btnSignUp : styles.btnLogin, animatedStyle]}>
      <Pressable
        style={styles.btnPressable}
        onPressIn={() => (scale.value = withSpring(0.95))}
        onPressOut={() => (scale.value = withSpring(1))}
        onPress={onPress}
      >
        <Text style={isPrimary ? styles.btnSignUpText : styles.btnLoginText}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);

  // Animated values for Carousel
  const textOpacity = useSharedValue(1);
  const textY = useSharedValue(0);

  // Animated background scale (Ken Burns)
  const bgScale = useSharedValue(1);

  useEffect(() => {
    // Ken Burns effect
    bgScale.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 12000 }),
        withTiming(1.0, { duration: 12000 })
      ),
      -1,
      false
    );

    // Auto-advance carousel
    const interval = setInterval(() => {
      // Fade out and move up current text
      textOpacity.value = withTiming(0, { duration: 300 });
      textY.value = withTiming(-12, { duration: 300 });

      setTimeout(() => {
        setActiveIndex((i) => (i + 1) % SLIDES.length);
        // Move to bottom for incoming text
        textY.value = 12;
        // Fade in and move to normal position
        textOpacity.value = withTiming(1, { duration: 400 });
        textY.value = withTiming(0, { duration: 400 });
      }, 300); // wait for fade out to complete
    }, SLIDE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const slide = SLIDES[activeIndex];

  const animatedTextStyle = useAnimatedStyle(() => {
    return {
      opacity: textOpacity.value,
      transform: [{ translateY: textY.value }],
    };
  });

  const animatedBgStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: bgScale.value }],
    };
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Full-screen background with Ken Burns ── */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedBgStyle]}>
        <Image
          source={require('../../assets/images/welcome-bg.jpg')}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      </Animated.View>

      {/* ── Multi-stop gradient overlay ── */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.92)']}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Brand name (top) ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.brand}>FITLINK</Text>
      </View>

      {/* ── Content area (bottom 45%) ── */}
      <View style={[styles.bottomContent, { paddingBottom: insets.bottom + 24 }]}>
        {/* Animated headline + sub */}
        <Animated.View style={animatedTextStyle}>
          <Text style={styles.headline}>{slide.headline}</Text>
          <Text style={styles.sub}>{slide.sub}</Text>
        </Animated.View>

        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <DotIndicator key={i} isActive={i === activeIndex} />
          ))}
        </View>

        {/* CTA buttons */}
        <View style={styles.buttonsContainer}>
          <AnimatedButton
            title="SIGN UP"
            isPrimary
            onPress={() => router.push('/(auth)/create-account')}
          />
          <View style={styles.divider} />
          <AnimatedButton title="LOG IN" onPress={() => router.push('/(auth)/login')} />
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
    height: '45%',
    paddingHorizontal: 28,
    justifyContent: 'flex-end',
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
    height: 7,
    borderRadius: 4,
  },

  // ── Buttons ──
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  btnSignUp: {
    flex: 1,
    backgroundColor: '#FF6B35',
  },
  btnLogin: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  btnPressable: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  btnLoginText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.75)',
  },
});
