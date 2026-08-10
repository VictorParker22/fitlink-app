/**
 * CancelSessionSheet — "Why are you cancelling?" bottom sheet
 *
 * Design philosophy:
 *   • Coach should never have to cancel + manually rebook — the "Reschedule"
 *     path cancels the old session and creates the new one in a single tap.
 *   • Six reason pills drive UX branching. Each reason has its own color/icon.
 *   • Reanimated 3 slide-up + backdrop fade (no external bottom-sheet lib needed).
 *   • Follows #0D0D12 / #C8F135 design system exactly.
 */

import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../constants/theme';
import { useApp } from '../../context/AppContext';

const { height: H } = Dimensions.get('window');
const W = Dimensions.get('window').width;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SheetSession {
  id: string;
  date: string;
  type: string;
  duration: number;
  client_id?: string;
  group_name?: string;
}

export interface CancelSessionSheetProps {
  visible: boolean;
  session: SheetSession | null;
  onDismiss: () => void;
  /** Called after a successful cancel OR reschedule */
  onDone: () => void;
}

// ─── Reason config ───────────────────────────────────────────────────────────

const REASONS = [
  { id: 'reschedule',  label: 'Reschedule it',          icon: 'calendar-outline',        color: '#C8F135' },
  { id: 'client',      label: 'Client cancelled',        icon: 'person-remove-outline',   color: '#60A5FA' },
  { id: 'coach',       label: 'Coach unavailable',       icon: 'ban-outline',             color: '#F59E0B' },
  { id: 'emergency',   label: 'Emergency',               icon: 'warning-outline',         color: '#EF4444' },
  { id: 'happened',    label: 'Already happened',        icon: 'checkmark-circle-outline',color: '#22C55E' },
  { id: 'other',       label: 'Other reason',            icon: 'ellipsis-horizontal',     color: '#A78BFA' },
] as const;

type ReasonId = typeof REASONS[number]['id'];

// ─── Date helpers ─────────────────────────────────────────────────────────────

const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getNextNDays(n: number): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

const TIME_SLOTS = [
  '06:00','07:00','08:00','09:00','10:00','11:00',
  '12:00','13:00','14:00','15:00','16:00','17:00',
  '18:00','19:00','20:00',
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function CancelSessionSheet({
  visible, session, onDismiss, onDone,
}: CancelSessionSheetProps) {
  const { updateSession, addSession } = useApp();

  const [selectedReason, setSelectedReason] = useState<ReasonId | null>(null);
  const [selectedDay,    setSelectedDay]    = useState<Date | null>(null);
  const [selectedTime,   setSelectedTime]   = useState<string>('09:00');
  const [loading,        setLoading]        = useState(false);

  // Reanimated values
  const translateY      = useSharedValue(H);
  const backdropOpacity = useSharedValue(0);

  const upcomingDays = getNextNDays(14);

  useEffect(() => {
    if (visible) {
      translateY.value      = withSpring(0, { damping: 22, stiffness: 270, mass: 0.9 });
      backdropOpacity.value = withTiming(1, { duration: 240 });
    } else {
      translateY.value      = withSpring(H, { damping: 26, stiffness: 300 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
      // Reset form state after dismiss animation completes
      const t = setTimeout(() => {
        setSelectedReason(null);
        setSelectedDay(null);
        setSelectedTime('09:00');
      }, 320);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectReason = (id: ReasonId) => {
    Haptics.selectionAsync();
    setSelectedReason(id);
    if (id !== 'reschedule') setSelectedDay(null);
  };

  const handleDismiss = () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  };

  /** Mark the session as cancelled only */
  const handleCancelOnly = useCallback(async () => {
    if (!session || !selectedReason || loading) return;
    setLoading(true);
    try {
      const label = REASONS.find(r => r.id === selectedReason)?.label ?? selectedReason;
      await updateSession(session.id, {
        status: 'cancelled',
        notes: `Cancelled — ${label}`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [session, selectedReason, loading, updateSession, onDone]);

  /** Reschedule: cancel old + create new in one tap */
  const handleReschedule = useCallback(async () => {
    if (!session || !selectedDay || loading) return;
    setLoading(true);
    try {
      const [hour, minute] = selectedTime.split(':').map(Number);
      const newDate = new Date(selectedDay);
      newDate.setHours(hour, minute, 0, 0);

      const oldDateLabel = new Date(session.date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
      });
      const newDateLabel = newDate.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });

      // 1. Cancel old session
      await updateSession(session.id, {
        status: 'cancelled',
        notes: `Rescheduled → ${newDateLabel} at ${selectedTime}`,
      });

      // 2. Create rescheduled session
      await addSession({
        client_id:  session.client_id,
        group_name: session.group_name,
        date:       newDate.toISOString(),
        duration:   session.duration,
        type:       session.type,
        status:     'upcoming',
        notes:      `Rescheduled from ${oldDateLabel}`,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [session, selectedDay, selectedTime, loading, updateSession, addSession, onDone]);

  // Don't render DOM at all until first open
  if (!visible && translateY.value >= H - 2) return null;

  const isReschedule   = selectedReason === 'reschedule';
  const canReschedule  = isReschedule && !!selectedDay;
  const canCancelOnly  = !!selectedReason && !isReschedule;

  // Build the CTA label for reschedule
  const rescheduleCTALabel = selectedDay
    ? `Move to ${DAY_SHORT[selectedDay.getDay()]} ${MONTH_SHORT[selectedDay.getMonth()]} ${selectedDay.getDate()} at ${selectedTime}`
    : 'Select a date above first';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      {/* ── Backdrop ── */}
      <Animated.View style={[s.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>

      {/* ── Sheet ── */}
      <Animated.View style={[s.sheet, sheetStyle]}>
        {/* Drag handle */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Why are you cancelling?</Text>
          <Text style={s.headerSub}>
            Help us reschedule smarter — no need to cancel and manually rebook.
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Reason pills ── */}
          <View style={s.reasons}>
            {REASONS.map((r) => {
              const active = selectedReason === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    s.reasonPill,
                    active && { borderColor: r.color, backgroundColor: `${r.color}12` },
                  ]}
                  onPress={() => handleSelectReason(r.id)}
                  activeOpacity={0.72}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={r.label}
                >
                  <View style={[s.reasonIconBg, { backgroundColor: `${r.color}18` }]}>
                    <Ionicons
                      name={r.icon as any}
                      size={17}
                      color={active ? r.color : 'rgba(255,255,255,0.35)'}
                    />
                  </View>
                  <Text style={[s.reasonLabel, active && { color: '#FFFFFF' }]}>
                    {r.label}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={17} color={r.color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Reschedule expander ── */}
          {isReschedule && (
            <View style={s.rescheduleBlock}>
              {/* Callout */}
              <View style={s.callout}>
                <Ionicons name="flash" size={13} color="#C8F135" />
                <Text style={s.calloutText}>
                  No cancel & rebook — we'll move it in one tap.
                </Text>
              </View>

              {/* Day grid */}
              <Text style={s.sectionLabel}>New date</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.dayScroll}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
              >
                {upcomingDays.map((day, i) => {
                  const active = selectedDay?.toDateString() === day.toDateString();
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[s.dayChip, active && s.dayChipActive]}
                      onPress={() => { Haptics.selectionAsync(); setSelectedDay(day); }}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[s.dayChipWeekday, active && s.dayChipTextActive]}>
                        {DAY_SHORT[day.getDay()]}
                      </Text>
                      <Text style={[s.dayChipNum, active && s.dayChipTextActive]}>
                        {day.getDate()}
                      </Text>
                      <Text style={[s.dayChipMonth, active && s.dayChipTextActive]}>
                        {MONTH_SHORT[day.getMonth()]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Time slots */}
              <Text style={[s.sectionLabel, { marginTop: 18 }]}>New time</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
              >
                {TIME_SLOTS.map((t) => {
                  const active = selectedTime === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[s.timeChip, active && s.timeChipActive]}
                      onPress={() => { Haptics.selectionAsync(); setSelectedTime(t); }}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[s.timeChipText, active && s.dayChipTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Reschedule CTA */}
              <TouchableOpacity
                style={[s.rescheduleCTA, !canReschedule && s.ctaDisabled]}
                onPress={handleReschedule}
                disabled={!canReschedule || loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={rescheduleCTALabel}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#0D0D12" />
                ) : (
                  <>
                    <Ionicons name="calendar" size={17} color="#0D0D12" />
                    <Text style={s.rescheduleCTAText} numberOfLines={1}>
                      {rescheduleCTALabel}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Cancel-only CTA (non-reschedule reasons) ── */}
          {canCancelOnly && (
            <TouchableOpacity
              style={s.cancelCTA}
              onPress={handleCancelOnly}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cancel this session"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <Ionicons name="close-circle" size={17} color="#EF4444" />
                  <Text style={s.cancelCTAText}>Cancel This Session</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ── Keep session link ── */}
          <TouchableOpacity
            style={s.keepBtn}
            onPress={handleDismiss}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Keep the session, go back"
          >
            <Text style={s.keepText}>Keep the session</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    position:             'absolute',
    bottom:               0,
    left:                 0,
    right:                0,
    backgroundColor:      '#111118',
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    borderWidth:          1,
    borderColor:          'rgba(255,255,255,0.08)',
    paddingBottom:        Platform.OS === 'ios' ? 44 : 28,
    maxHeight:            H * 0.92,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },
  handle: {
    width:           38,
    height:          4,
    borderRadius:    2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf:       'center',
    marginTop:       12,
    marginBottom:    6,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop:        16,
    paddingBottom:     20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.056,
    color:         '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom:  5,
  },
  headerSub: {
    fontFamily:  FontFamily.body,
    fontSize:    W * 0.033,
    color:       'rgba(255,255,255,0.42)',
    lineHeight:  W * 0.048,
  },
  scrollContent: {
    padding:       20,
    paddingBottom: 8,
  },
  reasons: {
    gap: 10,
  },
  reasonPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    minHeight:       52,
  },
  reasonIconBg: {
    width:         34,
    height:        34,
    borderRadius:  10,
    alignItems:    'center',
    justifyContent:'center',
    flexShrink:    0,
  },
  reasonLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize:   W * 0.038,
    color:      'rgba(255,255,255,0.55)',
    flex:       1,
  },
  // ── Reschedule block ─────────────────────────────────────────────────────
  rescheduleBlock: {
    marginTop:       20,
    backgroundColor: 'rgba(200,241,53,0.04)',
    borderRadius:    18,
    borderWidth:     1,
    borderColor:     'rgba(200,241,53,0.18)',
    padding:         16,
  },
  callout: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    marginBottom:   18,
  },
  calloutText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize:   W * 0.032,
    color:      '#C8F135',
    flex:       1,
    lineHeight: W * 0.045,
  },
  sectionLabel: {
    fontFamily:     FontFamily.bodyBold,
    fontSize:       W * 0.027,
    color:          'rgba(255,255,255,0.38)',
    letterSpacing:  1.2,
    textTransform:  'uppercase',
    marginBottom:   10,
  },
  dayScroll: { marginBottom: 4 },
  dayChip: {
    width:           56,
    paddingVertical: 10,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems:      'center',
    gap:             2,
    minHeight:       68,
    justifyContent:  'center',
  },
  dayChipActive: {
    backgroundColor: '#C8F135',
    borderColor:     '#C8F135',
  },
  dayChipTextActive: {
    color: '#0D0D12',
  },
  dayChipWeekday: {
    fontFamily:    FontFamily.bodyBold,
    fontSize:      9,
    color:         'rgba(255,255,255,0.42)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dayChipNum: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize:   W * 0.046,
    color:      '#FFFFFF',
    lineHeight: W * 0.056,
  },
  dayChipMonth: {
    fontFamily:    FontFamily.body,
    fontSize:      9,
    color:         'rgba(255,255,255,0.36)',
    textTransform: 'uppercase',
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      10,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.1)',
    backgroundColor:   'rgba(255,255,255,0.04)',
    alignItems:        'center',
    minHeight:         44,
    justifyContent:    'center',
  },
  timeChipActive: {
    backgroundColor: '#C8F135',
    borderColor:     '#C8F135',
  },
  timeChipText: {
    fontFamily: FontFamily.bodyBold,
    fontSize:   W * 0.034,
    color:      'rgba(255,255,255,0.65)',
  },
  // ── CTAs ─────────────────────────────────────────────────────────────────
  rescheduleCTA: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    marginTop:      18,
    paddingVertical:15,
    borderRadius:   14,
    backgroundColor:'#C8F135',
    minHeight:      52,
  },
  ctaDisabled: {
    opacity: 0.35,
  },
  rescheduleCTAText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize:   W * 0.036,
    color:      '#0D0D12',
    flexShrink: 1,
  },
  cancelCTA: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    marginTop:      20,
    paddingVertical:14,
    borderRadius:   14,
    backgroundColor:'rgba(239,68,68,0.1)',
    borderWidth:    1,
    borderColor:    'rgba(239,68,68,0.28)',
    minHeight:      52,
  },
  cancelCTAText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize:   W * 0.038,
    color:      '#EF4444',
  },
  keepBtn: {
    alignItems:      'center',
    paddingVertical: 20,
    minHeight:       56,
  },
  keepText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize:   W * 0.036,
    color:      'rgba(255,255,255,0.3)',
  },
});
