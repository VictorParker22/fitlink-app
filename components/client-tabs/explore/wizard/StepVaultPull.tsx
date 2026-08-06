import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { FontFamily, FontSize, Spacing, Radius } from '../../../../constants/theme';

export interface Plan {
  id: string;
  name: string;
  price: number;
  period?: string;
  color?: string;
}

interface StepVaultPullProps {
  plan: Plan;
  coachName: string;
  coachAvatar: string;
  archetype: string | null;
  saving?: boolean;
  onComplete: () => void;
}

export const StepVaultPull: React.FC<StepVaultPullProps> = ({
  plan,
  coachName,
  coachAvatar,
  archetype,
  saving = false,
  onComplete,
}) => {
  // Animation Values
  const particles = useRef(Array(8).fill(0).map(() => new Animated.Value(0))).current;
  const initTextOpacity = useRef(new Animated.Value(0)).current;
  const vaultTranslateY = useRef(new Animated.Value(-300)).current;
  const vaultScale = useRef(new Animated.Value(1)).current;
  const vaultOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.1)).current;
  const tensionTextOpacity = useRef(new Animated.Value(0)).current;
  const screenFlash = useRef(new Animated.Value(0)).current;
  const burstParticles = useRef(Array(12).fill(0).map(() => new Animated.Value(0))).current;
  const cardTranslateY = useRef(new Animated.Value(100)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const stat1Opacity = useRef(new Animated.Value(0)).current;
  const stat2Opacity = useRef(new Animated.Value(0)).current;
  const stat3Opacity = useRef(new Animated.Value(0)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnGlow = useRef(new Animated.Value(0)).current;
  const skipOpacity = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<number>(1);

  useEffect(() => {
    // Phase 1: Initiation
    Animated.parallel([
      Animated.timing(initTextOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ...particles.map((p) =>
        Animated.loop(
          Animated.timing(p, {
            toValue: 1,
            duration: 1500 + Math.random() * 1000,
            delay: Math.random() * 500,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        )
      )
    ]).start();

    // Show skip button after 2s
    setTimeout(() => {
      Animated.timing(skipOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 2000);

    setTimeout(() => {
      setPhase(2);
      Animated.parallel([
        Animated.timing(initTextOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(vaultOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(vaultTranslateY, { toValue: 0, friction: 6, tension: 40, useNativeDriver: true }),
      ]).start(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      });
    }, 500);

    setTimeout(() => {
      setPhase(3);
      Animated.timing(tensionTextOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      Animated.parallel([
        Animated.timing(glowOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(glowScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]).start();
      Animated.sequence([
        Animated.timing(vaultScale, { toValue: 1.15, duration: 150, useNativeDriver: true }),
        Animated.timing(vaultScale, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(vaultScale, { toValue: 1.15, duration: 150, useNativeDriver: true }),
        Animated.timing(vaultScale, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(vaultScale, { toValue: 1.15, duration: 150, useNativeDriver: true }),
        Animated.timing(vaultScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      let hapticCount = 0;
      const hapticInterval = setInterval(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        hapticCount++;
        if (hapticCount >= 3) clearInterval(hapticInterval);
      }, 200);
    }, 1500);

    setTimeout(() => {
      setPhase(4);
      Animated.parallel([
        Animated.timing(vaultScale, { toValue: 1.5, duration: 200, useNativeDriver: true }),
        Animated.timing(vaultOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(tensionTextOpacity, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      Animated.sequence([
        Animated.timing(screenFlash, { toValue: 0.3, duration: 50, useNativeDriver: true }),
        Animated.timing(screenFlash, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      burstParticles.forEach((p) => {
        Animated.timing(p, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
    }, 2500);

    setTimeout(() => {
      setPhase(5);
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(cardTranslateY, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
      ]).start();
      Animated.stagger(300, [
        Animated.timing(stat1Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(stat2Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(stat3Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }, 3500);

    setTimeout(() => {
      setPhase(6);
      // Hide skip once main CTA appears
      Animated.timing(skipOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      Animated.timing(btnOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(btnGlow, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(btnGlow, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    }, 5000);
  }, []);

  const getTierBadge = (price: number) => {
    if (price >= 200) return { label: 'DIAMOND', color: '#B9F2FF' };
    if (price >= 100) return { label: 'GOLD', color: '#FFD700' };
    if (price >= 50) return { label: 'SILVER', color: '#C0C0C0' };
    return { label: 'BRONZE', color: '#CD7F32' };
  };

  const tier = getTierBadge(plan.price);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.flash, { opacity: screenFlash }]} pointerEvents="none" />

      {/* Skip button — visible after 2s, auto-hides when CTA appears */}
      <Animated.View style={[styles.skipBtn, { opacity: skipOpacity }]} pointerEvents={phase < 6 ? 'auto' : 'none'}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onComplete();
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip animation"
        >
          <Text style={styles.skipText}>SKIP →</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Background Particles Phase 1 */}
      {phase < 4 && particles.map((p, i) => (
        <Animated.View
          key={`p-${i}`}
          style={[
            styles.particle,
            {
              left: `${10 + (i * 12)}%`,
              bottom: '-10%',
              transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -600] }) }],
              opacity: p.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] })
            }
          ]}
        />
      ))}

      {/* Initial / Tension Text */}
      <View style={styles.textLayer} pointerEvents="none">
        <Animated.Text style={[styles.statusText, { opacity: initTextOpacity }]}>
          ACCESSING THE VAULT...
        </Animated.Text>
        <Animated.Text style={[styles.statusText, { opacity: tensionTextOpacity, position: 'absolute' }]}>
          UNLOCKING YOUR ACCESS...
        </Animated.Text>
      </View>

      {/* Vault Diamond */}
      <View style={styles.centerLayer} pointerEvents="none">
        <Animated.View style={[styles.glowCircle, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
        <Animated.View
          style={[
            styles.vaultDiamond,
            { opacity: vaultOpacity, transform: [{ translateY: vaultTranslateY }, { scale: vaultScale }, { rotate: '45deg' }] }
          ]}
        >
          <View style={{ transform: [{ rotate: '-45deg' }] }}>
            <Ionicons name="diamond" size={40} color="#000000" />
          </View>
        </Animated.View>

        {/* Burst Particles Phase 4 */}
        {burstParticles.map((p, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const distance = 200;
          const translateX = p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] });
          const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] });
          const scale = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.5, 0] });
          return (
            <Animated.View
              key={`bp-${i}`}
              style={[styles.burstParticle, { position: 'absolute', transform: [{ translateX }, { translateY }, { scale }] }]}
            />
          );
        })}
      </View>

      {/* Card Reveal */}
      <View style={styles.cardLayer} pointerEvents="none">
        <Animated.View style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }]}>
          <View style={styles.cardHeader}>
            {/* ✅ Fixed: expo-image requires { uri } object for remote URLs */}
            <Image source={{ uri: coachAvatar }} style={styles.avatar} contentFit="cover" />
            <Text style={styles.coachName}>{coachName}</Text>
          </View>
          <Text style={styles.cardPlanName}>{plan.name}</Text>
          <View style={[styles.tierBadge, { borderColor: tier.color }]}>
            <Text style={[styles.tierText, { color: tier.color }]}>{tier.label}</Text>
          </View>
          {archetype && <Text style={styles.archetypeText}>{archetype}</Text>}
          <View style={styles.stampContainer}>
            <Text style={styles.stampText}>ACCESS UNLOCKED</Text>
          </View>
        </Animated.View>

        <View style={styles.statsContainer}>
          <Animated.Text style={[styles.statText, { opacity: stat1Opacity }]}>✓ {plan.name} Activated</Animated.Text>
          <Animated.Text style={[styles.statText, { opacity: stat2Opacity }]}>✓ FitLink Pass Journey Unlocked</Animated.Text>
          <Animated.Text style={[styles.statText, { opacity: stat3Opacity }]}>✓ Direct Coach Messaging Enabled</Animated.Text>
        </View>
      </View>

      {/* CTA */}
      <Animated.View style={[styles.ctaLayer, { opacity: btnOpacity }]} pointerEvents={phase >= 6 ? 'auto' : 'none'}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            if (saving) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onComplete();
          }}
          style={styles.ctaWrapper}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Enter your coaching journey"
        >
          <Animated.View style={[styles.btnGlowWrapper, { opacity: btnGlow }]}>
            <LinearGradient colors={['rgba(255, 215, 0, 0.4)', 'rgba(255, 215, 0, 0)']} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <LinearGradient colors={['#FFD700', '#FFA500']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            {saving ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.ctaText}>ENTER YOUR JOURNEY</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF', zIndex: 999 },
  skipBtn: { position: 'absolute', top: 16, right: 20, zIndex: 100, paddingVertical: 8, paddingHorizontal: 12 },
  skipText: { fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5 },
  particle: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFD700' },
  burstParticle: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFD700' },
  textLayer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  statusText: { fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: '#FFD700', letterSpacing: 3 },
  centerLayer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  glowCircle: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255, 215, 0, 0.1)' },
  vaultDiamond: { width: 80, height: 80, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  cardLayer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 20 },
  card: {
    backgroundColor: '#0C0C0E', borderWidth: 2, borderColor: '#FFD700',
    borderRadius: 20, padding: 24, width: 280, alignItems: 'center', marginBottom: Spacing['2xl'],
  },
  cardHeader: { alignItems: 'center', marginBottom: Spacing.lg },
  avatar: { width: 40, height: 40, borderRadius: 20, marginBottom: Spacing.xs, backgroundColor: '#1C1C1E' },
  coachName: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: 'rgba(255, 255, 255, 0.5)' },
  cardPlanName: { fontFamily: FontFamily.headingExtraBold, fontSize: 24, color: '#FFFFFF', marginBottom: Spacing.sm, textAlign: 'center' },
  tierBadge: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: Spacing.xs, paddingVertical: 2, marginBottom: Spacing.md },
  tierText: { fontFamily: FontFamily.bodyBold, fontSize: 10 },
  archetypeText: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginBottom: Spacing.xl },
  stampContainer: {
    borderWidth: 1, borderColor: '#FFD700', borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  stampText: { fontFamily: FontFamily.bodyBold, fontSize: 12, color: '#FFD700' },
  statsContainer: { alignItems: 'flex-start', width: 280 },
  statText: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: '#FFFFFF', marginBottom: Spacing.sm },
  ctaLayer: { position: 'absolute', bottom: Spacing['3xl'], left: Spacing.lg, right: Spacing.lg, zIndex: 30 },
  ctaWrapper: { borderRadius: 12, overflow: 'hidden', height: 56 },
  btnGlowWrapper: { ...StyleSheet.absoluteFillObject, transform: [{ scale: 1.1 }] },
  cta: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  ctaText: { fontFamily: FontFamily.bodyBold, fontSize: 16, color: '#000000' },
});
