import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';

const DISMISSED_KEY = 'fitlink_welcome_guide_dismissed';
const COMPLETED_STEPS_KEY = 'fitlink_welcome_guide_completed';

interface GuideStep {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
}

const STEPS: GuideStep[] = [
  {
    id: 'profile',
    icon: 'body-outline',
    title: 'Set up fitness profile',
    subtitle: 'Add target weight, height & goals',
    route: ClientRoute.healthInsights,
  },
  {
    id: 'classes',
    icon: 'barbell-outline',
    title: 'Explore class library',
    subtitle: 'Browse on-demand video routines',
    route: ClientRoute.exploreClasses,
  },
  {
    id: 'music',
    icon: 'musical-notes-outline',
    title: 'Connect Spotify or Apple Music',
    subtitle: 'Get music controls during gym visits',
    route: ClientRoute.connectedTech,
  },
];

export default function WelcomeGuide({ visible }: { visible: boolean }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function loadState() {
      try {
        const isDismissed = await SecureStore.getItemAsync(DISMISSED_KEY);
        if (isDismissed === 'true') {
          setDismissed(true);
        }
        const savedSteps = await SecureStore.getItemAsync(COMPLETED_STEPS_KEY);
        if (savedSteps) {
          setCompletedSteps(JSON.parse(savedSteps));
        }
      } catch (e) {
        console.log('[WelcomeGuide] Error loading state:', e);
      } finally {
        setLoaded(true);
      }
    }
    loadState();
  }, []);

  if (!loaded || !visible || dismissed) return null;

  const toggleStep = async (stepId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = completedSteps.includes(stepId)
      ? completedSteps.filter(id => id !== stepId)
      : [...completedSteps, stepId];

    setCompletedSteps(updated);
    await SecureStore.setItemAsync(COMPLETED_STEPS_KEY, JSON.stringify(updated));
  };

  const handleDismiss = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDismissed(true);
    await SecureStore.setItemAsync(DISMISSED_KEY, 'true');
  };

  const allCompleted = STEPS.every(step => completedSteps.includes(step.id));

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <View style={st.titleRow}>
          <View style={st.badge}>
            <Ionicons name="sparkles" size={12} color={CoachColors.accent} />
            <Text style={st.badgeText}>Get started</Text>
          </View>
          <TouchableOpacity onPress={handleDismiss} hitSlop={10}>
            <Text style={st.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
        <Text style={st.title}>Welcome to FitLink</Text>
        <Text style={st.subtitle}>
          {allCompleted
            ? "You're all set! Enjoy your high-performance training."
            : 'Complete these quick steps to get the most out of your training.'}
        </Text>
      </View>

      {/* Steps List */}
      {!allCompleted && (
        <View style={st.stepsList}>
          {STEPS.map((step, idx) => {
            const isDone = completedSteps.includes(step.id);
            return (
              <TouchableOpacity
                key={step.id}
                style={[st.stepCard, isDone && st.stepCardDone]}
                onPress={() => router.push(step.route as any)}
                activeOpacity={0.8}
              >
                <TouchableOpacity
                  style={st.checkbox}
                  onPress={() => toggleStep(step.id)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isDone ? CoachColors.accent : CoachColors.textFaint}
                  />
                </TouchableOpacity>

                <View style={st.iconWrap}>
                  <Ionicons name={step.icon} size={18} color={isDone ? CoachColors.textMuted : CoachColors.textPrimary} />
                </View>

                <View style={st.stepInfo}>
                  <Text style={[st.stepTitle, isDone && st.stepTextDone]}>{step.title}</Text>
                  <Text style={st.stepSubtitle} numberOfLines={1}>{step.subtitle}</Text>
                </View>

                <Ionicons name="chevron-forward" size={16} color={CoachColors.textFaint} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Progress Bar */}
      <View style={st.progressContainer}>
        <View style={st.progressBarTrack}>
          <View
            style={[
              st.progressBarFill,
              { width: `${(completedSteps.length / STEPS.length) * 100}%` },
            ]}
          />
        </View>
        <Text style={st.progressText}>
          {completedSteps.length}/{STEPS.length} completed
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.22)',
    padding: 16,
    marginBottom: 20,
  },
  header: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.accentSofter,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.25)',
  },
  badgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 9,
    color: CoachColors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  dismissText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
    lineHeight: 16,
  },
  stepsList: {
    gap: 8,
    marginVertical: 4,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.bg,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: 12,
    gap: 10,
  },
  stepCardDone: {
    backgroundColor: CoachColors.surfaceRaised,
    borderColor: CoachColors.borderMuted,
  },
  checkbox: {
    padding: 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
  },
  stepTextDone: {
    color: CoachColors.textMuted,
    textDecorationLine: 'line-through',
  },
  stepSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 10,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  progressBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: CoachColors.accent,
    borderRadius: 2,
  },
  progressText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 10,
    color: CoachColors.textSecondary,
  },
});
