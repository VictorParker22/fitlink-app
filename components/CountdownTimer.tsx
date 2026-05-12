import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontFamily, FontSize, Radius, Spacing } from '../constants/theme';

interface CountdownTimerProps {
  targetDate: Date;
  accentColor: string;
  bgColor: string;
  textColor: string;
  subtextColor: string;
}

function getTimeRemaining(target: Date) {
  const now = new Date().getTime();
  const diff = Math.max(0, target.getTime() - now);

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const totalHours = diff / (1000 * 60 * 60);

  return { days, hours, minutes, seconds, totalHours, isExpired: diff === 0 };
}

function getUrgencyColor(totalHours: number, accentColor: string) {
  if (totalHours <= 1) return '#EF4444';   // Red — imminent
  if (totalHours <= 24) return '#F59E0B';  // Yellow — today
  return '#22C55E';                         // Green — plenty of time
}

export default function CountdownTimer({
  targetDate,
  accentColor,
  bgColor,
  textColor,
  subtextColor,
}: CountdownTimerProps) {
  const [time, setTime] = useState(() => getTimeRemaining(targetDate));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTime(getTimeRemaining(targetDate));
    intervalRef.current = setInterval(() => {
      setTime(getTimeRemaining(targetDate));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [targetDate.getTime()]);

  const urgencyColor = getUrgencyColor(time.totalHours, accentColor);

  const segments = [
    { value: time.days, label: 'DAYS' },
    { value: time.hours, label: 'HRS' },
    { value: time.minutes, label: 'MIN' },
    { value: time.seconds, label: 'SEC' },
  ];

  // Hide days segment if 0
  const visibleSegments = time.days > 0 ? segments : segments.slice(1);

  if (time.isExpired) {
    return (
      <View style={[styles.expiredContainer, { backgroundColor: bgColor }]}>
        <Text style={[styles.expiredText, { color: urgencyColor }]}>Session Starting!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.segmentRow}>
        {visibleSegments.map((seg, i) => (
          <View key={seg.label} style={styles.segmentWrapper}>
            <View style={[styles.segment, { backgroundColor: bgColor }]}>
              <Text style={[styles.segmentValue, { color: urgencyColor }]}>
                {String(seg.value).padStart(2, '0')}
              </Text>
            </View>
            <Text style={[styles.segmentLabel, { color: subtextColor }]}>{seg.label}</Text>
            {i < visibleSegments.length - 1 && (
              <Text style={[styles.segmentSeparator, { color: subtextColor }]}>:</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  segmentWrapper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  segment: {
    width: 52,
    height: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    letterSpacing: -0.5,
  },
  segmentLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    letterSpacing: 0.5,
    marginTop: 4,
    position: 'absolute',
    bottom: -14,
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  segmentSeparator: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    marginTop: -4,
  },
  expiredContainer: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  expiredText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.lg,
  },
});
