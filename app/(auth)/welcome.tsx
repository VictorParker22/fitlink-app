import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, Pressable, StatusBar } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * FitLink landing — design #15a "PROOF": show the product, not a pitch.
 *
 * A real card floats over the coach photo — today's session + a nudge
 * prompt — instead of a rotating carousel of athlete-facing marketing
 * copy. Single primary action ("Start coaching on FitLink") straight into
 * coach signup; the athlete fork is a quiet text link, not a second button.
 */

const BG = '#101210';
const ACCENT = '#C6F24E';
const TEXT_PRIMARY = '#EDEFE8';
const TEXT_SECONDARY = '#9BA095';
const TEXT_MUTED = '#8A8F85';

function AnimatedPrimaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.primaryBtn, style]}>
      <Pressable
        style={styles.primaryBtnPressable}
        onPressIn={() => (scale.value = withSpring(0.97))}
        onPressOut={() => (scale.value = withSpring(1))}
        onPress={onPress}
      >
        <Text style={styles.primaryBtnText}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const cardIn = useSharedValue(0);
  const contentIn = useSharedValue(0);

  useEffect(() => {
    contentIn.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
    cardIn.value = withDelay(
      160,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentIn.value,
    transform: [{ translateY: (1 - contentIn.value) * 14 }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardIn.value,
    transform: [{ translateY: (1 - cardIn.value) * 22 }],
  }));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <Image
        source={require('../../assets/images/welcome-bg.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />

      {/* Multi-stop scrim: photo reads at the top, resolves to solid #101210 by
          the point the card and copy start, matching the design's gradient. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(16,18,16,0.2)', 'rgba(16,18,16,0.55)', 'rgba(16,18,16,0.96)', BG]}
        locations={[0, 0.38, 0.66, 0.84]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 18 }]}>
        <Text style={styles.brand}>FITLINK</Text>
        <Pressable hitSlop={12} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.signIn}>Sign in</Text>
        </Pressable>
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + 34 }]}>
        <Animated.View style={contentStyle}>
          <Text style={styles.headline}>Your Tuesday,{'\n'}already sorted.</Text>
        </Animated.View>

        {/* Proof card: what the product actually does, not marketing copy. */}
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.cardRow}>
            <View style={styles.timePill}>
              <Text style={styles.timePillText}>9:00</Text>
            </View>
            <View style={styles.cardRowText}>
              <Text style={styles.cardTitle}>Sarah M.</Text>
              <Text style={styles.cardSub}>Strength · week 4</Text>
            </View>
            <View style={styles.joinPill}>
              <Text style={styles.joinPillText}>Join</Text>
            </View>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.cardRow}>
            <View style={styles.alertDot} />
            <View style={styles.cardRowText}>
              <Text style={styles.cardTitleSm}>Smør has gone quiet</Text>
              <Text style={styles.cardSub}>12 days · usually trains Tuesdays</Text>
            </View>
            <Text style={styles.nudgeText}>Nudge</Text>
          </View>
        </Animated.View>

        <Animated.View style={contentStyle}>
          <Text style={styles.body}>
            FitLink runs the roster, the calendar, the programmes and the payments. You show up
            and coach.
          </Text>
        </Animated.View>

        <Animated.View style={contentStyle}>
          <AnimatedPrimaryButton
            title="Start coaching on FitLink"
            onPress={() => router.push('/(auth)/coach-signup')}
          />
          <Pressable
            hitSlop={10}
            style={styles.athleteLink}
            onPress={() => router.push('/(auth)/client-signup')}
          >
            <Text style={styles.athleteLinkText}>
              Training with a coach? <Text style={styles.athleteLinkTextStrong}>Open the athlete app</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  brand: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    letterSpacing: 3.4,
    color: TEXT_PRIMARY,
  },
  signIn: {
    fontFamily: 'Epilogue-SemiBold',
    fontSize: 13,
    color: '#C9CEC2',
  },

  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
  },
  headline: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 40,
    lineHeight: 40,
    letterSpacing: -0.8,
    color: TEXT_PRIMARY,
  },

  card: {
    marginTop: 26,
    backgroundColor: 'rgba(24,27,23,0.9)',
    borderWidth: 1,
    borderColor: '#33382F',
    borderRadius: 18,
    padding: 15,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  cardRowText: {
    flex: 1,
    minWidth: 0,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#33382F',
    marginVertical: 13,
  },
  timePill: {
    backgroundColor: 'rgba(198,242,78,0.14)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
  timePillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: ACCENT,
  },
  cardTitle: {
    fontFamily: 'Epilogue-Bold',
    fontSize: 14.5,
    color: TEXT_PRIMARY,
  },
  cardTitleSm: {
    fontFamily: 'Epilogue-SemiBold',
    fontSize: 13.5,
    color: TEXT_PRIMARY,
  },
  cardSub: {
    fontFamily: 'Epilogue-Regular',
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 1,
  },
  joinPill: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 15,
  },
  joinPillText: {
    fontFamily: 'Epilogue-Bold',
    fontSize: 12.5,
    color: BG,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E05C5C',
    marginLeft: 12,
  },
  nudgeText: {
    fontFamily: 'Epilogue-Bold',
    fontSize: 12.5,
    color: ACCENT,
  },

  body: {
    fontFamily: 'Epilogue-Regular',
    fontSize: 14,
    lineHeight: 21.7,
    color: TEXT_SECONDARY,
    marginTop: 22,
  },

  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    marginTop: 26,
  },
  primaryBtnPressable: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15.5,
    color: BG,
  },

  athleteLink: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  athleteLinkText: {
    fontFamily: 'Epilogue-Regular',
    fontSize: 13,
    color: TEXT_MUTED,
  },
  athleteLinkTextStrong: {
    fontFamily: 'Epilogue-Bold',
    color: '#C9CEC2',
  },
});
