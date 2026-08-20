/**
 * CancelSessionSheet — "Why are you cancelling?" bottom sheet
 *
 * Design philosophy:
 *   • Coach should never have to cancel + manually rebook — the "Reschedule"
 *     path cancels the old session and creates the new one in a single tap.
 *   • Six reason pills drive UX branching. Each reason has its own color/icon.
 *   • Reanimated 3 slide-up + backdrop fade (no external bottom-sheet lib needed).
 *   • Follows the fixed-dark CoachColors token system.
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
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useApp } from '../../context/AppContext';
import { useReducedMotion } from '../../lib/useReducedMotion';

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
  { id: 'reschedule',  label: 'Reschedule it',          icon: 'calendar-outline',        color: CoachColors.accent },
  { id: 'client',      label: 'Client cancelled',        icon: 'person-remove-outline',   color: CoachColors.textSecondary },
  { id: 'coach',       label: 'Coach unavailable',       icon: 'ban-outline',             color: CoachColors.warning },
  { id: 'emergency',   label: 'Emergency',               icon: 'warning-outline',         color: CoachColors.danger },
  { id: 'happened',    label: 'Already happened',        icon: 'checkmark-circle-outline',color: CoachColors.accent },
  { id: 'other',       label: 'Other reason',            icon: 'ellipsis-horizontal',     color: CoachColors.textSecondary },
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
  // A Modal inherits no safe area — the sheet supplies its own bottom clearance.
  const insets = useSafeAreaInsets();

  const [selectedReason, setSelectedReason] = useState<ReasonId | null>(null);
  const [selectedDay,    setSelectedDay]    = useState<Date | null>(null);
  const [selectedTime,   setSelectedTime]   = useState<string>('09:00');
  const [loading,        setLoading]        = useState(false);
  // Reduce Motion: the sheet still needs to arrive and leave, but it does so
  // as a fade rather than a spring slide up from the bottom of the screen.
  const reduceMotion = useReducedMotion();

  // Reanimated values
  const translateY      = useSharedValue(H);
  const backdropOpacity = useSharedValue(0);

  const upcomingDays = getNextNDays(14);

  useEffect(() => {
    if (visible) {
      translateY.value      = reduceMotion ? 0 : withSpring(0, { damping: 22, stiffness: 270, mass: 0.9 });
      backdropOpacity.value = withTiming(1, { duration: reduceMotion ? 0 : 240 });
    } else {
      translateY.value      = reduceMotion ? H : withSpring(H, { damping: 26, stiffness: 300 });
      backdropOpacity.value = withTiming(0, { duration: reduceMotion ? 0 : 200 });
      // Reset form state after dismiss animation completes
      const t = setTimeout(() => {
        setSelectedReason(null);
        setSelectedDay(null);
        setSelectedTime('09:00');
      }, 320);
      return () => clearTimeout(t);
    }
  }, [visible, reduceMotion]);

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
      <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 12 }, sheetStyle]}>
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
                      color={active ? r.color : CoachColors.textMuted}
                    />
                  </View>
                  <Text style={[s.reasonLabel, active && { color: CoachColors.textPrimary }]}>
                    {r.label}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={19} color={r.color} />
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
                <Ionicons name="flash" size={15} color={CoachColors.accent} />
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
                  <ActivityIndicator size="small" color={CoachColors.onAccent} />
                ) : (
                  <>
                    <Ionicons name="calendar" size={19} color={CoachColors.onAccent} />
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
                <ActivityIndicator size="small" color={CoachColors.danger} />
              ) : (
                <>
                  <Ionicons name="close-circle" size={19} color={CoachColors.danger} />
                  <Text style={s.cancelCTAText}>Cancel this session</Text>
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
    backgroundColor:      CoachColors.surface,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    borderWidth:          1,
    borderColor:          CoachColors.border,
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
    borderCurve: 'continuous',
    backgroundColor: CoachColors.border,
    alignSelf:       'center',
    marginTop:       12,
    marginBottom:    6,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop:        16,
    paddingBottom:     20,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  headerTitle: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      W * 0.056,
    color:         CoachColors.textPrimary,
    letterSpacing: -0.5,
    marginBottom:  5,
  },
  headerSub: {
    fontFamily:  CoachFonts.body,
    fontSize:    W * 0.033,
    color:       CoachColors.textMuted,
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
    borderCurve: 'continuous',
    borderWidth:     1,
    borderColor:     CoachColors.borderMuted,
    backgroundColor: CoachColors.bg,
    minHeight:       52,
  },
  reasonIconBg: {
    width:         34,
    height:        34,
    borderRadius:  10,
    borderCurve: 'continuous',
    alignItems:    'center',
    justifyContent:'center',
    flexShrink:    0,
  },
  reasonLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize:   W * 0.038,
    color:      CoachColors.textSecondary,
    flex:       1,
  },
  // ── Reschedule block ─────────────────────────────────────────────────────
  rescheduleBlock: {
    marginTop:       20,
    backgroundColor: CoachColors.accentSofter,
    borderRadius:    18,
    borderCurve: 'continuous',
    borderWidth:     1,
    borderColor:     CoachColors.accentSoft,
    padding:         16,
  },
  callout: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    marginBottom:   18,
  },
  calloutText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize:   W * 0.032,
    color:      CoachColors.accent,
    flex:       1,
    lineHeight: W * 0.045,
  },
  sectionLabel: {
    fontFamily:     CoachFonts.bodyBold,
    fontSize:       W * 0.027,
    color:          CoachColors.textMuted,
    letterSpacing:  1.2,
    textTransform:  'uppercase',
    marginBottom:   10,
  },
  dayScroll: { marginBottom: 4 },
  dayChip: {
    width:           56,
    paddingVertical: 10,
    borderRadius:    12,
    borderCurve: 'continuous',
    borderWidth:     1,
    borderColor:     CoachColors.borderMuted,
    backgroundColor: CoachColors.bg,
    alignItems:      'center',
    gap:             2,
    minHeight:       68,
    justifyContent:  'center',
  },
  dayChipActive: {
    backgroundColor: CoachColors.accent,
    borderColor:     CoachColors.accent,
  },
  dayChipTextActive: {
    color: CoachColors.onAccent,
  },
  dayChipWeekday: {
    fontFamily:    CoachFonts.bodyBold,
    fontSize: 10,
    color:         CoachColors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dayChipNum: {
    fontFamily: CoachFonts.headingBold,
    fontSize:   W * 0.046,
    color:      CoachColors.textPrimary,
    lineHeight: W * 0.056,
  },
  dayChipMonth: {
    fontFamily:    CoachFonts.body,
    fontSize: 10,
    color:         CoachColors.textMuted,
    textTransform: 'uppercase',
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      10,
    borderCurve: 'continuous',
    borderWidth:       1,
    borderColor:       CoachColors.borderMuted,
    backgroundColor:   CoachColors.bg,
    alignItems:        'center',
    minHeight:         44,
    justifyContent:    'center',
  },
  timeChipActive: {
    backgroundColor: CoachColors.accent,
    borderColor:     CoachColors.accent,
  },
  timeChipText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize:   W * 0.034,
    color:      CoachColors.textSecondary,
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
    borderCurve: 'continuous',
    backgroundColor:CoachColors.accent,
    minHeight:      52,
  },
  ctaDisabled: {
    opacity: 0.35,
  },
  rescheduleCTAText: {
    fontFamily: CoachFonts.headingBold,
    fontSize:   W * 0.036,
    color:      CoachColors.onAccent,
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
    borderCurve: 'continuous',
    backgroundColor:CoachColors.dangerSoft,
    borderWidth:    1,
    borderColor:    CoachColors.danger,
    minHeight:      52,
  },
  cancelCTAText: {
    fontFamily: CoachFonts.headingBold,
    fontSize:   W * 0.038,
    color:      CoachColors.danger,
  },
  keepBtn: {
    alignItems:      'center',
    paddingVertical: 20,
    minHeight:       56,
  },
  keepText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize:   W * 0.036,
    color:      CoachColors.textMuted,
  },
});
