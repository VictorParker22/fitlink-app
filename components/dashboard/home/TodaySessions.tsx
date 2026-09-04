import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppClients } from '../../../context/AppContext';
import { useRenderCount } from '../../../lib/devRenderCount';
import CardImage from '../../ui/CardImage';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { clientName, useTodaysSessions } from './homeSignals';

/**
 * The next session called out, then the rest of today as a light
 * dot-and-line timeline. Sessions slice for the schedule; clients slice only
 * to resolve athlete names.
 */
const TodaySessions = React.memo(function TodaySessions() {
  useRenderCount('TodaySessions');
  const router = useRouter();
  const { clients } = useAppClients();
  const todaysSessions = useTodaysSessions();

  const nextSession = useMemo(() => {
    const now = Date.now();
    return (
      todaysSessions.find(s => s.status === 'upcoming' && new Date(s.date).getTime() >= now) ||
      todaysSessions.find(s => s.status === 'upcoming') ||
      null
    );
  }, [todaysSessions]);

  const restOfDay = useMemo(
    () => todaysSessions.filter(s => s.id !== nextSession?.id),
    [todaysSessions, nextSession]
  );

  return (
    <>
      {/* ── NEXT SESSION ────────────────────────────────────────── */}
      {nextSession ? (
        <View style={styles.nextCard}>
          <View style={styles.nextHeaderRow}>
            <View style={styles.liveDot} />
            <Text style={styles.nextLabel}>
              {new Date(nextSession.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — up next
            </Text>
          </View>
          <Text style={styles.nextTitle}>
            {nextSession.group_name || clientName(clients, nextSession.client_id)} · {nextSession.type}
          </Text>
          {nextSession.notes ? <Text style={styles.nextSub}>{nextSession.notes}</Text> : null}
          <View style={styles.nextActions}>
            <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
              style={styles.joinBtn}
              activeOpacity={0.85}
              onPress={() => router.push(`/session/${nextSession.id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`Join session with ${nextSession.group_name || clientName(clients, nextSession.client_id)}`}
            >
              <Text style={styles.joinBtnText}>Join session</Text>
            </TouchableOpacity>
            {nextSession.client_id && (
              <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
                style={styles.planBtn}
                activeOpacity={0.85}
                onPress={() => router.push(`/client/${nextSession.client_id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`Open plan for ${clientName(clients, nextSession.client_id)}`}
              >
                <Text style={styles.planBtnText}>Plan</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.noSessionCard}>
          <CardImage
            source={require('../../../assets/images/card-book-session.jpg')}
            extraShade={0.15}
          />
          <Text style={styles.noSessionText}>Nothing on the books today.</Text>
        </View>
      )}

      {/* ── REST OF TODAY — timeline ────────────────────────────── */}
      {restOfDay.length > 0 && (
        <View style={styles.timeline}>
          {restOfDay.map((s, i) => (
            <TouchableOpacity
              key={s.id}
              style={styles.timelineRow}
              activeOpacity={0.7}
              onPress={() => router.push(`/session/${s.id}` as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={`${s.group_name || clientName(clients, s.client_id)}, ${new Date(s.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, ${s.type}. Double tap to open session`}
            >
              <View style={styles.timelineRail}>
                <View style={styles.timelineDot} />
                {i < restOfDay.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineBody}>
                <Text style={styles.timelineTime}>
                  {new Date(s.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={styles.timelineTitle}>
                  {s.group_name || clientName(clients, s.client_id)} · {s.type}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
});

export default TodaySessions;

const styles = StyleSheet.create({
  // Next session
  nextCard: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 18,
  },
  nextHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: {
    width: 7, height: 7, borderRadius: 3.5, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  nextLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.accent,
  },
  nextTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 21.5,
    color: CoachColors.textPrimary,
    marginTop: 8,
  },
  nextSub: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    marginTop: 4,
    lineHeight: 20,
  },
  nextActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  joinBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  joinBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15,
    color: CoachColors.onAccent,
  },
  planBtn: {
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  planBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },

  // Image-backed quiet state (CardImage fills; text sits on the bottom scrim).
  noSessionCard: {
    marginHorizontal: 20,
    marginTop: 24,
    height: 120,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 16,
  },
  noSessionText: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    // Primary (not muted) because it sits over imagery — keeps ≥4.5:1 on the scrim.
    color: CoachColors.textPrimary,
  },

  // Timeline
  timeline: {
    marginHorizontal: 20,
    marginTop: 18,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineRail: {
    alignItems: 'center',
    width: 10,
  },
  timelineDot: {
    width: 8, height: 8, borderRadius: 4, borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: CoachColors.textFaint,
    marginTop: 5,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: CoachColors.borderMuted,
    marginTop: 4,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: 16,
  },
  timelineTime: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },
  timelineTitle: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textPrimary,
    marginTop: 2,
  },
});
