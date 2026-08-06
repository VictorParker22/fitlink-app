import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { FontFamily } from '../../../constants/theme';

interface DashboardSummaryCardProps {
  completedDays?: number[]; // indices 0-6 (Mon-Sun)
  todayIdx?: number;
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function DashboardSummaryCard({
  completedDays = [0, 3], // Mock M and T(hu) as done
  todayIdx = 2,           // Mock W as today
}: DashboardSummaryCardProps) {

  // SVG dimensions and colors
  const size = 120;
  const strokeWidth = 14;
  const center = size / 2;
  const radius1 = center - strokeWidth;
  const radius2 = radius1 - strokeWidth - 2;
  const radius3 = radius2 - strokeWidth - 2;
  
  const moveColor = '#E0FF4F';
  const trainColor = '#38BDF8';
  const recoverColor = '#F43F5E';
  
  const circumference1 = 2 * Math.PI * radius1;
  const circumference2 = 2 * Math.PI * radius2;
  const circumference3 = 2 * Math.PI * radius3;
  
  // Mock progress
  const progress1 = 0.78; // 624 / 800
  const progress2 = 0.20; // 1 / 5
  const progress3 = 0.77; // 6h 12m / 8h

  return (
    <View style={st.card}>
      <View style={st.topRow}>
        {/* Rings */}
        <View style={st.ringsContainer}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background Tracks */}
            <Circle cx={center} cy={center} r={radius1} stroke="#1A1A1A" strokeWidth={strokeWidth} fill="none" />
            <Circle cx={center} cy={center} r={radius2} stroke="#1A1A1A" strokeWidth={strokeWidth} fill="none" />
            <Circle cx={center} cy={center} r={radius3} stroke="#1A1A1A" strokeWidth={strokeWidth} fill="none" />
            
            {/* Foreground Rings */}
            <Circle
              cx={center}
              cy={center}
              r={radius1}
              stroke={moveColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference1}
              strokeDashoffset={circumference1 * (1 - progress1)}
              strokeLinecap="round"
              rotation="-90"
              origin={`${center}, ${center}`}
            />
            <Circle
              cx={center}
              cy={center}
              r={radius2}
              stroke={trainColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference2}
              strokeDashoffset={circumference2 * (1 - progress2)}
              strokeLinecap="round"
              rotation="-90"
              origin={`${center}, ${center}`}
            />
            <Circle
              cx={center}
              cy={center}
              r={radius3}
              stroke={recoverColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference3}
              strokeDashoffset={circumference3 * (1 - progress3)}
              strokeLinecap="round"
              rotation="-90"
              origin={`${center}, ${center}`}
            />
          </Svg>
        </View>

        {/* Stats Column */}
        <View style={st.statsCol}>
          <View style={st.statBlock}>
            <Text style={st.statLabel}>MOVE</Text>
            <Text style={st.statValue}>
              <Text style={[st.statHero, { color: moveColor }]}>624</Text>
              <Text style={st.statSub}> / 800 kcal</Text>
            </Text>
          </View>
          <View style={st.statBlock}>
            <Text style={st.statLabel}>TRAIN</Text>
            <Text style={st.statValue}>
              <Text style={[st.statHero, { color: trainColor }]}>1</Text>
              <Text style={st.statSub}> / 5 lifts</Text>
            </Text>
          </View>
          <View style={st.statBlock}>
            <Text style={st.statLabel}>RECOVERY</Text>
            <Text style={st.statValue}>
              <Text style={[st.statHero, { color: recoverColor }]}>6h 12m</Text>
              <Text style={st.statSub}> / 8h sleep</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* Week Tracker */}
      <View style={st.weekTracker}>
        {DAYS.map((dayLabel, idx) => {
          const isDone = completedDays.includes(idx);
          const isToday = idx === todayIdx;
          
          return (
            <View key={idx} style={st.dayCol}>
              <View
                style={[
                  st.daySquare,
                  isDone && st.daySquareDone,
                  isToday && !isDone && st.daySquareToday,
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={16} color={moveColor} />
                ) : (
                  <View style={st.dayDot} />
                )}
              </View>
              <Text style={[st.dayLabel, isToday && st.dayLabelToday]}>{dayLabel}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    padding: 24,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 24,
  },
  ringsContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCol: {
    flex: 1,
    gap: 16,
  },
  statBlock: {
    gap: 2,
  },
  statLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  statValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statHero: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    letterSpacing: -0.5,
  },
  statSub: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  weekTracker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: 8,
  },
  daySquare: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySquareDone: {
    backgroundColor: 'rgba(224, 255, 79, 0.1)',
    borderColor: 'rgba(224, 255, 79, 0.4)',
  },
  daySquareToday: {
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dayLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
  dayLabelToday: {
    color: '#FFFFFF',
  },
});
