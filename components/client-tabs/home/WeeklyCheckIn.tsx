/**
 * WeeklyCheckIn — the Sunday check-in, built as a conversation (design 22d).
 *
 * One question at a time, asked in the coach's actual name. If the coach has
 * written questions for this athlete (clients.checkin_questions JSONB), those
 * are asked; otherwise the standard rating set is asked, phrased
 * conversationally, and still writes the fixed client_checkins columns so the
 * coach-side CheckInInbox keeps working unchanged.
 *
 * Custom answers are written to client_checkins.custom_answers JSONB with a
 * 42703 (column missing) retry so the app works pre-migration.
 *
 * The summary step is framed as a message to the coach, not a form submit.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { useClient } from '../../../context/ClientContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

// ─── Question model ───────────────────────────────────────────────────────────

type RatingColumn =
  | 'energy_level'
  | 'sleep_quality'
  | 'stress_level'
  | 'workout_adherence'
  | 'diet_adherence';

type TextColumn = 'highlight' | 'struggle' | 'goals_next_week';

interface Question {
  id: string;
  prompt: string;
  context?: string;
  kind: 'rating' | 'choice' | 'scale' | 'text';
  // rating
  column?: RatingColumn;
  lowLabel?: string;
  highLabel?: string;
  // choice
  options?: string[];
  // scale
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // text
  textColumn?: TextColumn;
  optional?: boolean;
}

/** Coach-authored question as stored in clients.checkin_questions JSONB. */
interface CoachQuestion {
  id: string;
  prompt: string;
  context?: string;
  type: 'choice' | 'scale' | 'text';
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

type AnswerValue = string | number;

const STANDARD_QUESTIONS: Question[] = [
  { id: 'std_energy', prompt: 'How was your energy this week?', kind: 'rating', column: 'energy_level', lowLabel: 'Drained', highLabel: 'Charged' },
  { id: 'std_sleep', prompt: 'How did you sleep, most nights?', kind: 'rating', column: 'sleep_quality', lowLabel: 'Poor', highLabel: 'Great' },
  { id: 'std_stress', prompt: 'How stressed were you outside the gym?', kind: 'rating', column: 'stress_level', lowLabel: 'Relaxed', highLabel: 'Maxed out' },
  { id: 'std_training', prompt: 'Did the training happen as planned?', kind: 'rating', column: 'workout_adherence', lowLabel: 'Skipped a lot', highLabel: 'Nailed it' },
  { id: 'std_diet', prompt: 'How did the eating go?', kind: 'rating', column: 'diet_adherence', lowLabel: 'Off track', highLabel: 'Spot on' },
  { id: 'std_highlight', prompt: 'Best thing that happened this week?', kind: 'text', textColumn: 'highlight', optional: true },
  { id: 'std_struggle', prompt: 'What made the week hard?', kind: 'text', textColumn: 'struggle', optional: true },
  { id: 'std_goals', prompt: 'Anything you want changed next week?', kind: 'text', textColumn: 'goals_next_week', optional: true },
];

function coachToQuestion(q: CoachQuestion): Question | null {
  if (!q || typeof q.prompt !== 'string' || !q.prompt.trim()) return null;
  if (q.type === 'choice' && Array.isArray(q.options) && q.options.length > 0) {
    return { id: q.id, prompt: q.prompt, context: q.context, kind: 'choice', options: q.options };
  }
  if (q.type === 'scale') {
    return {
      id: q.id, prompt: q.prompt, context: q.context, kind: 'scale',
      min: typeof q.min === 'number' ? q.min : 1,
      max: typeof q.max === 'number' ? q.max : 10,
      step: typeof q.step === 'number' && q.step > 0 ? q.step : 1,
      unit: q.unit,
    };
  }
  if (q.type === 'text') {
    return { id: q.id, prompt: q.prompt, context: q.context, kind: 'text', optional: true };
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

const WEEK_START = getMondayOfWeek();

function ratingWord(q: Question, v: number) {
  if (v <= 1) return q.lowLabel || String(v);
  if (v >= 5) return q.highLabel || String(v);
  return `${v} of 5`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WeeklyCheckIn() {
  const { clientData, trainer } = useClient();
  const insets = useSafeAreaInsets();
  const coachFirst = (trainer?.name || 'Your coach').split(' ')[0];

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);
  const [coachNote, setCoachNote] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const [step, setStep] = useState(0); // index into questions; questions.length = summary
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [textDraft, setTextDraft] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');

  const coachQuestions: CoachQuestion[] = Array.isArray((clientData as any)?.checkin_questions)
    ? (clientData as any).checkin_questions
    : [];
  const usingCustom = coachQuestions.length > 0;

  const questions = useMemo<Question[]>(() => {
    if (usingCustom) {
      return coachQuestions.map(coachToQuestion).filter((q): q is Question => q !== null);
    }
    return STANDARD_QUESTIONS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingCustom, JSON.stringify(coachQuestions)]);

  // Existing row / already submitted this week
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
          if (data.coach_note) setCoachNote(data.coach_note);
        }
      }
      setLoading(false);
    })();
  }, [clientData?.id]);

  const answered = questions.filter((q) => answers[q.id] !== undefined).length;
  const onSummary = step >= questions.length;
  const current = onSummary ? null : questions[step];

  const goNext = (nextAnswers?: Record<string, AnswerValue>) => {
    const a = nextAnswers || answers;
    if (nextAnswers) setAnswers(nextAnswers);
    const nextIdx = step + 1;
    setStep(nextIdx);
    const nq = questions[nextIdx];
    setTextDraft(nq && nq.kind === 'text' && typeof a[nq.id] === 'string' ? String(a[nq.id]) : '');
  };

  const answerAndAdvance = (q: Question, value: AnswerValue) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goNext({ ...answers, [q.id]: value });
  };

  const goBack = () => {
    if (step === 0) { setOpen(false); return; }
    const prevIdx = step - 1;
    setStep(prevIdx);
    const pq = questions[prevIdx];
    setTextDraft(pq && pq.kind === 'text' && typeof answers[pq.id] === 'string' ? String(answers[pq.id]) : '');
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!clientData?.id || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const base: Record<string, any> = {
        ...(rowId ? { id: rowId } : {}),
        client_id: clientData.id,
        trainer_id: clientData.trainer_id,
        week_start: WEEK_START,
        body_weight: bodyWeight ? parseFloat(bodyWeight) : null,
        submitted_at: new Date().toISOString(),
      };

      let customAnswers: Record<string, { prompt: string; answer: AnswerValue }> | null = null;

      if (usingCustom) {
        customAnswers = {};
        for (const q of questions) {
          if (answers[q.id] !== undefined) {
            customAnswers[q.id] = { prompt: q.prompt, answer: answers[q.id] };
          }
        }
      } else {
        for (const q of STANDARD_QUESTIONS) {
          const v = answers[q.id];
          if (q.column) base[q.column] = typeof v === 'number' ? v : null;
          if (q.textColumn) base[q.textColumn] = typeof v === 'string' && v.trim() ? v.trim() : null;
        }
      }

      const payload = customAnswers ? { ...base, custom_answers: customAnswers } : base;
      let { error } = await supabase
        .from('client_checkins')
        .upsert(payload, { onConflict: 'client_id,week_start' });
      // Pre-migration resilience: retry without the new JSONB column ONLY when
      // Postgres reports the column itself is missing (42703). Any other error
      // is a genuine failure and must reach the athlete.
      if (error && error.code === '42703' && customAnswers) {
        if (__DEV__) console.warn('[WeeklyCheckIn] custom_answers column missing; retrying without it');
        ({ error } = await supabase
          .from('client_checkins')
          .upsert(base, { onConflict: 'client_id,week_start' }));
      }
      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);

      if (trainer?.expo_push_token) {
        supabase.functions.invoke('send-push-notification', {
          body: {
            pushToken: trainer.expo_push_token,
            title: `Check-in from ${clientData.name}`,
            body: `${clientData.name} answered this week's questions. Tap to review.`,
            data: { url: '/messages' },
          },
        }).catch((err: unknown) => {
          if (__DEV__) console.log('[WeeklyCheckIn] push error:', err);
        });
      }

      setTimeout(() => {
        setOpen(false);
        setAlreadySubmitted(true);
      }, 1800);
    } catch (err) {
      // Nothing was stored — never let the sheet fall silent and let the
      // athlete believe the check-in reached their coach.
      setSubmitError(true);
      if (__DEV__) console.warn('[WeeklyCheckIn] submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  // ── Already submitted: show the coach's reply if there is one ──────────────
  if (alreadySubmitted) {
    if (!coachNote) return null;
    return (
      <View style={s.replyCard}>
        <Text style={s.replyTag}>From {coachFirst}</Text>
        <Text style={s.replyBody}>{coachNote}</Text>
      </View>
    );
  }

  // ── Prompt card ─────────────────────────────────────────────────────────────
  return (
    <>
      <TouchableOpacity
        style={s.promptCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setOpen(true);
        }}
        activeOpacity={0.88}
      >
        <View style={s.promptAvatar}>
          <Text style={s.promptAvatarText}>
            {coachFirst.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.promptTitle}>
            {usingCustom
              ? `${coachFirst} has ${questions.length} question${questions.length === 1 ? '' : 's'} for you`
              : `${coachFirst} wants to hear about your week`}
          </Text>
          <Text style={s.promptSub}>Weekly check-in · takes about two minutes</Text>
        </View>
        <View style={s.promptCta}>
          <Text style={s.promptCtaText}>Answer</Text>
        </View>
      </TouchableOpacity>

      {/* ── Conversation modal ── */}
      {/* onRequestClose is the Android hardware back button. It routes to
          goBack, not a raw close, so back walks the wizard one step at a time
          instead of discarding a half-finished check-in. */}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={goBack}>
        <KeyboardAvoidingView
          style={s.modal}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header. presentationStyle="pageSheet" is iOS-only — on Android
              this Modal is full-screen, so the status bar has to be cleared
              here. A Modal does not inherit the screen's safe area. */}
          <View style={[s.modalHeader, Platform.OS === 'android' && { paddingTop: insets.top + 18 }]}>
            <TouchableOpacity hitSlop={5} onPress={goBack} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name={step === 0 ? 'close' : 'chevron-back'} size={22} color={CoachColors.textSecondary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Weekly check-in</Text>
              <Text style={s.modalSub}>
                {onSummary
                  ? `Ready to send to ${coachFirst}`
                  : `Takes about two minutes · ${answered} of ${questions.length} done`}
              </Text>
            </View>
          </View>

          {/* Progress */}
          <View style={s.progressRow}>
            {questions.map((q, i) => (
              <View
                key={q.id}
                style={[
                  s.progressSeg,
                  (answers[q.id] !== undefined || i < step) && s.progressSegDone,
                  i === step && !onSummary && s.progressSegActive,
                ]}
              />
            ))}
          </View>

          <ScrollView
            contentContainerStyle={s.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {success ? (
              <View style={s.successState}>
                <View style={s.successRing}>
                  <Ionicons name="checkmark" size={34} color={CoachColors.accent} />
                </View>
                <Text style={s.successTitle}>Sent to {coachFirst}</Text>
                <Text style={s.successSub}>Replies usually come within a day.</Text>
              </View>
            ) : current ? (
              <View style={s.questionCard}>
                <Text style={s.askedBy}>{coachFirst} asks</Text>
                <Text style={s.questionPrompt}>{current.prompt}</Text>
                {!!current.context && (
                  <Text style={s.questionContext}>{current.context}</Text>
                )}

                {/* Rating: five chips, low/high anchored */}
                {current.kind === 'rating' && (
                  <>
                    <View style={s.chipRow}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                          key={n}
                          style={[s.numChip, answers[current.id] === n && s.chipSelected]}
                          onPress={() => answerAndAdvance(current, n)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`${current.prompt} — ${n} out of 5`}
                        >
                          <Text style={[s.numChipText, answers[current.id] === n && s.chipTextSelected]}>{n}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={s.anchorRow}>
                      <Text style={s.anchorText}>{current.lowLabel}</Text>
                      <Text style={s.anchorText}>{current.highLabel}</Text>
                    </View>
                  </>
                )}

                {/* Choice: coach-authored options */}
                {current.kind === 'choice' && (
                  <View style={s.chipRow}>
                    {(current.options || []).map((opt) => (
                      <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
                        key={opt}
                        style={[s.optChip, answers[current.id] === opt && s.chipSelected]}
                        onPress={() => answerAndAdvance(current, opt)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={opt}
                      >
                        <Text style={[s.optChipText, answers[current.id] === opt && s.chipTextSelected]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Scale: stepper */}
                {current.kind === 'scale' && (() => {
                  const min = current.min ?? 1;
                  const max = current.max ?? 10;
                  const stepSize = current.step ?? 1;
                  const val = typeof answers[current.id] === 'number'
                    ? (answers[current.id] as number)
                    : Math.round(((min + max) / 2) / stepSize) * stepSize;
                  const setVal = (v: number) => setAnswers({ ...answers, [current.id]: Math.min(max, Math.max(min, v)) });
                  return (
                    <>
                      <View style={s.scaleRow}>
                        <TouchableOpacity style={s.scaleBtn} onPress={() => setVal(val - stepSize)} accessibilityRole="button" accessibilityLabel="Decrease">
                          <Ionicons name="remove" size={20} color={CoachColors.textPrimary} />
                        </TouchableOpacity>
                        <View style={s.scaleValueWrap}>
                          <Text style={s.scaleValue}>{Number.isInteger(val) ? val : val.toFixed(1)}</Text>
                          {!!current.unit && <Text style={s.scaleUnit}>{current.unit}</Text>}
                        </View>
                        <TouchableOpacity style={s.scaleBtn} onPress={() => setVal(val + stepSize)} accessibilityRole="button" accessibilityLabel="Increase">
                          <Ionicons name="add" size={20} color={CoachColors.textPrimary} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                        style={s.nextBtn}
                        onPress={() => answerAndAdvance(current, val)}
                        activeOpacity={0.85}
                      >
                        <Text style={s.nextBtnText}>That's about right</Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}

                {/* Text */}
                {current.kind === 'text' && (
                  <>
                    <TextInput
                      style={s.textInput}
                      placeholder="Say it how you'd text it…"
                      placeholderTextColor={CoachColors.textFaint}
                      value={textDraft}
                      onChangeText={setTextDraft}
                      multiline
                      maxLength={280}
                    />
                    <View style={s.textActions}>
                      <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                        style={[s.nextBtn, { flex: 1 }, !textDraft.trim() && s.nextBtnDisabled]}
                        onPress={() => textDraft.trim() && answerAndAdvance(current, textDraft.trim())}
                        disabled={!textDraft.trim()}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.nextBtnText, !textDraft.trim() && s.nextBtnTextDisabled]}>Next</Text>
                      </TouchableOpacity>
                      {current.optional && (
                        <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                          style={s.skipBtn}
                          onPress={() => {
                            const next = { ...answers };
                            delete next[current.id];
                            setAnswers(next);
                            goNext(next);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={s.skipBtnText}>Skip</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}
              </View>
            ) : (
              /* ── Summary: framed as a message, not a form ── */
              <View style={{ gap: 12 }}>
                <Text style={s.summaryLead}>
                  This goes to {coachFirst} as a message, not a form.
                </Text>
                <View style={s.summaryCard}>
                  {questions.map((q) =>
                    answers[q.id] === undefined ? null : (
                      <View key={q.id} style={s.summaryRow}>
                        <Text style={s.summaryQ}>{q.prompt}</Text>
                        <Text style={s.summaryA}>
                          {q.kind === 'rating'
                            ? ratingWord(q, answers[q.id] as number)
                            : String(answers[q.id])}
                          {q.kind === 'scale' && q.unit ? ` ${q.unit}` : ''}
                        </Text>
                      </View>
                    )
                  )}
                  {answered === 0 && (
                    <Text style={s.summaryQ}>You skipped everything — go back and answer at least one.</Text>
                  )}
                </View>

                <View style={s.weightCard}>
                  <Text style={s.weightLabel}>Body weight, if you tracked it</Text>
                  <View style={s.weightRow}>
                    <TextInput
                      style={s.weightInput}
                      placeholder="—"
                      placeholderTextColor={CoachColors.textFaint}
                      value={bodyWeight}
                      onChangeText={(t) => setBodyWeight(t.replace(/[^0-9.]/g, ''))}
                      keyboardType="decimal-pad"
                      maxLength={6}
                    />
                    <Text style={s.weightUnit}>lbs</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer: send. paddingBottom clears the home indicator — a Modal
              has no safe area of its own. No tab-bar clearance needed: a
              native Modal renders above the bar. */}
          {onSummary && !success && (
            <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
              <TouchableOpacity
                style={[s.sendBtn, (answered === 0 || submitting) && s.sendBtnDisabled]}
                onPress={handleSubmit}
                disabled={answered === 0 || submitting}
                activeOpacity={0.88}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={CoachColors.onAccent} />
                ) : (
                  <Text style={[s.sendBtnText, answered === 0 && s.sendBtnTextDisabled]}>
                    Send to {coachFirst}
                  </Text>
                )}
              </TouchableOpacity>
              <Text style={s.footerHint}>
                {submitError
                  ? "Couldn't send your check-in. Please try again."
                  : 'Replies usually come within a day'}
              </Text>
            </View>
          )}
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
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
  },
  promptAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptAvatarText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
  promptTitle: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  promptSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 2,
  },
  promptCta: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  promptCtaText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    color: CoachColors.onAccent,
  },

  // Modal
  modal: { flex: 1, backgroundColor: CoachColors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 19,
    color: CoachColors.textPrimary,
  },
  modalSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  progressSeg: { flex: 1, height: 3, borderRadius: 999, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted },
  progressSegDone: { backgroundColor: CoachColors.accent },
  progressSegActive: { backgroundColor: 'rgba(198,242,78,0.45)' },

  body: { padding: 20, paddingBottom: 40 },

  // Question card
  questionCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: 18,
  },
  askedBy: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: CoachColors.accent,
    marginBottom: 8,
  },
  questionPrompt: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 19,
    lineHeight: 27,
    color: CoachColors.textPrimary,
  },
  questionContext: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textFaint,
    marginTop: 6,
    lineHeight: 18,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 16 },
  numChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 11,
    borderCurve: 'continuous',
    paddingVertical: 12,
    alignItems: 'center',
  },
  numChipText: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.textSecondary },
  optChip: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 11,
    borderCurve: 'continuous',
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  optChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textSecondary },
  chipSelected: {
    borderColor: CoachColors.accent,
    backgroundColor: 'rgba(198,242,78,0.1)',
    borderWidth: 1.5,
  },
  chipTextSelected: { color: CoachColors.accent },
  anchorRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  anchorText: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textFaint },

  // Scale stepper
  scaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  scaleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  scaleValue: { fontFamily: CoachFonts.headingBold, fontSize: 33.5, color: CoachColors.textPrimary },
  scaleUnit: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted },

  // Text input
  textInput: {
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 13,
    borderCurve: 'continuous',
    padding: 13,
    marginTop: 14,
    minHeight: 101,
    textAlignVertical: 'top',
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textPrimary,
    lineHeight: 21.5,
  },
  textActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },

  nextBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  nextBtnDisabled: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted },
  nextBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 15, color: CoachColors.onAccent },
  nextBtnTextDisabled: { color: CoachColors.textFaint },
  skipBtn: {
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 14,
  },
  skipBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textMuted },

  // Summary
  summaryLead: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    lineHeight: 20,
  },
  summaryCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: 16,
    gap: 14,
  },
  summaryRow: { gap: 3 },
  summaryQ: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint },
  summaryA: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary, lineHeight: 21.5 },
  weightCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: 16,
  },
  weightLabel: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  weightRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  weightInput: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 29,
    color: CoachColors.textPrimary,
    minWidth: 80,
    padding: 0,
  },
  weightUnit: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  sendBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 15,
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted },
  sendBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },
  sendBtnTextDisabled: { color: CoachColors.textFaint },
  footerHint: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    textAlign: 'center',
    marginTop: 9,
  },

  // Success
  successState: { alignItems: 'center', paddingVertical: 56, gap: 12 },
  successRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: 'rgba(198,242,78,0.4)',
    backgroundColor: CoachColors.accentSofter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { fontFamily: CoachFonts.headingBold, fontSize: 22.5, color: CoachColors.textPrimary },
  successSub: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted },

  // Coach reply card
  replyCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.22)',
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 16,
    gap: 8,
  },
  replyTag: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: CoachColors.accent,
  },
  replyBody: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    lineHeight: 22.5,
  },
});
