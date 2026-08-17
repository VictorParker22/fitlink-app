import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

interface EmptyStateProps {
  /** Ionicons icon name */
  icon: keyof typeof Ionicons.glyphMap;
  /** Primary message */
  title: string;
  /** Secondary descriptive text */
  subtitle?: string;
  /** Icon size (default 48) */
  iconSize?: number;
  /** Custom action element (e.g. a button) */
  action?: React.ReactNode;
}

/**
 * Empty state placeholder shown when a list/screen has no content.
 * Replaces the ad-hoc empty views scattered across 5+ screens.
 */
export default function EmptyState({
  icon,
  title,
  subtitle,
  iconSize = 48,
  action,
}: EmptyStateProps) {
  return (
    <View style={s.container} accessible accessibilityRole="text">
      <Ionicons name={icon} size={iconSize} color={CoachColors.textFaint} />
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      {action && <View style={s.action}>{action}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 100,
  },
  title: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textMuted,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22.5,
  },
  action: {
    marginTop: 24,
  },
});
