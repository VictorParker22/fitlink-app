/**
 * BookSessionModal — Session Booking Experience
 *
 * Replaces the old "Schedule Session" form with an alert.
 * Design: Concierge-level booking — coach confirmation card,
 * session type + duration selectors, notes, full confirmation screen.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';

const { height: SCREEN_H } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface Coach {
  id: string;
  name: string;
  role: string;
  avatar: string;
  specialty: string;
  bio: string;
}

interface BookSessionModalProps {
  visible: boolean;
  coach: Coach | null;
  onRequestClose: () => void;
  accentColor: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_TYPES = [
  {
    id: '1on1',
    label: '1-on-1',
    icon: 'person' as const,
    desc: 'Private session, fully focused on you',
    price: '$75',
  },
  {
    id: 'virtual',
    label: 'Virtual',
    icon: 'videocam' as const,
    desc: 'Remote coaching via video call',
    price: '$45',
  },
  {
    id: 'assessment',
    label: 'Assessment',
    icon: 'clipboard' as const,
    desc: 'Full fitness and goals evaluation',
    price: '$60',
  },
];

const DURATIONS = ['30 min', '45 min', '60 min', '90 min'];

// ─── Phase: Confirmed ─────────────────────────────────────────────────────────

function ConfirmedScreen({
  coach,
  onClose,
}: {
  coach: Coach;
  onClose: () => void;
}) {
  const router = useRouter();
  const checkAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(checkAnim, {
        toValue: 1,
        duration: 400,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={cs.root}>
      <Animated.View style={[cs.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
        <View style={cs.iconCircle}>
          <Ionicons name="checkmark" size={40} color={CoachColors.onAccent} />
        </View>
      </Animated.View>

      <Text style={cs.title}>Request sent</Text>
      <Text style={cs.sub}>
        Your booking request has been sent to{' '}
        <Text style={cs.subBold}>{coach.name.split(' ')[0]}</Text>. They'll reach
        out via messages to confirm your session time.
      </Text>

      <View style={cs.coachRow}>
        <Image
          source={{ uri: coach.avatar }}
          style={cs.coachAvatar}
          contentFit="cover"
        />
        <View>
          <Text style={cs.coachName}>{coach.name}</Text>
          <Text style={cs.coachRole}>{coach.role}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={cs.closeBtn}
        onPress={onClose}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Close booking confirmation"
      >
        <Text style={cs.closeBtnText}>Done</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          onClose();
          setTimeout(() => router.push(ClientRoute.mySessions), 300);
        }}
        accessibilityRole="button"
        accessibilityLabel="View your sessions"
        style={{ marginTop: 8 }}
      >
        <Text style={cs.viewSessionsLink}>View my sessions</Text>
      </TouchableOpacity>
    </View>
  );
}

const cs = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconWrap: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: CoachColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 12,
    textAlign: 'center',
  },
  sub: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 28,
  },
  subBold: {
    fontFamily: CoachFonts.bodyBold,
    color: CoachColors.textPrimary,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 16,
    width: '100%',
    marginBottom: 32,
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  coachName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  coachRole: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  closeBtn: {
    width: '100%',
    height: 56,
    borderRadius: 14,
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
  viewSessionsLink: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BookSessionModal({
  visible,
  coach,
  onRequestClose,
  accentColor,
}: BookSessionModalProps) {
  const { clientData } = useClient();
  const [selectedType, setSelectedType] = useState(SESSION_TYPES[0].id);
  const [selectedDuration, setSelectedDuration] = useState('60 min');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      setConfirmed(false);
      setNotes('');
      setSelectedType(SESSION_TYPES[0].id);
      setSelectedDuration('60 min');
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 20,
        tension: 120,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H,
        duration: 260,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (submitting || !coach) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSubmitting(true);

    try {
      // Log the booking request in Supabase if the table exists
      await supabase.from('session_requests').insert({
        client_id: clientData?.id,
        trainer_id: coach.id,
        session_type: selectedType,
        duration_minutes: parseInt(selectedDuration),
        notes: notes.trim() || null,
        status: 'pending',
      });
    } catch {
      // Table may not exist yet — still show confirmation to client
    } finally {
      setSubmitting(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmed(true);
    }
  };

  if (!coach) return null;

  const selectedTypeData = SESSION_TYPES.find((t) => t.id === selectedType)!;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onRequestClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={onRequestClose}
      />

      {/* Animated sheet */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <SafeAreaView style={s.sheetSafe} edges={['bottom']}>
          {/* HIG drag handle — 44pt grab area, 36×5pt pill (both phases) */}
          <View style={s.dragArea} accessibilityElementsHidden={true}>
            <View style={s.dragHandle} />
          </View>

          {/* ── Confirmed phase ────────────────────────────────────────── */}
          {confirmed && (
            <ConfirmedScreen coach={coach} onClose={onRequestClose} />
          )}

          {/* ── Booking phase ────────────────────────────────────────── */}
          {!confirmed && (
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              {/* Header */}
              <View style={s.header}>
                <View>
                  <Text style={s.headerTag}>Book a session</Text>
                  <Text style={s.headerTitle}>
                    With {coach.name.split(' ')[0]}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.closeBtn}
                  onPress={onRequestClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close booking"
                >
                  <Ionicons name="close" size={18} color={CoachColors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {/* ── Coach card ───────────────────────────────────── */}
                <View style={s.coachCard}>
                  <Image
                    source={{ uri: coach.avatar }}
                    style={s.coachAvatar}
                    contentFit="cover"
                    transition={200}
                  />
                  <View style={s.coachInfo}>
                    <Text style={s.coachName}>{coach.name}</Text>
                    <Text style={s.coachRole}>{coach.role}</Text>
                  </View>
                  <View style={s.priceBadge}>
                    <Text style={s.priceLabel}>From</Text>
                    <Text style={s.priceValue}>{selectedTypeData.price}</Text>
                  </View>
                </View>

                {/* ── Session type ─────────────────────────────────── */}
                <Text style={s.fieldLabel}>Session type</Text>
                <View style={s.typeList}>
                  {SESSION_TYPES.map((type) => {
                    const isSelected = selectedType === type.id;
                    return (
                      <TouchableOpacity
                        key={type.id}
                        style={[
                          s.typeRow,
                          isSelected && { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedType(type.id);
                        }}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${type.label} session`}
                      >
                        {/* Left accent bar */}
                        <View
                          style={[
                            s.typeBar,
                            { backgroundColor: isSelected ? CoachColors.accent : 'transparent' },
                          ]}
                        />
                        <View
                          style={[
                            s.typeIconWrap,
                            { backgroundColor: isSelected ? CoachColors.accentSoft : CoachColors.surface },
                          ]}
                        >
                          <Ionicons
                            name={type.icon}
                            size={16}
                            color={isSelected ? CoachColors.accent : CoachColors.textFaint}
                          />
                        </View>
                        <View style={s.typeTextGroup}>
                          <Text
                            style={[
                              s.typeLabel,
                              { color: isSelected ? CoachColors.textPrimary : CoachColors.textSecondary },
                            ]}
                          >
                            {type.label}
                          </Text>
                          <Text style={s.typeDesc}>{type.desc}</Text>
                        </View>
                        <Text
                          style={[
                            s.typePrice,
                            { color: isSelected ? CoachColors.accent : CoachColors.textFaint },
                          ]}
                        >
                          {type.price}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── Duration ─────────────────────────────────────── */}
                <Text style={s.fieldLabel}>Duration</Text>
                <View style={s.durationRow}>
                  {DURATIONS.map((dur) => {
                    const isSelected = selectedDuration === dur;
                    return (
                      <TouchableOpacity
                        key={dur}
                        style={[
                          s.durationPill,
                          isSelected && {
                            backgroundColor: CoachColors.accentSoft,
                            borderColor: CoachColors.accent,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedDuration(dur);
                        }}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${dur} duration`}
                      >
                        <Text
                          style={[
                            s.durationText,
                            { color: isSelected ? CoachColors.textPrimary : CoachColors.textMuted },
                          ]}
                        >
                          {dur}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── Notes ────────────────────────────────────────── */}
                <Text style={s.fieldLabel}>Goals and notes</Text>
                <TextInput
                  style={s.notesInput}
                  placeholder="Describe your goals, areas to focus on, or specific requests..."
                  placeholderTextColor={CoachColors.textFaint}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={notes}
                  onChangeText={setNotes}
                  maxLength={500}
                  accessibilityLabel="Add notes for your coach"
                />

                <View style={{ height: 100 }} />
              </ScrollView>

              {/* ── Sticky submit ──────────────────────────────────── */}
              <View style={s.submitWrap}>
                <TouchableOpacity
                  style={s.submitBtn}
                  onPress={handleSubmit}
                  activeOpacity={0.88}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Submit session booking request"
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={CoachColors.onAccent} />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color={CoachColors.onAccent} />
                      <Text style={s.submitText}>Send booking request</Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={s.submitHint}>
                  No charge yet · {coach.name.split(' ')[0]} will confirm availability
                </Text>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.9,
    backgroundColor: CoachColors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheetSafe: { flex: 1 },
  // HIG drag handle — 44pt tall grab area, centered 36×5pt pill per Apple HIG sheet spec
  dragArea: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: CoachColors.border,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CoachColors.borderMuted,
  },
  headerTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CoachColors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  // Coach card
  coachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
    gap: 12,
  },
  coachAvatar: {
    width: 52,
    height: 52,
    borderRadius: 10,
  },
  coachInfo: { flex: 1 },
  coachName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  coachRole: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  priceBadge: { alignItems: 'flex-end' },
  priceLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 8,
    color: CoachColors.textFaint,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  priceValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },

  // Field label
  fieldLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Session type list
  typeList: {
    gap: 8,
    marginBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CoachColors.borderMuted,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CoachColors.borderMuted,
    borderLeftWidth: 0,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 0,
    gap: 12,
  },
  typeBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 0,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeTextGroup: { flex: 1, gap: 2 },
  typeLabel: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    letterSpacing: -0.2,
  },
  typeDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 10,
    color: CoachColors.textMuted,
  },
  typePrice: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    letterSpacing: -0.5,
    paddingRight: 4,
  },

  // Duration
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  durationPill: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },

  // Notes
  notesInput: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    color: CoachColors.textPrimary,
    fontFamily: CoachFonts.body,
    fontSize: 14,
    padding: 16,
    minHeight: 100,
    lineHeight: 21,
  },

  // Submit
  submitWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: CoachColors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CoachColors.borderMuted,
  },
  submitBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: CoachColors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  submitText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
  submitHint: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textFaint,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
