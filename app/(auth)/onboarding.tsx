import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Image, TouchableOpacity,
  FlatList, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_HEIGHT * 0.58;
const CARD_OVERLAP = 36;

const SLIDES = [
  {
    id: '1',
    image: require('../../assets/images/welcome-1.png'),
    title: 'Welcome To\nFitLink!',
    subtitle: 'Your personal fitness coaching platform',
    isFirst: true,
  },
  {
    id: '2',
    image: require('../../assets/images/welcome-2.png'),
    title: 'Manage Clients\n& Sessions',
    subtitle: 'Organize your roster, schedule, and workouts in one place',
    isFirst: false,
  },
  {
    id: '3',
    image: require('../../assets/images/welcome-3.png'),
    title: 'Grow Your\nFitness Business',
    subtitle: 'Track referrals, analytics, and revenue growth',
    isFirst: false,
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

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true });
    }
  };

  return (
    <View style={styles.container}>
      {/* Full-bleed image slides */}
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
        renderItem={({ item }) => (
          <View style={styles.slideImageWrapper}>
            <Image source={item.image} style={styles.slideImage} resizeMode="cover" />
            {/* Dark gradient at bottom of image */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.6)']}
              locations={[0.3, 0.7, 1]}
              style={styles.imageGradient}
            />
            {/* Logo on first slide */}
            {item.isFirst && (
              <View style={styles.logoOverImage}>
                <View style={styles.logoCross}>
                  <Ionicons name="add" size={20} color={Colors.white} />
                </View>
              </View>
            )}
          </View>
        )}
      />

      {/* White card panel overlapping the image */}
      <View style={styles.cardPanel}>
        {/* Animated content per slide */}
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{SLIDES[currentIndex].title}</Text>
          <Text style={styles.cardSubtitle}>{SLIDES[currentIndex].subtitle}</Text>
        </View>

        {/* First slide: Get Started button */}
        {currentIndex === 0 ? (
          <View style={styles.firstSlideActions}>
            <TouchableOpacity style={styles.getStartedBtn} activeOpacity={0.85} onPress={goNext}>
              <Text style={styles.getStartedText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.white} />
            </TouchableOpacity>

            <TouchableOpacity onPress={completeOnboarding}>
              <Text style={styles.signInLink}>
                Already have account? <Text style={styles.signInLinkAccent}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Other slides: arrow navigation */
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
              onPress={goPrev}
              disabled={currentIndex === 0}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color={currentIndex === 0 ? Colors.textTertiary : Colors.textPrimary} />
            </TouchableOpacity>

            {/* Dots */}
            <View style={styles.dotsRow}>
              {SLIDES.map((_, i) => {
                const inputRange = [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH];
                const dotWidth = scrollX.interpolate({
                  inputRange,
                  outputRange: [6, 20, 6],
                  extrapolate: 'clamp',
                });
                const dotOpacity = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.25, 1, 0.25],
                  extrapolate: 'clamp',
                });
                return (
                  <Animated.View
                    key={i}
                    style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]}
                  />
                );
              })}
            </View>

            {currentIndex < SLIDES.length - 1 ? (
              <TouchableOpacity style={styles.navBtn} onPress={goNext} activeOpacity={0.7}>
                <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.navBtnAccent} onPress={completeOnboarding} activeOpacity={0.85}>
                <Ionicons name="arrow-forward" size={20} color={Colors.white} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  // Image slides
  slideImageWrapper: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: IMAGE_HEIGHT * 0.5,
  },
  logoOverImage: {
    position: 'absolute',
    top: 60,
    left: Spacing.xl,
  },
  logoCross: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // White card panel
  cardPanel: {
    flex: 1,
    backgroundColor: Colors.white,
    marginTop: -CARD_OVERLAP,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing.xl,
    justifyContent: 'space-between',
    // Shadow on the card
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },

  cardContent: {},
  cardTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 30,
    color: Colors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  cardSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    lineHeight: 21,
  },

  // First slide actions
  firstSlideActions: {
    gap: Spacing.lg,
  },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingVertical: 15,
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  getStartedText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.md,
    color: Colors.white,
  },
  signInLink: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  signInLinkAccent: {
    fontFamily: FontFamily.bodySemiBold,
    color: Colors.accentText,
    textDecorationLine: 'underline',
  },

  // Navigation arrows
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnAccent: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textPrimary,
  },
});
