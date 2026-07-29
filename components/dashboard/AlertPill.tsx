import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily, FontSize, Radius } from '../../constants/theme';

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
        return { bg: '#1A0808', border: '#EF4444', iconColor: '#EF4444' };
      case 'warning':
        return { bg: '#1A1408', border: '#F59E0B', iconColor: '#F59E0B' };
      case 'info':
      default:
        return { bg: '#0A1220', border: '#3B82F6', iconColor: '#3B82F6' };
    }
  };

  const colors = getBadgeColors();

  return (
    <TouchableOpacity 
      activeOpacity={0.85} 
      style={[styles.container, { backgroundColor: colors.bg, borderColor: colors.border }]} 
      onPress={onPress}
    >
      <View style={styles.left}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.border }]}>
          <Ionicons name={icon} size={16} color="#000000" />
        </View>
        <View style={styles.textGroup}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.right}>
        <View style={[styles.actionBtn, { backgroundColor: colors.iconColor }]}>
          <Text style={styles.actionText}>{actionText.toUpperCase()}</Text>
          <Ionicons name="arrow-forward" size={10} color="#000000" />
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
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: '#000000',
    letterSpacing: 0.8,
  },
});
