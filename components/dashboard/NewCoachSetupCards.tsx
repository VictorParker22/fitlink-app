import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { useApp } from '../../context/AppContext';
import { FontFamily, Spacing, Radius } from '../../constants/theme';
import PayoutSetupModal from './PayoutSetupModal';

/**
 * Setup Checklist with Progress Ring — replaces scattered onboarding cards.
 *
 * Research-backed approach:
 *   - Zeigarnik Effect: humans complete unfinished tasks → progress ring
 *   - 3-5 steps max to avoid overwhelm
 *   - Each item is a direct link to the action
 *   - Auto-dismisses when all steps are complete
 *   - "Takes ~3 min" to reduce friction
 */

interface ChecklistItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  complete: boolean;
  onPress: () => void;
}

export default function NewCoachSetupCards() {
  const router = useRouter();
  const { trainer, clients, plans, workouts } = useApp();
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  // ── Derive completion state from real data ──
  const hasAccount = true; // They signed up — always done
  const hasPayouts = !!(trainer?.stripe_onboarding_complete || trainer?.stripe_charges_enabled);
  const hasSeasonPass = plans.length > 0;
  const hasClient = clients.length > 0;

  const items: ChecklistItem[] = useMemo(() => [
    {
      id: 'account',
      label: 'Create your account',
      icon: 'checkmark-circle',
      color: '#22C55E',
      complete: hasAccount,
      onPress: () => {},
    },
    {
      id: 'payments',
      label: 'Connect payments',
      icon: 'card-outline',
      color: '#C9A96E',
      complete: hasPayouts,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setShowPayoutModal(true);
      },
    },
    {
      id: 'season-pass',
      label: 'Create your first Season Pass',
      icon: 'ticket-outline',
      color: '#A855F7',
      complete: hasSeasonPass,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/create-plan');
      },
    },
    {
      id: 'client',
      label: 'Invite your first client',
      icon: 'person-add-outline',
      color: '#6C9BF2',
      complete: hasClient,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/(tabs)/clients');
      },
    },
  ], [hasAccount, hasPayouts, hasSeasonPass, hasClient]);

  const completedCount = items.filter(i => i.complete).length;
  const totalCount = items.length;
  const allDone = completedCount === totalCount;

  // Don't render if all steps complete
  if (allDone) return null;

  // ── Progress ring values ──
  const progressPercent = completedCount / totalCount;
  const ringSize = 48;
  const strokeWidth = 4;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressPercent);

  // Find the first incomplete item to highlight
  const nextItem = items.find(i => !i.complete);

  return (
    <View style={styles.container}>
      {/* ── Checklist Card ── */}
      <View style={styles.card}>
        {/* Header row: progress ring + label + time estimate */}
        <View style={styles.headerRow}>
          {/* Progress Ring */}
          <View style={styles.ringContainer}>
            <Svg width={ringSize} height={ringSize} style={styles.ringSvg}>
              {/* Background circle */}
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={strokeWidth}
                fill="none"
              />
              {/* Progress circle */}
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke="#C9A96E"
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                rotation="-90"
                origin={`${ringSize / 2}, ${ringSize / 2}`}
              />
            </Svg>
            <View style={styles.ringLabel}>
              <Text style={styles.ringNumber}>{completedCount}</Text>
              <Text style={styles.ringOf}>/{totalCount}</Text>
            </View>
          </View>

          <View style={styles.headerText}>
            <Text style={styles.headerTag}>// YOUR SETUP</Text>
            <Text style={styles.headerTitle}>Get Started</Text>
          </View>

          <View style={styles.timeBadge}>
            <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={styles.timeText}>~3 min</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Checklist items */}
        <View style={styles.checklist}>
          {items.map((item, index) => {
            const isNext = !item.complete && item.id === nextItem?.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.checkItem,
                  isNext && styles.checkItemHighlight,
                ]}
                onPress={item.complete ? undefined : item.onPress}
                activeOpacity={item.complete ? 1 : 0.7}
                disabled={item.complete}
              >
                {/* Check / circle indicator */}
                <View style={[
                  styles.checkCircle,
                  item.complete && { backgroundColor: item.color, borderColor: item.color },
                  isNext && { borderColor: item.color },
                ]}>
                  {item.complete ? (
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.checkNumber}>{index + 1}</Text>
                  )}
                </View>

                {/* Label */}
                <Text style={[
                  styles.checkLabel,
                  item.complete && styles.checkLabelDone,
                  isNext && styles.checkLabelNext,
                ]}>
                  {item.label}
                </Text>

                {/* Arrow for actionable items */}
                {!item.complete && (
                  <Ionicons name="chevron-forward" size={16} color={isNext ? item.color : 'rgba(255,255,255,0.15)'} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPercent * 100}%` }]} />
        </View>
      </View>

      {/* Payout Setup Modal */}
      <PayoutSetupModal
        visible={showPayoutModal}
        onClose={() => setShowPayoutModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },

  // ── Card ──
  card: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: 20,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ringContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
  },
  ringLabel: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  ringNumber: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  ringOf: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#C9A96E',
    letterSpacing: 2.5,
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timeText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: '#1C1C1E',
    marginVertical: 16,
  },

  // ── Checklist ──
  checklist: {
    gap: 4,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.xs,
  },
  checkItemHighlight: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkNumber: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  checkLabel: {
    flex: 1,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
  },
  checkLabelDone: {
    color: 'rgba(255,255,255,0.25)',
    textDecorationLine: 'line-through',
  },
  checkLabelNext: {
    color: '#FFFFFF',
  },

  // ── Progress bar ──
  progressBarBg: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#C9A96E',
    borderRadius: 2,
  },
});
