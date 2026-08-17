import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

export interface AlertPillProps {
  id: string;
  type: 'warning' | 'info' | 'urgent';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  actionText?: string;
  onPress: () => void;
}

export default function AlertPill({
  type,
  icon,
  title,
  subtitle,
  actionText = 'Action',
  onPress,
}: AlertPillProps) {
  const getBadgeColors = () => {
    switch (type) {
      case 'urgent':
        return { bg: CoachColors.dangerSoft, border: CoachColors.danger, iconColor: CoachColors.danger };
      case 'warning':
        return { bg: CoachColors.warningSoft, border: CoachColors.warning, iconColor: CoachColors.warning };
      case 'info':
      default:
        return { bg: CoachColors.surface, border: CoachColors.border, iconColor: CoachColors.accent };
    }
  };

  const colors = getBadgeColors();

  return (
    <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
      activeOpacity={0.85}
      style={[styles.container, { backgroundColor: colors.bg, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={styles.left}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.iconColor }]}>
          <Ionicons name={icon} size={18} color={CoachColors.onAccent} />
        </View>
        <View style={styles.textGroup}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.right}>
        <View style={[styles.actionBtn, { backgroundColor: colors.iconColor }]}>
          <Text style={styles.actionText}>{actionText}</Text>
          <Ionicons name="arrow-forward" size={11} color={CoachColors.onAccent} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: 8,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textGroup: {
    flex: 1,
  },
  title: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textSecondary,
    marginTop: 2,
  },
  right: {
    marginLeft: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  actionText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 10,
    color: CoachColors.onAccent,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
