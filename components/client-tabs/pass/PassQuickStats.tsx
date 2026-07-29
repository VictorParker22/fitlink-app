import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily, Spacing, Radius } from '../../../constants/theme';

interface PassQuickStatsProps {
  level: number;
  streak: number;
  workoutsThisMonth: number;
  totalXp: number;
  progressToNextLevel: number; // 0-1
}

export const PassQuickStats: React.FC<PassQuickStatsProps> = ({
  level,
  streak,
  workoutsThisMonth,
  totalXp,
  progressToNextLevel,
}) => {
  return (
    <View>
      <View style={styles.card}>
        <View style={styles.col}>
          <Ionicons name="shield" size={16} color="#FFD700" style={styles.icon} />
          <Text style={styles.number}>{level}</Text>
          <Text style={styles.label}>LEVEL</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <Ionicons
            name="flame"
            size={16}
            color={streak > 0 ? '#FF6B35' : 'rgba(255,255,255,0.2)'}
            style={styles.icon}
          />
          <Text style={styles.number}>
            {streak}
            {streak > 0 ? '🔥' : ''}
          </Text>
          <Text style={styles.label}>STREAK</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <Ionicons name="barbell" size={16} color="#FF6B35" style={styles.icon} />
          <Text style={styles.number}>{workoutsThisMonth}</Text>
          <Text style={styles.label}>THIS MONTH</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <Ionicons name="flash" size={16} color="#FFD700" style={styles.icon} />
          <Text style={styles.number}>{totalXp}</Text>
          <Text style={styles.label}>TOTAL XP</Text>
        </View>
      </View>
      
      <View style={styles.progressTrack}>
        <LinearGradient
          colors={['#FF6B35', '#FFD700']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressBar, { width: `${Math.max(0, Math.min(100, progressToNextLevel * 100))}%` }]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  col: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  icon: {
    marginBottom: Spacing.xs,
  },
  number: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
    marginBottom: Spacing['2xs'],
  },
  label: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#1C1C1E',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
});
