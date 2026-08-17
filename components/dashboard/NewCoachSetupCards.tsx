import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { useApp } from '../../context/AppContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import PayoutSetupModal from './PayoutSetupModal';

/**
 * Setup checklist with a step-progress ring — the coach's day-one empty
 * state. Grounded in the original NewCoachSetupCards, restyled to the
 * fixed dark palette: single lime accent, no gold tag, sentence case.
 *
 *   - Zeigarnik effect: humans complete unfinished tasks → progress ring
 *   - 4 steps max, each a direct link to the action
 *   - Auto-dismisses (returns null) once every step is complete
 */

interface ChecklistItem {
  id: string;
  label: string;
  sublabel?: string;
  complete: boolean;
  onPress: () => void;
}

export default function NewCoachSetupCards() {
  const router = useRouter();
  const { trainer, clients, plans } = useApp();
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
      complete: hasAccount,
      onPress: () => {},
    },
    {
      id: 'payments',
      label: 'Connect payments',
      sublabel: "You can't get paid until this is done",
      complete: hasPayouts,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setShowPayoutModal(true);
      },
    },
    {
      id: 'season-pass',
      label: 'Build your first pass',
      complete: hasSeasonPass,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/create-plan');
      },
    },
    {
      id: 'client',
      label: 'Invite your first athlete',
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
      <View style={styles.card}>
        {/* Header row: progress ring + label + time estimate */}
        <View style={styles.headerRow}>
          <View style={styles.ringContainer}>
            <Svg width={ringSize} height={ringSize} style={styles.ringSvg}>
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke={CoachColors.borderMuted}
                strokeWidth={strokeWidth}
                fill="none"
              />
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke={CoachColors.accent}
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
            <Text style={styles.headerTitle}>Set up your coaching</Text>
            <Text style={styles.headerSub}>About 3 minutes</Text>
          </View>
        </View>

        {/* Checklist items */}
        <View style={styles.checklist}>
          {items.map((item, index) => {
            const isNext = !item.complete && item.id === nextItem?.id;
            return (
              <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                key={item.id}
                style={[
                  styles.checkItem,
                  isNext && styles.checkItemHighlight,
                ]}
                onPress={item.complete ? undefined : item.onPress}
                activeOpacity={item.complete ? 1 : 0.7}
                disabled={item.complete}
              >
                {/* Check / number indicator */}
                <View style={[
                  styles.checkCircle,
                  item.complete && styles.checkCircleDone,
                  isNext && styles.checkCircleNext,
                ]}>
                  {item.complete ? (
                    <Ionicons name="checkmark" size={15} color={CoachColors.onAccent} />
                  ) : (
                    <Text style={[styles.checkNumber, isNext && styles.checkNumberNext]}>
                      {index + 1}
                    </Text>
                  )}
                </View>

                {/* Label */}
                <View style={styles.checkLabelWrap}>
                  <Text style={[
                    styles.checkLabel,
                    item.complete && styles.checkLabelDone,
                    isNext && styles.checkLabelNext,
                  ]}>
                    {item.label}
                  </Text>
                  {isNext && item.sublabel && (
                    <Text style={styles.checkSublabel}>{item.sublabel}</Text>
                  )}
                </View>

                {/* Arrow for actionable items */}
                {!item.complete && (
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={isNext ? CoachColors.accent : CoachColors.borderMuted}
                  />
                )}
              </TouchableOpacity>
            );
          })}
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
    paddingHorizontal: 0,
  },

  // ── Card ──
  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 16,
    padding: 18,
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
    gap: 1,
  },
  ringNumber: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  ringOf: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
  },
  headerSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textMuted,
  },

  // ── Checklist ──
  checklist: {
    flexDirection: 'column',
    gap: 2,
    marginTop: 16,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 10,
  },
  checkItemHighlight: {
    backgroundColor: CoachColors.accentSofter,
    paddingHorizontal: 10,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: CoachColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDone: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
  },
  checkCircleNext: {
    borderColor: CoachColors.accent,
  },
  checkNumber: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    color: CoachColors.textFaint,
  },
  checkNumberNext: {
    color: CoachColors.accent,
  },
  checkLabelWrap: {
    flex: 1,
  },
  checkLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
  },
  checkLabelDone: {
    color: CoachColors.textFaint,
    textDecorationLine: 'line-through',
  },
  checkLabelNext: {
    fontFamily: CoachFonts.bodySemiBold,
    color: CoachColors.textPrimary,
  },
  checkSublabel: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 2,
  },
});
