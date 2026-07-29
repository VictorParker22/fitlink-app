import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Image, TouchableOpacity,
  Animated, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, FontFamily } from '../../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();

  // Animated values for staggered entrance
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(-20)).current;
  const headlineOpacity = useRef(new Animated.Value(0)).current;
  const headlineTranslateY = useRef(new Animated.Value(30)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const buttonsTranslateY = useRef(new Animated.Value(40)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered fade-in animation
    Animated.sequence([
      // Logo fades in first
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslateY, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      // Headline slides up
      Animated.parallel([
        Animated.timing(headlineOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(headlineTranslateY, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
      // Buttons and tagline appear
      Animated.parallel([
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(buttonsTranslateY, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handleSignIn = () => {
    router.push('/(auth)/login');
  };

  const handleCreateAccount = () => {
    router.push('/(auth)/create-account');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Full-bleed background image */}
      <Image
        source={require('../../assets/images/auth-bg.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      {/* Dark gradient overlay — heavier at bottom for text legibility */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.15)',
          'rgba(0,0,0,0.05)',
          'rgba(0,0,0,0.25)',
          'rgba(0,0,0,0.70)',
          'rgba(0,0,0,0.85)',
        ]}
        locations={[0, 0.25, 0.45, 0.72, 1]}
        style={styles.overlay}
      />

      {/* Content — positioned absolute over the image */}
      <View style={styles.content}>
        {/* Logo at top */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [{ translateY: logoTranslateY }],
            },
          ]}
        >
          <Text style={styles.logoText}>FITLINK</Text>
        </Animated.View>

        {/* Bottom section — headline + buttons */}
        <View style={styles.bottomSection}>
          {/* Bold headline */}
          <Animated.View
            style={{
              opacity: headlineOpacity,
              transform: [{ translateY: headlineTranslateY }],
            }}
          >
            <Text style={styles.headline}>
              ELEVATE YOUR{'\n'}COACHING.{'\n'}EMPOWER YOUR{'\n'}CLIENTS.
            </Text>
          </Animated.View>

          {/* Buttons */}
          <Animated.View
            style={[
              styles.buttonContainer,
              {
                opacity: buttonsOpacity,
                transform: [{ translateY: buttonsTranslateY }],
              },
            ]}
          >
            {/* Sign In — solid white button */}
            <TouchableOpacity
              style={styles.signInButton}
              activeOpacity={0.85}
              onPress={handleSignIn}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.signInButtonText}>Sign in</Text>
            </TouchableOpacity>

            {/* Create Account — outlined button */}
            <TouchableOpacity
              style={styles.createAccountButton}
              activeOpacity={0.85}
              onPress={handleCreateAccount}
              accessibilityRole="button"
              accessibilityLabel="Create FitLink account"
            >
              <Text style={styles.createAccountButtonText}>Create FitLink account</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Tagline */}
          <Animated.View style={{ opacity: taglineOpacity }}>
            <Text style={styles.tagline}>The Coaching Platform</Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Full-screen background image
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },

  // Gradient overlay
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // Content overlay
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: SCREEN_HEIGHT * 0.12,
    paddingBottom: SCREEN_HEIGHT * 0.06,
    paddingHorizontal: Spacing.xl,
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
  },
  logoText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: 8,
  },

  // Bottom section
  bottomSection: {
    gap: 28,
  },

  // Headline
  headline: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 38,
    color: '#FFFFFF',
    lineHeight: 44,
    letterSpacing: -0.5,
  },

  // Buttons
  buttonContainer: {
    gap: 14,
  },

  // Sign In — white filled
  signInButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#000000',
    letterSpacing: 0.5,
  },

  // Create Account — outlined
  createAccountButton: {
    backgroundColor: 'transparent',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAccountButtonText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Tagline
  tagline: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
