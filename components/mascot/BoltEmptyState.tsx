import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { Bolt, type BoltPose as BoltSvgPose } from './Bolt';

export type BoltPose = 'celebrate' | 'help' | 'welcome' | 'flex' | 'analyze' | 'concerned';

const POSE_MAP: Record<BoltPose, BoltSvgPose> = {
  celebrate: 'Celebrate',
  help: 'Help',
  welcome: 'Welcome',
  flex: 'Flex',
  analyze: 'Analyze',
  concerned: 'Concerned',
};

interface BoltEmptyStateProps {
  pose: BoltPose;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Bolt — the FitLink mascot — fronting an empty state. One lime accent,
 * sentence-case copy, and (where there is a real next step) a single CTA.
 */
export default function BoltEmptyState({ pose, title, subtitle, actionLabel, onAction }: BoltEmptyStateProps) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[CoachColors.accentSoft, CoachColors.accentSofter]}
        style={styles.avatarWrap}
      >
        <Bolt pose={POSE_MAP[pose]} size={64} color={CoachColors.accent} />
      </LinearGradient>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {actionLabel && onAction && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onAction}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    paddingVertical: 48,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: CoachColors.accentSoft,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 19,
    color: CoachColors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    lineHeight: 21.5,
    maxWidth: 260,
  },
  actionBtn: {
    marginTop: 24,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15,
    color: CoachColors.onAccent,
  },
});
