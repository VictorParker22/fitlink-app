import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FontFamily } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export type BoltPose = 'celebrate' | 'help' | 'welcome' | 'flex' | 'analyze';

interface BoltEmptyStateProps {
  pose: BoltPose;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function BoltEmptyState({ pose, title, subtitle, actionLabel, onAction }: BoltEmptyStateProps) {
  // Placeholder emoji based on pose until Bolt SVG assets are imported
  const getEmoji = () => {
    switch (pose) {
      case 'celebrate': return '🎉';
      case 'help': return '🤔';
      case 'welcome': return '👋';
      case 'flex': return '💪';
      case 'analyze': return '🔍';
      default: return '⚡';
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(200,241,53,0.1)', 'rgba(200,241,53,0.02)']}
        style={styles.avatarWrap}
      >
        <Text style={styles.emoji}>{getEmoji()}</Text>
        <View style={styles.boltBadge}>
          <Ionicons name="flash" size={10} color="#000" />
        </View>
      </LinearGradient>
      
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.actionBtn} onPress={onAction} activeOpacity={0.8}>
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
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(200,241,53,0.15)',
  },
  emoji: {
    fontSize: 32,
  },
  boltBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C8F135',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0D0D12',
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 240,
    marginBottom: 24,
  },
  actionBtn: {
    backgroundColor: 'rgba(200,241,53,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,241,53,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  actionText: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    color: '#C8F135',
  },
});
