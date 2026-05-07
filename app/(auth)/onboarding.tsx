import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Image, TouchableOpacity,
  FlatList, Animated, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    image: require('../../assets/images/onboard-1.png'),
    title: 'Manage Your Clients',
    subtitle: 'Keep your entire roster organized in one place. Track sessions, progress, goals, and status — all at a glance.',
    accent: Colors.accent,
  },
  {
    id: '2',
    image: require('../../assets/images/onboard-2.png'),
    title: 'Workouts & Messaging',
    subtitle: 'Build custom workouts, assign them to clients, and stay connected with real-time chat — no more scattered texts.',
    accent: Colors.blue,
  },
  {
    id: '3',
    image: require('../../assets/images/onboard-3.png'),
    title: 'Grow Your Business',
    subtitle: 'Track referrals, view analytics, manage subscriptions, and watch your coaching business scale.',
    accent: Colors.green,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const completeOnboarding = useCallback(async () => {
    await SecureStore.setItemAsync('fitlink_onboarded', 'true');
    router.replace('/(auth)/login');
  }, [router]);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      completeOnboarding();
    }
  };

  const isLastSlide = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip button */}
      <View style={styles.skipRow}>
        {!isLastSlide ? (
          <TouchableOpacity onPress={completeOnboarding} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => (
          <View style={styles.slide}>
            <View style={styles.imageContainer}>
              <View style={[styles.imageGlow, { backgroundColor: `${item.accent}10` }]} />
              <Image source={item.image} style={styles.image} resizeMode="contain" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          </View>
        )}
      />

      {/* Bottom controls */}
      <View style={styles.bottomSection}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((slide, i) => {
            const inputRange = [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH];

            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 28, 8],
              extrapolate: 'clamp',
            });

            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });

            const dotColor = scrollX.interpolate({
              inputRange,
              outputRange: [Colors.textTertiary, slide.accent, Colors.textTertiary],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, opacity: dotOpacity, backgroundColor: dotColor }]}
              />
            );
          })}
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: SLIDES[currentIndex].accent }]}
          activeOpacity={0.8}
          onPress={handleNext}
        >
          <Text style={styles.ctaText}>
            {isLastSlide ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  skipRow: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  skipText: {
    fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base,
    color: Colors.textTertiary,
  },

  slide: { width: SCREEN_WIDTH, flex: 1, justifyContent: 'center' },

  imageContainer: {
    alignItems: 'center', justifyContent: 'center',
    height: SCREEN_WIDTH * 0.7, marginBottom: Spacing.xl,
  },
  imageGlow: {
    position: 'absolute', width: SCREEN_WIDTH * 0.65, height: SCREEN_WIDTH * 0.65,
    borderRadius: SCREEN_WIDTH * 0.35,
  },
  image: {
    width: SCREEN_WIDTH * 0.7, height: SCREEN_WIDTH * 0.7,
  },

  textContainer: {
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28, color: Colors.textPrimary,
    textAlign: 'center', letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
    marginTop: Spacing.md,
    maxWidth: 300,
  },

  bottomSection: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },

  dotsRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 6,
  },
  dot: {
    height: 8, borderRadius: 4,
  },

  ctaButton: {
    height: 54, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.md, color: Colors.white,
  },
});
