import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily } from '../../../constants/theme';

interface ConsistencyRingProps {
  completedDays?: number[]; // e.g. [0, 1, 3] for Mon, Tue, Thu
  restDays?: number[]; // e.g. [2, 6] for Wed, Sun
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function ConsistencyRing({ completedDays = [0, 1, 3, 4], restDays = [2, 5, 6] }: ConsistencyRingProps) {
  const todayIdx = (new Date().getDay() + 6) % 7; // Monday = 0

  return (
    <View style={st.container}>
      <View style={st.headerRow}>
        <Text style={st.sectionTag}>WEEKLY RHYTHM // PERFORMANCE TRACKER</Text>
        <Text style={st.scoreText}>{completedDays.length} ACTIVE • {restDays.length} RECOVERY</Text>
      </View>

      <View style={st.daysRow}>
        {DAYS.map((dayLabel, idx) => {
          const isDone = completedDays.includes(idx);
          const isRest = restDays.includes(idx);
          const isToday = idx === todayIdx;

          let bg = '#141418';
          let border = '#27272A';
          let iconColor = 'transparent';

          if (isDone) {
            bg = '#0C1C12';
            border = '#22C55E';
            iconColor = '#22C55E';
          } else if (isRest) {
            bg = '#0C1420';
            border = '#4D94FF';
            iconColor = '#4D94FF';
          }

          return (
            <View key={idx} style={st.dayCol}>
              <View
                style={[
                  st.daySquare,
                  { backgroundColor: bg, borderColor: border },
                  isToday && st.todaySquareBorder,
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={12} color={iconColor} />
                ) : isRest ? (
                  <Ionicons name="moon" size={10} color={iconColor} />
                ) : (
                  <View style={st.emptyDot} />
                )}
              </View>
              <Text style={[st.dayLabel, isToday && st.todayLabelText]}>{dayLabel}</Text>
            </View>
          );
        })}
      </View>

      <View style={st.legendRow}>
        <View style={st.legendItem}>
          <View style={[st.legendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={st.legendText}>WORKOUT</Text>
        </View>
        <View style={st.legendItem}>
          <View style={[st.legendDot, { backgroundColor: '#4D94FF' }]} />
          <Text style={st.legendText}>RECOVERY</Text>
        </View>
        <View style={st.legendItem}>
          <View style={[st.legendDot, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
          <Text style={st.legendText}>SCHEDULED</Text>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
  },
  scoreText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#6C9BF2',
    letterSpacing: 1,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  dayCol: {
    alignItems: 'center',
    gap: 6,
  },
  daySquare: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  todaySquareBorder: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dayLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  todayLabelText: {
    color: '#FFFFFF',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
  },
});
