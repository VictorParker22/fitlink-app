import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Image, TouchableOpacity,
  Animated, StatusBar, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, FontFamily } from '../../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_HEIGHT = SCREEN_HEIGHT * 0.34;

export default function CreateAccountScreen() {
  const router = useRouter();

  // Animated values
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const card1Opacity = useRef(new Animated.Value(0)).current;
  const card1TranslateY = useRef(new Animated.Value(40)).current;
  const card2Opacity = useRef(new Animated.Value(0)).current;
  const card2TranslateY = useRef(new Animated.Value(40)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Header fades in
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Card 1 slides up
      Animated.parallel([
        Animated.timing(card1Opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(card1TranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // Card 2 slides up
      Animated.parallel([
        Animated.timing(card2Opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(card2TranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // Footer fades in
      Animated.timing(footerOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleCoachSignUp = () => {
    router.push('/(auth)/coach-signup');
  };

  const handleClientSignUp = () => {
    router.push('/(auth)/client-signup');
  };

  const handleSignIn = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header — back button + logo */}
        <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerLogo}>FITLINK</Text>
        </Animated.View>

        {/* Card 1 — Coach */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: card1Opacity,
              transform: [{ translateY: card1TranslateY }],
            },
          ]}
        >
          <Image
            source={require('../../assets/images/coach-card-bg.png')}
            style={styles.cardImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.8)']}
            locations={[0, 0.5, 1]}
            style={styles.cardOverlay}
          />
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>I'm a Coach</Text>
            <Text style={styles.cardSubtitle}>
              Build your coaching business
            </Text>
            <TouchableOpacity
              style={styles.cardButton}
              activeOpacity={0.85}
              onPress={handleCoachSignUp}
              accessibilityRole="button"
              accessibilityLabel="Create coach account"
            >
              <Text style={styles.cardButtonText}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Card 2 — Client */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: card2Opacity,
              transform: [{ translateY: card2TranslateY }],
            },
          ]}
        >
          <Image
            source={require('../../assets/images/client-card-bg.png')}
            style={styles.cardImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.8)']}
            locations={[0, 0.5, 1]}
            style={styles.cardOverlay}
          />
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>
              I'm training{'\n'}with a Coach
            </Text>
            <Text style={styles.cardSubtitle}>
              Join with your coach's invite code
            </Text>
            <TouchableOpacity
              style={styles.cardButton}
              activeOpacity={0.85}
              onPress={handleClientSignUp}
              accessibilityRole="button"
              accessibilityLabel="Join as a client"
            >
              <Text style={styles.cardButtonText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Footer — already have account */}
        <Animated.View style={[styles.footer, { opacity: footerOpacity }]}>
          <Text style={styles.footerText}>Already have a FitLink account?</Text>
          <TouchableOpacity
            onPress={handleSignIn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Sign in to existing account"
          >
            <Text style={styles.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SCREEN_HEIGHT * 0.06,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 4,
  },

  // Cards
  card: {
    height: CARD_HEIGHT,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  cardImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  cardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: Spacing.xl,
  },
  cardTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 20,
  },
  cardButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  cardButtonText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    color: '#000000',
    letterSpacing: 0.5,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: SCREEN_HEIGHT * 0.06,
    paddingBottom: Spacing['2xl'],
    gap: 6,
  },
  footerText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  footerLink: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
});
