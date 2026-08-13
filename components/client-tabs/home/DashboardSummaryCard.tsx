import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { calculateLevel, calculateProgressToNextLevel, XP_PER_LEVEL } from '../../../utils/xp';

interface DashboardSummaryCardProps {
  completedDays?: number[];   // indices 0-6 (Mon-Sun)
  todayIdx?: number;
  mealsLoggedToday?: number;  // how many meals logged today
  targetMeals?: number;       // daily meal target
  completedWeekWorkouts?: number; // workouts completed this week
  targetWeekWorkouts?: number;    // weekly workout target
  xp?: number;                // client total XP
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function DashboardSummaryCard({
  completedDays = [],
  todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1,
  mealsLoggedToday = 0,
  targetMeals = 3,
  completedWeekWorkouts = 0,
  targetWeekWorkouts = 5,
  xp = 0,
}: DashboardSummaryCardProps) {

  // SVG dimensions and colors
  const size = 120;
  const strokeWidth = 14;
  const center = size / 2;
  const radius1 = center - strokeWidth;
  const radius2 = radius1 - strokeWidth - 2;
  const radius3 = radius2 - strokeWidth - 2;

  // One accent hue — rings stay distinguishable via opacity steps
  const moveColor = CoachColors.accent;
  const trainColor = 'rgba(198,242,78,0.6)';
  const recoverColor = 'rgba(198,242,78,0.3)';

  const circumference1 = 2 * Math.PI * radius1;
  const circumference2 = 2 * Math.PI * radius2;
  const circumference3 = 2 * Math.PI * radius3;

  // Real progress values derived from props
  const progress1 = Math.min(mealsLoggedToday / Math.max(targetMeals, 1), 1);
  const progress2 = Math.min(completedWeekWorkouts / Math.max(targetWeekWorkouts, 1), 1);
  // XP progress within current level (0–1)
  const levelProgress = calculateProgressToNextLevel(xp) / 100;
  const progress3 = Math.min(Math.max(levelProgress, 0), 1);
  const currentLevel = calculateLevel(xp);
  const xpInLevel = xp - (currentLevel - 1) * XP_PER_LEVEL;
  const xpToNext = XP_PER_LEVEL;

  return (
    <View style={st.card}>
      <View style={st.topRow}>
        {/* Rings */}
        <View style={st.ringsContainer}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background Tracks */}
            <Circle cx={center} cy={center} r={radius1} stroke={CoachColors.borderMuted} strokeWidth={strokeWidth} fill="none" />
            <Circle cx={center} cy={center} r={radius2} stroke={CoachColors.borderMuted} strokeWidth={strokeWidth} fill="none" />
            <Circle cx={center} cy={center} r={radius3} stroke={CoachColors.borderMuted} strokeWidth={strokeWidth} fill="none" />

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
            <Text style={st.statLabel}>Move</Text>
            <Text style={st.statValue}>
              <Text style={[st.statHero, { color: moveColor }]}>{mealsLoggedToday}</Text>
              <Text style={st.statSub}> / {targetMeals} meals</Text>
            </Text>
          </View>
          <View style={st.statBlock}>
            <Text style={st.statLabel}>Train</Text>
            <Text style={st.statValue}>
              <Text style={[st.statHero, { color: trainColor }]}>{completedWeekWorkouts}</Text>
              <Text style={st.statSub}> / {targetWeekWorkouts} lifts</Text>
            </Text>
          </View>
          <View style={st.statBlock}>
            <Text style={st.statLabel}>XP level</Text>
            <Text style={st.statValue}>
              <Text style={[st.statHero, { color: recoverColor }]}>{xpInLevel}</Text>
              <Text style={st.statSub}> / {xpToNext}</Text>
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
                  <Ionicons name="checkmark" size={16} color={CoachColors.accent} />
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
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
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
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  statValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statHero: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    letterSpacing: -0.5,
  },
  statSub: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 11,
    color: CoachColors.textFaint,
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
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySquareDone: {
    backgroundColor: CoachColors.accentSofter,
    borderColor: 'rgba(198,242,78,0.4)',
  },
  daySquareToday: {
    borderColor: CoachColors.textPrimary,
    borderWidth: 1.5,
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoachColors.textFaint,
  },
  dayLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textFaint,
  },
  dayLabelToday: {
    color: CoachColors.textPrimary,
  },
});
