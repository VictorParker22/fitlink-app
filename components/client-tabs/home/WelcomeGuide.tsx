import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { FontFamily, Radius } from '../../../constants/theme';
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
    title: 'Set Up Fitness Profile',
    subtitle: 'Add target weight, height & goals',
    route: ClientRoute.healthInsights,
  },
  {
    id: 'classes',
    icon: 'barbell-outline',
    title: 'Explore Class Library',
    subtitle: 'Browse 50+ on-demand video routines',
    route: ClientRoute.exploreClasses,
  },
  {
    id: 'music',
    icon: 'musical-notes-outline',
    title: 'Connect Spotify / Apple Music',
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
            <Ionicons name="sparkles" size={12} color="#FFD700" />
            <Text style={st.badgeText}>GET STARTED</Text>
          </View>
          <TouchableOpacity onPress={handleDismiss} hitSlop={10}>
            <Text style={st.dismissText}>DISMISS</Text>
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
                    color={isDone ? '#22C55E' : 'rgba(255,255,255,0.3)'}
                  />
                </TouchableOpacity>

                <View style={st.iconWrap}>
                  <Ionicons name={step.icon} size={18} color={isDone ? 'rgba(255,255,255,0.4)' : '#FFFFFF'} />
                </View>

                <View style={st.stepInfo}>
                  <Text style={[st.stepTitle, isDone && st.stepTextDone]}>{step.title}</Text>
                  <Text style={st.stepSubtitle} numberOfLines={1}>{step.subtitle}</Text>
                </View>

                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
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
          {completedSteps.length}/{STEPS.length} Completed
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    backgroundColor: '#0C0C0E',
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
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
    backgroundColor: 'rgba(255,215,0,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',
  },
  badgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: '#FFD700',
    letterSpacing: 1.5,
  },
  dismissText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 16,
  },
  stepsList: {
    gap: 8,
    marginVertical: 4,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    gap: 10,
  },
  stepCardDone: {
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderColor: 'rgba(255,255,255,0.03)',
  },
  checkbox: {
    padding: 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  stepTextDone: {
    color: 'rgba(255,255,255,0.4)',
    textDecorationLine: 'line-through',
  },
  stepSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  progressBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 2,
  },
  progressText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
});
