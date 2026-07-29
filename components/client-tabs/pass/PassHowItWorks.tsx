import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily, Spacing, Radius } from '../../../constants/theme';

export const PassHowItWorks: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  
  const expandAnim = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const toValue = expanded ? 0 : 1;
    setExpanded(!expanded);
    
    Animated.timing(expandAnim, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const rotateInterpolation = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const contentHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200], // Approximate max height needed
  });

  const contentOpacity = expandAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={styles.container}>
      <Pressable style={styles.headerRow} onPress={toggleExpand}>
        <Text style={styles.headerText}>HOW IT WORKS</Text>
        <Animated.View style={{ transform: [{ rotate: rotateInterpolation }] }}>
          <Ionicons name="chevron-down" size={20} color="rgba(255,255,255,0.5)" />
        </Animated.View>
      </Pressable>

      <Animated.View 
        style={[
          styles.contentContainer, 
          { height: contentHeight, opacity: contentOpacity }
        ]}
      >
        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: '#FF6B3526' }]}>
            <Ionicons name="barbell" size={18} color="#FF6B35" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Complete Workouts</Text>
            <Text style={styles.description}>+50 XP per workout</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: '#A78BFA26' }]}>
            <Ionicons name="restaurant" size={18} color="#A78BFA" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Log Your Meals</Text>
            <Text style={styles.description}>+10 XP per meal logged</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: '#22C55E26' }]}>
            <Ionicons name="fitness" size={18} color="#22C55E" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Gym Check-Ins</Text>
            <Text style={styles.description}>+50 XP per check-out</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius['2xl'],
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing['2xs'],
  },
  headerText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  contentContainer: {
    paddingTop: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  description: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
});

export default PassHowItWorks;
