/**
 * (auth)/client-signup.tsx — athlete arrival + sign-up on the editorial
 * onboarding system (design canvas "FitLink Arrival").
 *
 * Most athletes arrive holding a coach's link, so the first screen answers
 * "whose is this?" before it asks for anything:
 *   - If the link carries ?ref=<trainer_id> (or ?trainer=), the coach's real
 *     name / avatar / specialization is resolved from the public trainers
 *     table and leads the screen as a coach chip.
 *   - If not, a neutral athlete welcome is shown (no invented coach).
 *
 * Mechanics preserved from the previous version:
 *   welcome → lookup (lookup_client_by_contact) → either
 *     create_password (coach pre-added you: link_client_to_auth_user), or
 *     new_signup → pick_trainer / connectToTrainer (create_client_and_notify)
 * AuthGuard handles the redirect once a session exists — this screen never
 * navigates on a successful sign-in.
 *
 * The 16+ date-of-birth gate lives here (parseDob/formatDobInput from
 * lib/dob.ts, shared with account.tsx) — UNLESS the onboarding draft
 * (lib/onboardingDraft.ts) already has a dob, in which case the field is
 * skipped and the draft value is used directly. The same goes for the name:
 * arriving from the account step (?from=account) with a draft name hides the
 * Name field and shows "Signing up as …" with a way back to change it.
 *
 * Every auth failure is shown through lib/authErrors.ts, and the sign-up
 * requests get one retry when the phone could not reach the server at all
 * (the "Network request failed" finding from the 2026-09-04 device pass).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  View, Text, TextInput, StyleSheet, Pressable, Linking, Keyboard,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAlert } from '../../context/AlertContext';
import { loadDraft } from '../../lib/onboardingDraft';
import { TERMS_URL, PRIVACY_URL } from '../../lib/legalLinks';
import { friendlyAuthError, withNetworkRetry } from '../../lib/authErrors';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { OB, OBFonts, OBRadius, OBSpace, OBMotion } from '../../constants/onboardingDesign';
import {
  Screen, TopNav, Headline, Sub, PrimaryButton, TextButton, AccentDot, Hairline,
} from '../../components/onboarding/Editorial';
import { formatDobInput, parseDob } from '../../lib/dob';

type FlowStep = 'welcome' | 'lookup' | 'create_password' | 'new_signup' | 'pick_trainer';

type InviteTrainer = {
  id: string;
  name: string;
  specialization?: string | null;
  avatar_url?: string | null;
};

function initials(name?: string): string {
  if (!name) return '';
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function firstName(name?: string): string {
  return (name || '').split(' ')[0] || '';
}

export default function ClientSignupScreen() {
  const router = useRouter();
  const { showAlert } = useAlert();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ ref?: string; trainer?: string; from?: string }>();
  // The account step pushed this screen, so it is still on the stack and
  // "Change" can simply go back to it.
  const fromAccount = params.from === 'account';

  const [flowStep, setFlowStep] = useState<FlowStep>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`Sign up failed. ${error}`);
  }, [error]);

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Age gate. FitLink is not directed at children under 16 (privacy policy
  // §8); the date is kept in auth metadata, never shown to coaches.
  const [dob, setDob] = useState('');
  // If the onboarding draft already carries a dob, the field is skipped
  // entirely and this value is used at submit time.
  const [draftDob, setDraftDob] = useState<string | null>(null);
  // The name typed on the account step. With it, the Name field is hidden
  // rather than asked for a second time.
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftAck, setDraftAck] = useState(false);

  // Coach resolved from the invite link (?ref= / ?trainer=), if any.
  const [inviteTrainer, setInviteTrainer] = useState<InviteTrainer | null>(null);

  // Coach found via lookup (coach pre-added this athlete by email/phone).
  const [foundClientName, setFoundClientName] = useState('');
  const [foundTrainerName, setFoundTrainerName] = useState('');

  const [trainers, setTrainers] = useState<any[]>([]);
  const [loadingTrainers, setLoadingTrainers] = useState(false);

  const contactRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const dobRef = useRef<TextInput>(null);
  const createPasswordRef = useRef<TextInput>(null);

  // ── Onboarding draft: dob (skip the field if already answered) + role/goals
  // acknowledgement copy ────────────────────────────────────────────────
  useEffect(() => {
    loadDraft().then((d) => {
      if (d.dob) setDraftDob(d.dob);
      if (d.role === 'client' && d.goals?.length) setDraftAck(true);
      if (d.name) {
        setName((prev) => prev || d.name!);
        setDraftName(d.name.trim() || null);
      }
      // Arriving from the editorial account step: the athlete already chose a
      // path, answered the intake and typed their name — the welcome pitch and
      // the "already set up by a coach?" lookup are the wrong first screens.
      // Go straight to the email step.
      if (fromAccount) setFlowStep('new_signup');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resolve the inviting coach from the link ref ──────────────────────
  useEffect(() => {
    const refId = (params.ref || params.trainer || '').toString().trim();
    if (!refId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('trainers_public')
        .select('id, name, specialization, avatar_url')
        .eq('id', refId)
        .maybeSingle();
      if (alive && data) setInviteTrainer(data);
    })();
    return () => { alive = false; };
  }, [params.ref, params.trainer]);

  // ── Step transition: 320ms fade + 16px slide, 200ms crossfade with Reduce
  // Motion. ──────────────────────────────────────────────────────────────
  const stepAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    stepAnim.setValue(0);
    Animated.timing(stepAnim, {
      toValue: 1,
      duration: reduced ? OBMotion.reduced : OBMotion.screen,
      useNativeDriver: true,
    }).start();
  }, [flowStep]);
  const bodyOpacity = stepAnim;
  const bodyTranslateY = stepAnim.interpolate({ inputRange: [0, 1], outputRange: reduced ? [0, 0] : [16, 0] });

  const isEmail = (val: string) => val.includes('@');
  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (raw.startsWith('+')) return raw;
    return `+${digits}`;
  };

  // ── Step: lookup — did the coach already set you up? ─────────────────────
  const handleLookup = useCallback(async () => {
    const trimmed = contact.trim();
    const isEmailInput = isEmail(trimmed);
    const lookupVal = isEmailInput ? trimmed.toLowerCase() : formatPhone(trimmed);

    if (!trimmed || (isEmailInput && !trimmed.includes('@')) || (!isEmailInput && trimmed.replace(/\D/g, '').length < 10)) {
      return setError('Enter a valid email or phone number');
    }

    setError('');
    setLoading(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('lookup_client_by_contact', { contact_value: lookupVal });
      if (__DEV__) console.log('[ClientSignup] RPC:', JSON.stringify({ lookupVal, data, rpcErr }));
      if (rpcErr) throw rpcErr;

      if (data?.found) {
        if (data.has_account) {
          showAlert({
            type: 'info',
            title: 'You already have an account',
            message: "Let's get you signed in.",
            buttons: [{ text: 'Sign in', onPress: () => router.push('/(auth)/client-login') }],
          });
        } else {
          setFoundClientName(data.client_name || '');
          setFoundTrainerName(data.trainer_name || inviteTrainer?.name || 'your coach');
          setName(data.client_name || '');
          setFlowStep('create_password');
        }
      } else {
        setFlowStep('new_signup');
      }
    } catch (err) {
      if (__DEV__) console.error('[ClientSignup] Lookup error:', err);
      // The RPC's own text is not written for the athlete; only a connection
      // problem or a rate limit is worth naming.
      setError(friendlyAuthError(err, "Couldn't look that up. Try again.", { exposeRaw: false }));
    } finally {
      setLoading(false);
    }
  }, [contact, router, inviteTrainer, showAlert]);

  // ── Coach pre-added you: just a password ──────────────────────────────────
  const handleCreatePassword = async () => {
    setError('');
    if (!password.trim()) return setError('Create a password');
    if (password.length < 6) return setError('Password must be 6+ characters');

    setLoading(true);
    try {
      const contactEmail = isEmail(contact.trim())
        ? contact.trim().toLowerCase()
        : `${formatPhone(contact.trim()).replace('+', '')}@fitlink.phone`;

      const { error: signUpErr } = await withNetworkRetry(() => supabase.auth.signUp({
        email: contactEmail,
        password,
        options: { data: { name: name || 'Client', role: 'client' } },
      }));
      if (signUpErr) throw signUpErr;

      // Also retried: if this one failed on transport after the sign-up
      // landed, a fresh tap would only be told the email is taken.
      const { error: signInErr } = await withNetworkRetry(() => supabase.auth.signInWithPassword({ email: contactEmail, password }));
      if (signInErr) throw signInErr;

      const { data: linkResult, error: linkErr } = await supabase.rpc('link_client_to_auth_user', {
        p_email: contactEmail,
        p_phone: !isEmail(contact.trim()) ? formatPhone(contact.trim()) : null,
      });
      if (__DEV__) console.log('[ClientSignup] Link:', JSON.stringify({ linkResult, linkErr }));
      // Left loading — AuthGuard takes it from here.
    } catch (err: any) {
      if (__DEV__) console.error('[ClientSignup] Error:', err);
      setError(friendlyAuthError(err, "Couldn't create your account. Try again."));
      setLoading(false);
    }
  };

  // ── New athlete: name + email + password (+ dob unless the draft has one) ──
  const handleNewSignup = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name');
    if (!contact.trim() || !isEmail(contact.trim())) return setError('Enter your email');
    if (password.length < 6) return setError('Password must be 6+ characters');
    const dobCheck = draftDob ? { ok: true as const, iso: draftDob } : parseDob(dob);
    if (!dobCheck.ok) return setError(dobCheck.message);

    setLoading(true);
    try {
      const { error: signUpErr } = await withNetworkRetry(() => supabase.auth.signUp({
        email: contact.trim().toLowerCase(),
        password,
        options: { data: { name: name.trim(), role: 'client', date_of_birth: dobCheck.iso } },
      }));
      if (signUpErr) throw signUpErr;

      // Arrived on a coach's link — connect straight to that coach. Wins even
      // over a 'solo' draft choice: a human invited them, so that invite is
      // honoured regardless of what the pre-signup draft said.
      if (inviteTrainer) {
        await connectToTrainer(inviteTrainer.id);
        return;
      }

      // An onboarding draft with a client role already carries the athlete's
      // path (coach or solo) — AuthContext's applyOnboardingDraft writes it to
      // auth metadata on SIGNED_IN, and AuthGuard routes from there. Forcing a
      // coach pick here would override a 'solo' choice the athlete already
      // made (the "waiting on Victor" bug). Just stay on the loading state.
      const draft = await loadDraft();
      if (draft.role === 'client') {
        return;
      }

      // Legacy path: no draft (old entry point) and no invite — the only case
      // that still asks the athlete to pick a coach right here.
      setLoadingTrainers(true);
      const { data: trainerList } = await supabase
        .from('trainers_public')
        .select('id, name, specialization, avatar_url')
        .order('name');
      setTrainers(trainerList || []);
      setLoadingTrainers(false);
      setFlowStep('pick_trainer');
      setLoading(false);
    } catch (err: any) {
      setError(friendlyAuthError(err, "Couldn't create your account. Try again."));
      setLoading(false);
    }
  };

  const connectToTrainer = async (trainerId: string) => {
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: result, error: rpcErr } = await supabase.rpc('create_client_and_notify', {
        p_name: name.trim(),
        p_email: contact.trim().toLowerCase(),
        p_trainer_id: trainerId,
        p_phone: !isEmail(contact.trim()) ? formatPhone(contact.trim()) : null,
      });
      if (rpcErr) throw rpcErr;
      if (!result?.success) throw new Error(result?.reason || 'Failed to connect');
      // Left loading — AuthGuard takes it from here.
    } catch (err: any) {
      // "Not authenticated" and the RPC's reason strings are for the log,
      // not the screen.
      if (__DEV__) console.error('[ClientSignup] Connect error:', err);
      setError(friendlyAuthError(err, "Couldn't connect you to your coach. Try again.", { exposeRaw: false }));
      setLoading(false);
    }
  };

  const goBack = () => {
    setError('');
    if (flowStep === 'welcome') router.back();
    else if (flowStep === 'lookup') setFlowStep('welcome');
    else if (flowStep === 'pick_trainer') setFlowStep('new_signup');
    // From the account step there was no lookup screen; back is the account
    // step itself.
    else if (flowStep === 'new_signup' && fromAccount) router.back();
    else { setFlowStep('lookup'); setPassword(''); }
  };

  const coachFirst = firstName(inviteTrainer?.name);
  const signingUpAs = fromAccount && draftName ? draftName : null;

  return (
    <Screen footer={flowStep === 'pick_trainer' ? undefined : renderFooter()}>
      <TopNav onBack={goBack} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[styles.body, { opacity: bodyOpacity, transform: [{ translateY: bodyTranslateY }] }]}>
            {flowStep === 'welcome' && (
              <>
                {inviteTrainer ? (
                  <View style={styles.coachChip}>
                    <CoachAvatar trainer={inviteTrainer} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.coachChipTitle}>{inviteTrainer.name} invited you</Text>
                      {inviteTrainer.specialization ? (
                        <Text style={styles.coachChipSub}>{inviteTrainer.specialization}</Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
                <View style={{ gap: 10, marginTop: inviteTrainer ? 20 : 0 }}>
                  <Headline>{inviteTrainer ? `Train with ${coachFirst}.` : 'Find the right coach.'}</Headline>
                  <Sub>
                    {draftAck
                      ? 'Your answers are saved. This just makes them yours.'
                      : inviteTrainer
                        ? `You'll get ${coachFirst}'s programme, check-ins, and a way to reach ${coachFirst} that isn't a text message that gets forgotten.`
                        : 'Your programme, your check-ins, and a direct line to your coach — all in one place.'}
                  </Sub>
                </View>
              </>
            )}

            {flowStep === 'lookup' && (
              <>
                <View style={{ gap: 10 }}>
                  <Headline>Already set up by a coach?</Headline>
                  <Sub>Enter the email or phone your coach has for you.</Sub>
                </View>
                <View style={{ marginTop: 24 }}>
                  <Field label="Email or phone">
                    <TextInput
                      ref={contactRef}
                      style={styles.input}
                      placeholder="you@example.com or (555) 000-0000"
                      placeholderTextColor={OB.faint}
                      value={contact}
                      onChangeText={setContact}
                      autoCapitalize="none"
                      autoFocus
                      keyboardType="email-address"
                      autoComplete="username"
                      textContentType="username"
                      returnKeyType="done"
                      onSubmitEditing={handleLookup}
                      accessibilityLabel="Email or phone number"
                      selectionColor={OB.accent}
                    />
                  </Field>
                </View>
              </>
            )}

            {flowStep === 'create_password' && (
              <>
                <View style={{ gap: 10 }}>
                  <Headline>Choose a password.</Headline>
                  <Sub>{foundTrainerName} has everything ready{foundClientName ? `, ${firstName(foundClientName)}` : ''}.</Sub>
                </View>
                <View style={{ marginTop: 24 }}>
                  <Field label="Password">
                    <PasswordRow
                      inputRef={createPasswordRef}
                      value={password}
                      onChangeText={setPassword}
                      show={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                      onSubmitEditing={handleCreatePassword}
                    />
                  </Field>
                </View>
              </>
            )}

            {flowStep === 'new_signup' && (
              <>
                <View style={{ gap: 10 }}>
                  <Headline>Your email, then you are in.</Headline>
                  <Sub>
                    {draftAck
                      ? 'Your answers are saved. This just makes them yours.'
                      : inviteTrainer
                        ? `${coachFirst} sees your name and your training. Nothing else on this screen goes to him.`
                        : 'Your coach sees your name and your training. Nothing else on this screen goes to them.'}
                  </Sub>
                </View>
                <View style={{ marginTop: 24, gap: 14 }}>
                  {signingUpAs ? (
                    <View style={styles.asRow}>
                      <Text style={styles.asText} numberOfLines={1} accessibilityLabel={`Signing up as ${signingUpAs}`}>
                        Signing up as <Text style={styles.asName}>{signingUpAs}</Text>
                      </Text>
                      <Text style={styles.asText}> · </Text>
                      <Pressable
                        onPress={() => router.back()}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Change name"
                      >
                        <Text style={styles.asChange}>Change</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Field label="Name">
                      <TextInput
                        ref={nameRef}
                        style={styles.input}
                        placeholder="Your name"
                        placeholderTextColor={OB.faint}
                        value={name}
                        onChangeText={setName}
                        autoComplete="name"
                        textContentType="name"
                        returnKeyType="next"
                        onSubmitEditing={() => emailRef.current?.focus()}
                        accessibilityLabel="Name"
                        selectionColor={OB.accent}
                      />
                    </Field>
                  )}
                  <Field label="Email">
                    <TextInput
                      ref={emailRef}
                      style={styles.input}
                      placeholder="you@example.com"
                      placeholderTextColor={OB.faint}
                      value={contact}
                      onChangeText={setContact}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="emailAddress"
                      autoFocus={!!signingUpAs}
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      accessibilityLabel="Email"
                      selectionColor={OB.accent}
                    />
                  </Field>
                  <Field label="Password">
                    <PasswordRow
                      inputRef={passwordRef}
                      value={password}
                      onChangeText={setPassword}
                      show={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                      returnKeyType={draftDob ? 'done' : 'next'}
                      onSubmitEditing={() => (draftDob ? handleNewSignup() : dobRef.current?.focus())}
                    />
                  </Field>
                  {draftDob ? null : (
                    <Field label="Date of birth">
                      <TextInput
                        ref={dobRef}
                        style={styles.input}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={OB.faint}
                        value={dob}
                        onChangeText={(t) => {
                          const v = formatDobInput(t);
                          setDob(v);
                          if (v.length === 10) Keyboard.dismiss();
                        }}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                        maxLength={10}
                        accessibilityLabel="Date of birth"
                        selectionColor={OB.accent}
                      />
                    </Field>
                  )}
                </View>
                <View style={styles.noteRow}>
                  <AccentDot />
                  <Text style={styles.noteText}>Nothing is shared with a coach until you choose one.</Text>
                </View>
              </>
            )}

            {flowStep === 'pick_trainer' && (
              <>
                <View style={{ gap: 10 }}>
                  <Headline>Pick your coach.</Headline>
                  <Sub>Choose who you'll be training with.</Sub>
                </View>
                <View style={{ marginTop: 20 }}>
                  {loadingTrainers ? (
                    <ActivityIndicator size="large" color={OB.accent} style={{ marginTop: 40 }} />
                  ) : trainers.length === 0 ? (
                    <View style={styles.emptySection}>
                      <Ionicons name="people-outline" size={40} color={OB.faint} />
                      <Text style={styles.emptyText}>No coaches available yet</Text>
                    </View>
                  ) : (
                    trainers.map((t, i) => (
                      <View key={t.id}>
                        {i > 0 ? <Hairline /> : null}
                        <Pressable
                          onPress={() => connectToTrainer(t.id)}
                          disabled={loading}
                          style={({ pressed }) => [styles.trainerRow, pressed && { opacity: 0.85 }]}
                          accessibilityRole="button"
                          accessibilityLabel={`Select coach ${t.name}`}
                        >
                          <CoachAvatar trainer={t} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.trainerName}>{t.name}</Text>
                            {t.specialization ? <Text style={styles.trainerSpec}>{t.specialization}</Text> : null}
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={OB.faint} />
                        </Pressable>
                      </View>
                    ))
                  )}
                  {loading ? <ActivityIndicator size="small" color={OB.accent} style={{ marginTop: 16 }} /> : null}
                </View>
              </>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Screen>
  );

  function renderFooter() {
    return (
      <>
        {error ? (
          <Text
            style={styles.errorText}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            accessibilityLabel={`Sign up failed. ${error}`}
          >
            {error}
          </Text>
        ) : null}

        {flowStep === 'welcome' && (
          <>
            <PrimaryButton label="Get started" onPress={() => setFlowStep('lookup')} />
            <TextButton
              label={inviteTrainer ? `Already train with ${coachFirst}? Sign in` : 'Already have an account? Sign in'}
              onPress={() => router.push('/(auth)/client-login')}
            />
          </>
        )}

        {flowStep === 'lookup' && (
          <>
            <PrimaryButton label="Continue" onPress={handleLookup} loading={loading} />
            <TextButton label="Already have an account? Sign in" onPress={() => router.push('/(auth)/client-login')} />
          </>
        )}

        {flowStep === 'create_password' && (
          <>
            <PrimaryButton label="Create account" onPress={handleCreatePassword} loading={loading} />
            <Text style={styles.legalText}>
              By continuing you agree to the{' '}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms of use</Text>
              {' '}and{' '}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy policy</Text>.
            </Text>
          </>
        )}

        {flowStep === 'new_signup' && (
          <>
            <PrimaryButton label="Create account" onPress={handleNewSignup} loading={loading} />
            <Text style={styles.legalText}>
              By continuing you agree to the{' '}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms of use</Text>
              {' '}and{' '}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy policy</Text>.
            </Text>
          </>
        )}
      </>
    );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PasswordRow({
  inputRef, value, onChangeText, show, onToggle, returnKeyType = 'done', onSubmitEditing,
}: {
  inputRef: React.RefObject<TextInput | null>;
  value: string;
  onChangeText: (t: string) => void;
  show: boolean;
  onToggle: () => void;
  returnKeyType?: 'done' | 'next' | 'go';
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={styles.passwordRow}>
      <TextInput
        ref={inputRef}
        style={[styles.input, { flex: 1 }]}
        placeholder="6+ characters"
        placeholderTextColor={OB.faint}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!show}
        autoComplete="password-new"
        textContentType="newPassword"
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel="Password"
        selectionColor={OB.accent}
      />
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={styles.eyeBtn}
        accessibilityRole="button"
        accessibilityLabel={show ? 'Hide password' : 'Show password'}
      >
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={OB.faint} />
      </Pressable>
    </View>
  );
}

/** 44pt coach avatar: real photo when the invite/roster carries one,
 *  otherwise initials on the accent-soft wash. */
function CoachAvatar({ trainer }: { trainer: { name: string; avatar_url?: string | null } }) {
  if (trainer.avatar_url) {
    return <Animated.Image source={{ uri: trainer.avatar_url }} style={styles.avatarImg} />;
  }
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackText}>{initials(trainer.name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: OBSpace.screen, paddingTop: 8 },

  coachChip: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: OB.surface,
    borderRadius: OBRadius.m, borderCurve: 'continuous', borderWidth: 1, borderColor: OB.line,
    padding: 12,
  },
  coachChipTitle: { fontFamily: OBFonts.sansSemiBold, fontSize: 15, color: OB.fg },
  coachChipSub: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.muted, marginTop: 2 },

  avatarImg: { width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous', backgroundColor: OB.surface },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous', backgroundColor: OB.accentSoft,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: OB.line,
  },
  avatarFallbackText: { fontFamily: OBFonts.sansSemiBold, fontSize: 15, color: OB.accent },

  field: { gap: 8 },
  fieldLabel: { fontFamily: OBFonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: OB.faint },
  input: {
    height: 54, borderRadius: OBRadius.m, borderCurve: 'continuous', backgroundColor: OB.surface,
    borderWidth: 1, borderColor: OB.line, paddingHorizontal: 16,
    fontFamily: OBFonts.sans, fontSize: 16, color: OB.fg,
  },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: OBRadius.m, borderCurve: 'continuous',
    backgroundColor: OB.surface, borderWidth: 1, borderColor: OB.line, paddingRight: 14,
  },
  eyeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  noteText: { flex: 1, fontFamily: OBFonts.sans, fontSize: 13, lineHeight: 18, color: OB.muted },

  // "Signing up as Name · Change": one 44pt row in place of the Name field.
  asRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  asText: { fontFamily: OBFonts.sans, fontSize: 14, color: OB.muted, flexShrink: 1 },
  asName: { fontFamily: OBFonts.sansSemiBold, color: OB.fg },
  asChange: { fontFamily: OBFonts.sansSemiBold, fontSize: 14, color: OB.fg, textDecorationLine: 'underline' },

  errorText: { fontFamily: OBFonts.sans, fontSize: 14, color: OB.danger, marginBottom: 4 },

  legalText: { fontFamily: OBFonts.sans, fontSize: 12, lineHeight: 17, color: OB.faint, textAlign: 'center', marginTop: 4 },
  legalLink: { color: OB.muted, textDecorationLine: 'underline' },

  trainerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  trainerName: { fontFamily: OBFonts.sansSemiBold, fontSize: 16, color: OB.fg },
  trainerSpec: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.muted, marginTop: 2 },

  emptySection: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontFamily: OBFonts.sans, fontSize: 15, color: OB.muted },
});
