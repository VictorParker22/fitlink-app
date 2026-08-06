import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { FontFamily, Radius, Spacing } from '../../constants/theme';
import { PrecisionIcons } from '../icons/PrecisionIcons';

export interface MonthData {
  month: string;
  amount: number;
}

interface Props {
  data: MonthData[];
}

export const SixMonthRevenueChart: React.FC<Props> = ({ data }) => {
  const maxAmount = Math.max(...data.map(d => d.amount), 1);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true, 
    }).start();
  }, [anim]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <PrecisionIcons.TrendingUp size={16} color="#30D158" />
        <Text style={styles.title}>6-Month Revenue</Text>
      </View>
      <View style={styles.chartArea}>
        {data.map((item, i) => {
          const targetHeight = (item.amount / maxAmount) * 100;
          
          const translateY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [100, 100 - targetHeight], 
          });

          return (
            <View key={i} style={styles.barCol}>
              <View style={styles.barTrack}>
                <Animated.View 
                  style={[
                    styles.barFill, 
                    { transform: [{ translateY }] }
                  ]} 
                />
              </View>
              <Text style={styles.barLabel}>{item.month.substring(0, 3)}</Text>
              <Text style={styles.barAmount}>${Math.round(item.amount)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  chartArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140, 
  },
  barCol: {
    alignItems: 'center',
    width: 36,
  },
  barTrack: {
    height: 100,
    width: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.sm,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  barFill: {
    width: '100%',
    height: 100,
    backgroundColor: '#FF9F0A',
    borderRadius: Radius.sm,
  },
  barLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  barAmount: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 2,
  },
});
