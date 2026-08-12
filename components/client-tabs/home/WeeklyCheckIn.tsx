/**
 * WeeklyCheckIn — Client-side weekly progress check-in form
 *
 * Surfaces once per week as a prompt card on the client home screen.
 * Clients rate 5 dimensions (1–5), add a highlight, struggle, and
 * optional body weight. Submits directly to coach's inbox.
 *
 * Design: Slides open from a compact prompt card into a full form.
 * Matches the "Editorial Precision" aesthetic — dark, tight typography,
 * accent-colored interactive elements.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { useClient } from '../../../context/ClientContext';
import { FontFamily } from '../../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RatingField {
  key: 'energy_level' | 'sleep_quality' | 'stress_level' | 'workout_adherence' | 'diet_adherence';
  label: string;
  emoji: string;
  color: string;
  lowLabel: string;
  highLabel: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const RATING_FIELDS: RatingField[] = [
  { key: 'energy_level',      label: 'Energy',           emoji: '⚡', color: '#FFD700', lowLabel: 'Drained',  highLabel: 'Charged' },
  { key: 'sleep_quality',     label: 'Sleep Quality',    emoji: '😴', color: '#A855F7', lowLabel: 'Poor',     highLabel: 'Great' },
  { key: 'stress_level',      label: 'Stress',           emoji: '🧠', color: '#FF6B35', lowLabel: 'Relaxed',  highLabel: 'Maxed out' },
  { key: 'workout_adherence', label: 'Workout Adherence',emoji: '💪', color: '#22C55E', lowLabel: 'Skipped',  highLabel: 'Nailed it' },
  { key: 'diet_adherence',    label: 'Diet Adherence',   emoji: '🥗', color: '#5B7FFF', lowLabel: 'Off track', highLabel: 'Spot on' },
];

type Ratings = Record<RatingField['key'], number>;

const DEFAULT_RATINGS: Ratings = {
  energy_level: 0,
  sleep_quality: 0,
  stress_level: 0,
  workout_adherence: 0,
  diet_adherence: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

const WEEK_START = getMondayOfWeek();

// ─── Rating Row ───────────────────────────────────────────────────────────────

function RatingRow({
  field,
  value,
  onChange,
}: {
  field: RatingField;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={r.container}>
      <View style={r.header}>
        <Text style={r.emoji}>{field.emoji}</Text>
        <Text style={r.label}>{field.label}</Text>
        {value > 0 && (
          <View style={[r.valueBadge, { borderColor: `${field.color}50` }]}>
            <Text style={[r.valueText, { color: field.color }]}>{value}/5</Text>
          </View>
        )}
      </View>
      <View style={r.dotsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            style={[
              r.dot,
              value >= n
                ? { backgroundColor: field.color }
                : { backgroundColor: 'rgba(255,255,255,0.08)' },
              value === n && { transform: [{ scale: 1.15 }] },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(n);
            }}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityLabel={`${field.label} ${n} out of 5`}
          />
        ))}
        <View style={r.scaleLabels}>
          <Text style={r.scaleLabel}>{field.lowLabel}</Text>
          <Text style={r.scaleLabel}>{field.highLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const r = StyleSheet.create({
  container: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 16 },
  label: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: -0.2,
    flex: 1,
  },
  valueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  valueText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  dotsRow: { gap: 6 },
  dot: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    marginBottom: 0,
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  scaleLabel: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WeeklyCheckIn() {
  const { clientData, trainer } = useClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);

  const [ratings, setRatings] = useState<Ratings>({ ...DEFAULT_RATINGS });
  const [highlight, setHighlight] = useState('');
  const [struggle, setStruggle] = useState('');
  const [goalsNextWeek, setGoalsNextWeek] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');
  const [success, setSuccess] = useState(false);
  const [coachNote, setCoachNote] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse the prompt card
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.01, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Check if already submitted this week
  useEffect(() => {
    if (!clientData?.id) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('client_checkins')
        .select('*')
        .eq('client_id', clientData.id)
        .eq('week_start', WEEK_START)
        .maybeSingle();

      if (data) {
        setRowId(data.id);
        if (data.submitted_at) {
          setAlreadySubmitted(true);
          // Show coach reply if one exists
          if (data.coach_note) setCoachNote(data.coach_note);
        } else {
          // Restore draft
          setRatings({
            energy_level: data.energy_level || 0,
            sleep_quality: data.sleep_quality || 0,
            stress_level: data.stress_level || 0,
            workout_adherence: data.workout_adherence || 0,
            diet_adherence: data.diet_adherence || 0,
          });
          setHighlight(data.highlight || '');
          setStruggle(data.struggle || '');
          setGoalsNextWeek(data.goals_next_week || '');
          setBodyWeight(data.body_weight ? String(data.body_weight) : '');
        }
      }
      setLoading(false);
    })();
  }, [clientData?.id]);

  const isComplete = Object.values(ratings).every((v) => v > 0);

  // Auto-save draft on changes
  const saveDraft = useCallback(
    async (newRatings: Ratings, newHighlight: string, newStruggle: string, newGoals: string, newWeight: string) => {
      if (!clientData?.id) return;
      const payload = {
        client_id: clientData.id,
        trainer_id: clientData.trainer_id,
        week_start: WEEK_START,
        ...newRatings,
        highlight: newHighlight || null,
        struggle: newStruggle || null,
        goals_next_week: newGoals || null,
        body_weight: newWeight ? parseFloat(newWeight) : null,
      };
      const { data } = await supabase
        .from('client_checkins')
        .upsert({ ...(rowId ? { id: rowId } : {}), ...payload }, { onConflict: 'client_id,week_start' })
        .select()
        .single();
      if (data && !rowId) setRowId(data.id);
    },
    [clientData, rowId]
  );

  const handleSubmit = async () => {
    if (!clientData?.id || !isComplete) return;
    setSubmitting(true);
    try {
      await supabase
        .from('client_checkins')
        .upsert(
          {
            ...(rowId ? { id: rowId } : {}),
            client_id: clientData.id,
            trainer_id: clientData.trainer_id,
            week_start: WEEK_START,
            ...ratings,
            highlight: highlight || null,
            struggle: struggle || null,
            goals_next_week: goalsNextWeek || null,
            body_weight: bodyWeight ? parseFloat(bodyWeight) : null,
            submitted_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,week_start' }
        );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);

      // Notify trainer that a new check-in is waiting for review
      if (trainer?.expo_push_token) {
        supabase.functions.invoke('send-push-notification', {
          body: {
            pushToken: trainer.expo_push_token,
            title: `New Check-In from ${clientData.name}`,
            body: `${clientData.name} just submitted their weekly check-in. Tap to review.`,
            data: { url: '/index' },
          }
        }).catch((err: unknown) => {
          if (__DEV__) console.log('[WeeklyCheckIn] push error:', err);
        });
      }

      setTimeout(() => {
        setOpen(false);
        setAlreadySubmitted(true);
      }, 2000);
    } catch (err) {
      if (__DEV__) console.log('[WeeklyCheckIn] submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  // Once submitted, show coach reply if one exists — otherwise stay invisible
  // until the form prompt is relevant again next week.
  if (alreadySubmitted) {
    if (!coachNote) return null;
    const weekLabel = (() => {
      const d = new Date(WEEK_START + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    })();
    return (
      <View style={s.coachReplyCard}>
        <View style={s.coachReplyHeader}>
          <Text style={s.coachReplyTag}>COACH REPLY · WEEK OF {weekLabel.toUpperCase()}</Text>
          <Text style={s.coachReplyTitle}>Your Coach Responded ✅</Text>
        </View>
        <Text style={s.coachReplyBody}>{coachNote}</Text>
        <View style={s.coachReplyAccent} />
      </View>
    );
  }

  const weekLabel = (() => {
    const d = new Date(WEEK_START + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  return (
    <>
      {/* ── Prompt Card (compact, always visible) ── */}
      <Animated.View style={[s.promptCard, { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity
          style={s.promptInner}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setOpen(true);
          }}
          activeOpacity={0.88}
        >
          <View style={s.promptLeft}>
            <View style={s.promptIconWrap}>
              <Text style={{ fontSize: 20 }}>📋</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.promptTag}>WEEKLY CHECK-IN</Text>
              <Text style={s.promptTitle}>How was your week?</Text>
              <Text style={s.promptSub}>
                Week of {weekLabel} · Your coach is waiting
              </Text>
            </View>
          </View>
          <View style={s.promptCta}>
            <Text style={s.promptCtaText}>START</Text>
            <Ionicons name="arrow-forward" size={12} color="#5B7FFF" />
          </View>
        </TouchableOpacity>
        {/* Left accent */}
        <View style={s.promptAccent} />
      </Animated.View>

      {/* ── Full Form Modal ── */}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={s.modal}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setOpen(false)} style={s.closeBtn}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTag}>WEEKLY CHECK-IN // WEEK OF {weekLabel.toUpperCase()}</Text>
              <Text style={s.modalTitle}>How did it go?</Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={s.form}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {success ? (
              <View style={s.successState}>
                <Text style={{ fontSize: 48 }}>🎉</Text>
                <Text style={s.successTitle}>Check-in submitted!</Text>
                <Text style={s.successSub}>Your coach will review it shortly.</Text>
              </View>
            ) : (
              <>
                {/* ── Ratings ── */}
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Rate your week</Text>
                  <View style={s.ratingsStack}>
                    {RATING_FIELDS.map((field) => (
                      <RatingRow
                        key={field.key}
                        field={field}
                        value={ratings[field.key]}
                        onChange={(v) => {
                          const next = { ...ratings, [field.key]: v };
                          setRatings(next);
                          saveDraft(next, highlight, struggle, goalsNextWeek, bodyWeight);
                        }}
                      />
                    ))}
                  </View>
                </View>

                {/* ── Text Fields ── */}
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Tell your coach</Text>

                  <View style={s.inputGroup}>
                    <Text style={s.inputLabel}>🏆 Best thing this week</Text>
                    <TextInput
                      style={s.input}
                      placeholder="A win, a PR, a breakthrough..."
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={highlight}
                      onChangeText={(t) => {
                        setHighlight(t);
                        saveDraft(ratings, t, struggle, goalsNextWeek, bodyWeight);
                      }}
                      multiline
                      maxLength={280}
                    />
                  </View>

                  <View style={s.inputGroup}>
                    <Text style={s.inputLabel}>😤 Biggest challenge</Text>
                    <TextInput
                      style={s.input}
                      placeholder="What made it tough this week?"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={struggle}
                      onChangeText={(t) => {
                        setStruggle(t);
                        saveDraft(ratings, highlight, t, goalsNextWeek, bodyWeight);
                      }}
                      multiline
                      maxLength={280}
                    />
                  </View>

                  <View style={s.inputGroup}>
                    <Text style={s.inputLabel}>🎯 Focus for next week</Text>
                    <TextInput
                      style={s.input}
                      placeholder="What do you want to nail next week?"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={goalsNextWeek}
                      onChangeText={(t) => {
                        setGoalsNextWeek(t);
                        saveDraft(ratings, highlight, struggle, t, bodyWeight);
                      }}
                      multiline
                      maxLength={280}
                    />
                  </View>
                </View>

                {/* ── Optional body weight ── */}
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Body weight (optional)</Text>
                  <View style={s.weightRow}>
                    <TextInput
                      style={[s.input, s.weightInput]}
                      placeholder="e.g. 175"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={bodyWeight}
                      onChangeText={(t) => {
                        setBodyWeight(t.replace(/[^0-9.]/g, ''));
                        saveDraft(ratings, highlight, struggle, goalsNextWeek, t);
                      }}
                      keyboardType="decimal-pad"
                      maxLength={6}
                    />
                    <Text style={s.weightUnit}>lbs</Text>
                  </View>
                </View>

                {/* ── Submit ── */}
                <TouchableOpacity
                  style={[
                    s.submitBtn,
                    !isComplete && s.submitBtnDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!isComplete || submitting}
                  activeOpacity={0.88}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color={isComplete ? '#000' : 'rgba(255,255,255,0.3)'} />
                      <Text style={[s.submitText, !isComplete && s.submitTextDisabled]}>
                        {isComplete ? 'Submit to Coach' : 'Rate all 5 fields to submit'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {!isComplete && (
                  <Text style={s.completionHint}>
                    {Object.values(ratings).filter((v) => v > 0).length}/5 rated
                  </Text>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Prompt card
  promptCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: 'rgba(91,127,255,0.3)',
    overflow: 'hidden',
  },
  promptAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#5B7FFF',
  },
  promptInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 18,
    paddingRight: 14,
    gap: 12,
  },
  promptLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  promptIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(91,127,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#5B7FFF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  promptTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  promptSub: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  promptCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(91,127,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(91,127,255,0.3)',
  },
  promptCtaText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#5B7FFF',
    letterSpacing: 1,
  },

  // Modal
  modal: {
    flex: 1,
    backgroundColor: '#0C0C0E',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  modalTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#5B7FFF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },

  // Form
  form: {
    padding: 20,
    gap: 24,
    paddingBottom: 60,
  },
  section: { gap: 14 },
  sectionTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  ratingsStack: { gap: 20 },

  // Text inputs
  inputGroup: { gap: 8 },
  inputLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  input: {
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
    minHeight: 48,
  },

  // Weight
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weightInput: {
    flex: 1,
    minHeight: 48,
    textAlign: 'center',
    fontSize: 22,
    fontFamily: FontFamily.headingExtraBold,
  },
  weightUnit: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
  },

  // Submit
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#5B7FFF',
  },
  submitBtnDisabled: {
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  submitText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#000000',
    letterSpacing: -0.2,
  },
  submitTextDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
  completionHint: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: -16,
  },

  // Success
  successState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  successTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  successSub: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },

  // Coach reply card (shown when alreadySubmitted && coach has replied)
  coachReplyCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden' as const,
  },
  coachReplyHeader: {
    marginBottom: 10,
  },
  coachReplyTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 3,
  },
  coachReplyTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  coachReplyBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
  },
  coachReplyAccent: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#5B7FFF',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
});
