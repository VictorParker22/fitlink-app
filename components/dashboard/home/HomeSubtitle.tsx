import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRenderCount } from '../../../lib/devRenderCount';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useAtRiskClients, useTodaysSessions } from './homeSignals';

interface HomeSubtitleProps {
  /** Fetched once by PendingCheckInsSync and handed down as a number. */
  pendingCheckIns: number;
}

/**
 * "N sessions · N check-ins waiting · N athletes quiet". Sessions slice for
 * the count; clients + sessions for the quiet-athlete signal.
 */
const HomeSubtitle = React.memo(function HomeSubtitle({ pendingCheckIns }: HomeSubtitleProps) {
  useRenderCount('HomeSubtitle');
  const todaysSessions = useTodaysSessions();
  const atRiskClients = useAtRiskClients();

  const subtitleParts: { text: string; danger?: boolean }[] = [
    { text: `${todaysSessions.length} session${todaysSessions.length === 1 ? '' : 's'}` },
  ];
  if (pendingCheckIns > 0) {
    subtitleParts.push({ text: `${pendingCheckIns} check-in${pendingCheckIns === 1 ? '' : 's'} waiting` });
  }
  if (atRiskClients.length > 0) {
    subtitleParts.push({ text: `${atRiskClients.length} athlete${atRiskClients.length === 1 ? '' : 's'} quiet`, danger: true });
  }

  return (
    <View style={styles.subtitleRow}>
      {subtitleParts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text style={styles.subtitleDot}> · </Text>}
          <Text style={[styles.subtitleText, part.danger && styles.subtitleDanger]}>{part.text}</Text>
        </React.Fragment>
      ))}
    </View>
  );
});

export default HomeSubtitle;

const styles = StyleSheet.create({
  subtitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  subtitleText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
  },
  subtitleDanger: {
    color: CoachColors.danger,
    fontFamily: CoachFonts.bodySemiBold,
  },
  subtitleDot: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textFaint,
  },
});
