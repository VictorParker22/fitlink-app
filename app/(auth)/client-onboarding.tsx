/**
 * Client intake — one question at a time, and it says why (design 23e).
 *
 * Five questions, each on its own screen with a line explaining why the coach
 * asks it. Mirrors the WeeklyCheckIn conversation pattern: segmented progress,
 * coach attribution, answer-and-advance.
 *
 * Persistence contract (unchanged from the old form):
 * - writes the clients row (goals, weekly_goal, weight_lbs, assessment_data)
 * - sets SecureStore 'fitlink_client_onboarded' = 'true' (AuthGuard depends on it)
 * - sets auth metadata client_onboarded plus the intake_* keys (find-coach
 *   prefills from these — the key names are a cross-screen contract:
 *   intake_goal, intake_days, intake_experience, intake_limitation,
 *   intake_weight_lbs), then replaces to /(client-tabs), or to
 *   /(client-tabs)/find-coach for athletes who signed up without a coach.
 * Extras with no dedicated column go into assessment_data.intake (JSONB).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
  Animated, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
// Platform-aware wrapper: expo-secure-store has NO web implementation and
// throws on first call. See ../../lib/secureStore.ts.
import * as SecureStore from '../../lib/secureStore';
import { clientOnboardedKey } from '../../lib/onboardingFlags';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useAndroidBack } from '../../hooks/useAndroidBack';

// ─── Question model ───────────────────────────────────────────────────────────

interface ChoiceOption {
  value: string;
  label: string;
  sub: string;
}

interface IntakeQuestion {
  id: 'goal' | 'experience' | 'days' | 'limitation' | 'weight';
  title: string;
  why: string;
  kind: 'choice' | 'days' | 'text' | 'weight';
  options?: ChoiceOption[];
  optional?: boolean;
}

const QUESTIONS: IntakeQuestion[] = [
  {
    id: 'goal',
    title: 'What are you actually training for?',
    why: "Your coach writes a different plan depending on your answer. Pick the one that's true, not the one that sounds best.",
    kind: 'choice',
    options: [
      { value: 'Get stronger on the big lifts', label: 'Get stronger on the big lifts', sub: 'Weight on the bar is the score. Bodyweight roughly stays put.' },
      { value: 'Lose fat, keep the strength I have', label: 'Lose fat, keep the strength I have', sub: 'Food gets stricter, sessions get shorter.' },
      { value: 'Get back into it after a break', label: 'Get back into it after a break', sub: 'Slower start, more room to miss a day.' },
      { value: 'Train around something that hurts', label: 'Train around something that hurts', sub: 'You can tell your coach about it two screens from now.' },
    ],
  },
  {
    id: 'experience',
    title: 'Where are you starting from?',
    why: 'Your first week is written from this. Overselling it just makes week one miserable.',
    kind: 'choice',
    options: [
      { value: 'New to training', label: 'New to training', sub: 'Never trained with a plan before, or close to it.' },
      { value: 'Trained before, out of the habit', label: 'Trained before, out of the habit', sub: 'You know the movements, the routine lapsed.' },
      { value: 'Training now, want it structured', label: 'Training now, want it structured', sub: 'Already in the gym most weeks, no real plan.' },
      { value: 'Experienced, want coaching', label: 'Experienced, want coaching', sub: 'Years under the bar, here for programming and eyes on form.' },
    ],
  },
  {
    id: 'days',
    title: 'How many days a week will you actually train?',
    why: 'The plan gets built around days you will show up, not days that sound impressive. You can change this later.',
    kind: 'days',
  },
  {
    id: 'limitation',
    title: 'Anything hurting, or anything to work around?',
    why: 'Old injuries, a bad shoulder, a schedule that eats Tuesdays — your coach programs around it instead of finding out in week three.',
    kind: 'text',
    optional: true,
  },
  {
    id: 'weight',
    title: 'What do you weigh right now?',
    why: 'A rough number is fine. It sets the starting point your progress gets measured against.',
    kind: 'weight',
    optional: true,
  },
];

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClientOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [coachFirst, setCoachFirst] = useState<string | null>(null);
  // null = lookup still in flight (or failed) — copy stays on the neutral
  // fallback and nothing blocks on it. true/false only once we actually know.
  const [hasCoach, setHasCoach] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const [goal, setGoal] = useState<string | null>(null);
  const [experience, setExperience] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [limitation, setLimitation] = useState('');
  const [weightText, setWeightText] = useState('');

  const slideAnim = useRef(new Animated.Value(0)).current;

  // Who is asking — so the "why" lines can use the coach's actual name, and
  // so a coachless signup is never told their answers went to a coach.
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // The clients row is keyed by auth_user_id — there is no user_id
        // column (clients.id is the row id, NOT an auth id; INVARIANTS §1).
        // Filtering on user_id fails with 42703, and because postgrest
        // resolves with { error } instead of throwing, the failure is
        // invisible: the lookup "succeeds" empty and every athlete — coached
        // or not — gets the generic "Your coach" copy.
        const { data: client, error } = await supabase
          .from('clients')
          .select('trainer_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (error) return; // unknown — hasCoach stays null, copy stays neutral
        if (client?.trainer_id) {
          setHasCoach(true);
          const { data: t } = await supabase
            .from('trainers_public')
            .select('name')
            .eq('id', client.trainer_id)
            .maybeSingle();
          if (t?.name) setCoachFirst(String(t.name).split(' ')[0]);
        } else {
          // No row, or a row with no trainer yet — signed up without a coach.
          setHasCoach(false);
        }
      } catch {
        // Fine — copy falls back to "your coach".
      }
    })();
  }, []);

  const coachless = hasCoach === false;
  const coachName = coachFirst || 'Your coach';
  // Mid-sentence and sentence-start forms for the "why" lines and hints.
  // While the lookup is unresolved (hasCoach null) the neutral fallback holds.
  const coachRef = coachless ? 'your future coach' : coachName;
  const coachRefCap = coachless ? 'Your future coach' : coachName;

  useEffect(() => {
    if (!done) return;
    // Coachless athletes land on find-coach — their answers were just
    // persisted for the matching prefill, so the next step is finding the
    // coach, not an empty dashboard. Coached athletes keep the dashboard.
    // Both pass through the permissions primer first: one explained moment
    // for the OS asks, instead of ambushes mid-session later.
    const dest = coachless ? '/(client-tabs)/find-coach' : '/(client-tabs)';
    const timer = setTimeout(
      () => router.replace(`/(auth)/athlete-permissions?next=${encodeURIComponent(dest)}` as any),
      1800,
    );
    return () => clearTimeout(timer);
  }, [done, coachless]);

  const animateTo = (nextStep: number) => {
    Animated.timing(slideAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      slideAnim.setValue(24);
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    });
  };

  const question = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;

  const currentAnswered = (() => {
    switch (question.id) {
      case 'goal': return goal !== null;
      case 'experience': return experience !== null;
      case 'days': return days !== null;
      case 'limitation': return true; // optional
      case 'weight': return true; // optional
    }
  })();

  const stepDone = (q: IntakeQuestion) => {
    switch (q.id) {
      case 'goal': return goal !== null;
      case 'experience': return experience !== null;
      case 'days': return days !== null;
      case 'limitation': return limitation.trim().length > 0;
      case 'weight': return weightText.trim().length > 0;
    }
  };

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLast) completeOnboarding();
    else animateTo(step + 1);
  };

  const goBack = () => {
    if (step > 0) animateTo(step - 1);
  };

  // Android hardware back walks the intake, and is swallowed on step 0 — this
  // is required onboarding, so popping the screen would drop the athlete into
  // the app with no intake and no way back to finish it.
  useAndroidBack(useCallback(() => {
    if (step > 0) animateTo(step - 1);
    return true;
  }, [step]));

  const completeOnboarding = async () => {
    setSaving(true);
    const parsedWeight = weightText.trim() ? Math.round(parseFloat(weightText)) : null;
    const weightLbs = parsedWeight !== null && !Number.isNaN(parsedWeight) ? parsedWeight : null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // The whole intake lives in assessment_data.intake. The clients table
        // has no goals / weekly_goal / weight_lbs columns — writing to them
        // failed the entire update with 42703, and the filter below used
        // `user_id`, which does not exist either (the column is auth_user_id).
        // Neither error surfaced because postgrest RESOLVES with { error }
        // instead of throwing, so the catch was dead and every athlete's
        // answers were silently discarded.
        const { data: existing, error: readErr } = await supabase
          .from('clients')
          .select('assessment_data')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (readErr && __DEV__) {
          console.warn('[ClientOnboarding] could not read prior assessment:', readErr.message);
        }
        const prior = existing?.assessment_data && typeof existing.assessment_data === 'object'
          ? existing.assessment_data
          : {};

        const updatePayload = {
          assessment_data: {
            ...prior,
            intake: {
              goal,
              experience,
              days_per_week: days,
              limitation: limitation.trim() || null,
              weight_lbs: weightLbs,
              completed_at: new Date().toISOString(),
            },
          },
        };

        const { error: writeErr } = await supabase
          .from('clients')
          .update(updatePayload)
          .eq('auth_user_id', user.id);
        if (writeErr && __DEV__) {
          console.warn('[ClientOnboarding] intake save failed:', writeErr.message);
        }
      }
    } catch (e) {
      // Never trap the athlete in intake — but do say so in dev.
      if (__DEV__) console.warn('[ClientOnboarding] intake save threw:', e);
    }

    // Completion contract — AuthGuard depends on this flag. Keyed per account
    // so a shared device never leaks completion between athletes, and this
    // athlete never repeats intake (see lib/onboardingFlags.ts).
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.id) {
      await SecureStore.setItemAsync(clientOnboardedKey(authUser.id), 'true').catch(() => {});
    }
    // updateUser resolves with { error } instead of throwing, so check it.
    // The intake_* keys are a contract with find-coach, which prefills the
    // matching flow from them so a coachless athlete never repeats intake.
    const metadata = {
      client_onboarded: true,
      intake_goal: goal,
      intake_days: days,
      intake_experience: experience,
      intake_limitation: limitation.trim() || null,
      intake_weight_lbs: weightLbs,
    };
    try {
      const { error } = await supabase.auth.updateUser({ data: metadata });
      if (error) {
        const retry = await supabase.auth.updateUser({ data: metadata });
        if (retry.error && __DEV__) {
          console.warn('[ClientOnboarding] could not persist metadata:', retry.error.message);
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[ClientOnboarding] metadata write threw:', e);
    }

    setSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDone(true);
  };

  // ── Done state ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={[s.container, s.center]}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={s.doneRing}>
          <Ionicons name="checkmark" size={34} color={CoachColors.accent} />
        </View>
        <Text style={s.doneTitle}>{coachless ? "You're in." : `Sent to ${coachName}`}</Text>
        <Text style={s.doneSub}>
          {coachless
            ? "Now find the right coach — your answers do the matching, so you won't repeat them."
            : 'Your answers are on their way. Your plan gets built from them.'}
        </Text>
      </View>
    );
  }

  const remaining = QUESTIONS.length - 1 - step;
  const footerHint = remaining > 1
    ? `${remaining} more questions, then you're in`
    : remaining === 1
      ? 'One more question, then you\'re in'
      : 'Last one — then you\'re in';

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header: back + segmented progress + count */}
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity hitSlop={5}
            onPress={goBack}
            style={[s.backBtn, step === 0 && { opacity: 0.35 }]}
            disabled={step === 0}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={20} color={CoachColors.textSecondary} />
          </TouchableOpacity>
          <View style={s.progressRow}>
            {QUESTIONS.map((q, i) => (
              <View
                key={q.id}
                style={[
                  s.progressSeg,
                  (i < step || stepDone(q)) && s.progressSegDone,
                  i === step && s.progressSegActive,
                ]}
              />
            ))}
          </View>
          <Text style={s.progressCount}>{step + 1} of {QUESTIONS.length}</Text>
        </View>

        <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
          <ScrollView
            contentContainerStyle={s.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.title}>{question.title}</Text>
            <Text style={s.why}>{question.why.replace('Your coach', coachRefCap).replace('your coach', coachRef)}</Text>

            {/* Choice questions */}
            {question.kind === 'choice' && (
              <View style={s.optionList}>
                {question.options!.map((opt) => {
                  const selected = (question.id === 'goal' ? goal : experience) === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[s.optionCard, selected && s.optionCardSelected]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (question.id === 'goal') setGoal(opt.value);
                        else setExperience(opt.value);
                      }}
                      activeOpacity={0.85}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={opt.label}
                    >
                      <View style={[s.radio, selected && s.radioSelected]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.optionLabel}>{opt.label}</Text>
                        <Text style={[s.optionSub, selected && s.optionSubSelected]}>{opt.sub}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Days per week */}
            {question.kind === 'days' && (
              <View style={s.daysRow}>
                {DAY_OPTIONS.map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[s.dayChip, days === n && s.dayChipSelected]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDays(n);
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} days a week`}
                  >
                    <Text style={[s.dayChipText, days === n && s.dayChipTextSelected]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Free text */}
            {question.kind === 'text' && (
              <TextInput
                style={s.textInput}
                placeholder="Say it how you'd text it. Blank is a fine answer."
                placeholderTextColor={CoachColors.textFaint}
                value={limitation}
                onChangeText={setLimitation}
                multiline
                maxLength={400}
              />
            )}

            {/* Weight */}
            {question.kind === 'weight' && (
              <View style={s.weightCard}>
                <TextInput
                  style={s.weightInput}
                  placeholder="—"
                  placeholderTextColor={CoachColors.textFaint}
                  value={weightText}
                  onChangeText={(t) => setWeightText(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  accessibilityLabel="Current weight in pounds"
                />
                <Text style={s.weightUnit}>lbs</Text>
              </View>
            )}

            {/* Coach hint — mirrors the mockup's attribution card */}
            <View style={s.hintCard}>
              <View style={s.hintAvatar}>
                <Text style={s.hintAvatarText}>{coachRefCap.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={s.hintText}>
                {question.optional
                  ? `Not sure? Skip it — ${coachRef} will ask when it matters.`
                  : `Not sure? Pick the closest one — ${coachRef} reads every answer and adjusts.`}
              </Text>
            </View>
          </ScrollView>
        </Animated.View>

        {/* Footer */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <TouchableOpacity
            style={[s.continueBtn, (!currentAnswered || saving) && s.continueBtnDisabled]}
            onPress={goNext}
            disabled={!currentAnswered || saving}
            activeOpacity={0.88}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color={CoachColors.onAccent} />
            ) : (
              <Text style={[s.continueText, !currentAnswered && s.continueTextDisabled]}>
                {isLast
                  ? coachless ? 'Finish' : 'Send to ' + coachName
                  : question.optional && !stepDone(question)
                    ? 'Skip this one'
                    : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={s.footerHint}>{footerHint}</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 4,
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
  progressRow: { flex: 1, flexDirection: 'row', gap: 4 },
  progressSeg: { flex: 1, height: 3, borderRadius: 999, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted },
  progressSegDone: { backgroundColor: CoachColors.accent },
  progressSegActive: { backgroundColor: 'rgba(198,242,78,0.45)' },
  progressCount: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },

  body: { paddingHorizontal: 20, paddingTop: 30, paddingBottom: 24 },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 29,
    lineHeight: 36,
    color: CoachColors.textPrimary,
  },
  why: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    lineHeight: 21.5,
    color: CoachColors.textMuted,
    marginTop: 9,
  },

  optionList: { gap: 9, marginTop: 24 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 15,
  },
  optionCardSelected: {
    backgroundColor: '#1E211D',
    borderWidth: 1.5,
    borderColor: CoachColors.accent,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: '#3E443A',
    backgroundColor: 'transparent',
  },
  radioSelected: {
    borderWidth: 5.5,
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.bg,
  },
  optionLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  optionSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: CoachColors.textMuted,
    marginTop: 3,
  },
  optionSubSelected: { color: '#A9AF9F' },

  daysRow: { flexDirection: 'row', gap: 8, marginTop: 24 },
  dayChip: {
    flex: 1,
    aspectRatio: 0.9,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipSelected: {
    borderWidth: 1.5,
    borderColor: CoachColors.accent,
    backgroundColor: 'rgba(198,242,78,0.1)',
  },
  dayChipText: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textSecondary },
  dayChipTextSelected: { color: CoachColors.accent },

  textInput: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 15,
    marginTop: 24,
    minHeight: 132,
    textAlignVertical: 'top',
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    lineHeight: 22.5,
    color: CoachColors.textPrimary,
  },

  weightCard: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: 24,
  },
  weightInput: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 33.5,
    color: CoachColors.textPrimary,
    minWidth: 90,
    padding: 0,
  },
  weightUnit: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted },

  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 14,
    marginTop: 15,
  },
  hintAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderCurve: 'continuous',
    backgroundColor: '#2A3320',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintAvatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 13, color: CoachColors.accent },
  hintText: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: '#A9AF9F',
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#1E211D',
    backgroundColor: CoachColors.bg,
  },
  continueBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  continueText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },
  continueTextDisabled: { color: CoachColors.textFaint },
  footerHint: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    textAlign: 'center',
    marginTop: 9,
  },

  doneRing: {
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
  doneTitle: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary },
  doneSub: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    lineHeight: 21.5,
    color: CoachColors.textMuted,
    textAlign: 'center',
  },
});
