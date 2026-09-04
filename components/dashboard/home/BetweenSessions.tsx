import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppBusiness } from '../../../context/AppContext';
import { useRenderCount } from '../../../lib/devRenderCount';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useAtRiskClients } from './homeSignals';

interface BetweenSessionsProps {
  /** Fetched once by PendingCheckInsSync and handed down as a number. */
  pendingCheckIns: number;
  /** Scrolls the shell's ScrollView to the check-in inbox. */
  onReviewCheckIns: () => void;
}

type BetweenItem = { label: string; cta: string; onPress: () => void };

/**
 * A short "between sessions" action list built from real signals: quiet
 * athletes (clients + sessions), unreplied check-ins (prop), unread messages
 * (business). Three slices, because the list is one ordered thing.
 */
const BetweenSessions = React.memo(function BetweenSessions({ pendingCheckIns, onReviewCheckIns }: BetweenSessionsProps) {
  useRenderCount('BetweenSessions');
  const router = useRouter();
  const atRiskClients = useAtRiskClients();
  const { notifications } = useAppBusiness();

  // Unread message notifications — proxy for "waiting on a reply" until Home
  // has its own conversation-level query (Messages tab has the real one).
  const unreadMessages = useMemo(
    () => notifications.filter(n => n.type === 'message' && !n.is_read),
    [notifications]
  );

  const betweenItems: BetweenItem[] = [];
  if (atRiskClients.length > 0) {
    betweenItems.push({
      label: `Nudge ${atRiskClients.length} quiet athlete${atRiskClients.length === 1 ? '' : 's'}`,
      cta: 'Start',
      onPress: () => router.push('/(tabs)/clients'),
    });
  }
  if (pendingCheckIns > 0) {
    betweenItems.push({
      label: `Review ${pendingCheckIns} check-in${pendingCheckIns === 1 ? '' : 's'}`,
      cta: 'Open',
      onPress: onReviewCheckIns,
    });
  }
  if (unreadMessages.length > 0) {
    const label = unreadMessages.length === 1 && unreadMessages[0].title
      ? `Reply to ${unreadMessages[0].title.replace(/^New message from\s*/i, '')}`
      : `Reply to ${unreadMessages.length} conversations`;
    betweenItems.push({ label, cta: 'Reply', onPress: () => router.push('/(tabs)/messages') });
  }

  return (
    <>
      <Text style={styles.betweenLabel}>Between sessions</Text>
      {betweenItems.length > 0 ? (
        <View style={styles.betweenList}>
          {betweenItems.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.betweenRow}
              activeOpacity={0.7}
              onPress={item.onPress}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}. Double tap to ${item.cta.toLowerCase()}`}
            >
              <Text style={styles.betweenText}>{item.label}</Text>
              <Text style={styles.betweenCta}>{item.cta} →</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.betweenEmpty}>Nothing waiting on you right now.</Text>
      )}
    </>
  );
});

export default BetweenSessions;

const styles = StyleSheet.create({
  betweenLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    color: CoachColors.textFaint,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  betweenList: {
    paddingHorizontal: 20,
    gap: 14,
  },
  betweenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  betweenText: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
    flex: 1,
    marginRight: 12,
  },
  betweenCta: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
  betweenEmpty: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textFaint,
    paddingHorizontal: 20,
  },
});
