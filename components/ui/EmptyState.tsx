import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily } from '../../constants/theme';

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
      <Ionicons name={icon} size={iconSize} color="rgba(255,255,255,0.15)" />
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
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    color: '#FFFFFF',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  action: {
    marginTop: 24,
  },
});
