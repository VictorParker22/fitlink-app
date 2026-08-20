/**
 * (auth)/client-signup.tsx — Athlete arrival + sign-up (design turn 25a/25b).
 *
 * Most athletes arrive holding a coach's link, so the first screen answers
 * "whose is this?" before it asks for anything:
 *   - If the link carries ?ref=<trainer_id> (or ?trainer=), the coach's real
 *     name / avatar / specialization is resolved from the public trainers
 *     table and leads the screen.
 *   - If not, a neutral athlete welcome is shown (no invented coach).
 *
 * Sign-up asks for as little as possible; everything else is deferred into
 * the client intake. Mechanics preserved from the previous version:
 * lookup_client_by_contact → create_password (coach pre-added you) or
 * new_signup → create_client_and_notify. AuthGuard handles the redirect
 * after a session exists.
 *
 * Fixed dark/lime system (constants/coachDesign.ts). No useTheme here.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  AccessibilityInfo,
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

const C = CoachColors;
const F = CoachFonts;

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
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ref?: string; trainer?: string }>();

  const [flowStep, setFlowStep] = useState<FlowStep>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // accessibilityLiveRegion is Android-only, so on iOS an error that merely
  // appears on screen is silent for VoiceOver. Announce it explicitly.
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`Sign up failed. ${error}`);
  }, [error]);

  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Coach resolved from the invite link (?ref= / ?trainer=), if any.
  const [inviteTrainer, setInviteTrainer] = useState<InviteTrainer | null>(null);

  // Coach found via lookup (coach pre-added this athlete by email/phone).
  const [foundClientName, setFoundClientName] = useState('');
  const [foundTrainerName, setFoundTrainerName] = useState('');

  const [trainers, setTrainers] = useState<any[]>([]);
  const [loadingTrainers, setLoadingTrainers] = useState(false);

  // ── Resolve the inviting coach from the link ref ──────────────────────────
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

    setError(''); setSuccess('');
    setLoading(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('lookup_client_by_contact', { contact_value: lookupVal });
      if (__DEV__) console.log('[ClientSignup] RPC:', JSON.stringify({ lookupVal, data, rpcErr }));
      if (rpcErr) throw rpcErr;

      if (data?.found) {
        if (data.has_account) {
          setSuccess('You already have an account. Taking you to sign in.');
          setTimeout(() => router.push('/(auth)/client-login'), 1500);
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
      console.error('[ClientSignup] Lookup error:', err);
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, [contact, router, inviteTrainer]);

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

      const { error: signUpErr } = await supabase.auth.signUp({
        email: contactEmail,
        password,
        options: { data: { name: name || 'Client', role: 'client' } },
      });
      if (signUpErr) throw signUpErr;

      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: contactEmail, password });
      if (signInErr) throw signInErr;

      const { data: linkResult, error: linkErr } = await supabase.rpc('link_client_to_auth_user', {
        p_email: contactEmail,
        p_phone: !isEmail(contact.trim()) ? formatPhone(contact.trim()) : null,
      });
      if (__DEV__) console.log('[ClientSignup] Link:', JSON.stringify({ linkResult, linkErr }));

      setSuccess("You're in. One moment.");
    } catch (err: any) {
      console.error('[ClientSignup] Error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // ── New athlete: name + email + password, nothing else ────────────────────
  const handleNewSignup = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name');
    if (!contact.trim() || !isEmail(contact.trim())) return setError('Enter your email');
    if (password.length < 6) return setError('Password must be 6+ characters');

    setLoading(true);
    try {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: contact.trim().toLowerCase(),
        password,
        options: { data: { name: name.trim(), role: 'client' } },
      });
      if (signUpErr) throw signUpErr;

      // Arrived on a coach's link — connect straight to that coach.
      if (inviteTrainer) {
        await connectToTrainer(inviteTrainer.id);
        return;
      }

      setLoadingTrainers(true);
      const { data: trainerList } = await supabase
        .from('trainers_public')
        .select('id, name, specialization, avatar_url')
        .order('name');
      setTrainers(trainerList || []);
      setLoadingTrainers(false);
      setFlowStep('pick_trainer');
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
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

      setSuccess('Connected. One moment.');
    } catch (err: any) {
      setError(err.message || 'Failed to connect to coach');
      setLoading(false);
    }
  };

  const goBack = () => {
    setError(''); setSuccess('');
    if (flowStep === 'welcome') router.back();
    else if (flowStep === 'lookup') setFlowStep('welcome');
    else if (flowStep === 'pick_trainer') setFlowStep('new_signup');
    else { setFlowStep('lookup'); setPassword(''); }
  };

  const coachFirst = firstName(inviteTrainer?.name);

  // ── 25a: the front door ────────────────────────────────────────────────────
  if (flowStep === 'welcome') {
    return (
      <View style={st.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={[st.welcomeBody, { paddingTop: insets.top + 30 }]}>
          <Text style={st.brand}>FITLINK</Text>

          <View style={{ flex: 1 }} />

          {inviteTrainer ? (
            <>
              <View style={st.coachAvatarWrap}>
                {inviteTrainer.avatar_url ? (
                  <Avatar name={inviteTrainer.name} size="lg" imageUrl={inviteTrainer.avatar_url} />
                ) : (
                  <Text style={st.coachAvatarText}>{initials(inviteTrainer.name)}</Text>
                )}
              </View>
              <Text style={st.welcomeTitle}>{inviteTrainer.name}{'\n'}invited you to train</Text>
              <Text style={st.welcomeSub}>
                {inviteTrainer.specialization
                  ? `${inviteTrainer.specialization}. `
                  : ''}
                You'll get {coachFirst}'s programme, check-ins, and a way to reach {coachFirst} that isn't a text message that gets forgotten.
              </Text>
            </>
          ) : (
            <>
              <Text style={st.welcomeTitle}>Train with your coach,{'\n'}all in one place</Text>
              <Text style={st.welcomeSub}>
                Your programme, your check-ins, and a direct line to your coach. If they sent you a link, your plan is already on its way.
              </Text>
            </>
          )}

          <View style={st.stepsCol}>
            {[
              'A few questions about you',
              inviteTrainer ? `${coachFirst} picks the right plan` : 'Your coach picks the right plan',
              'Then you train',
            ].map((label, i) => (
              <View key={i} style={st.stepRow}>
                <View style={st.stepNum}><Text style={st.stepNumText}>{i + 1}</Text></View>
                <Text style={st.stepLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[st.welcomeFooter, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={st.primaryBtn}
            onPress={() => setFlowStep('lookup')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Get started"
          >
            <Text style={st.primaryBtnText}>Get started</Text>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => router.push('/(auth)/client-login')}
            style={st.footerRow}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={st.footerText}>
              {inviteTrainer ? `Already train with ${coachFirst}? ` : 'Already have an account? '}
              <Text style={st.footerLink}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── 25b: the form steps ─────────────────────────────────────────────────────
  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[st.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <TouchableOpacity hitSlop={5} style={st.backBtn} onPress={goBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color="#C9CEC2" />
          </TouchableOpacity>

          {/* Title */}
          {flowStep === 'lookup' && (
            <>
              <Text style={st.title}>First, your email{'\n'}or phone</Text>
              <Text style={st.subtitle}>
                {inviteTrainer
                  ? `If ${coachFirst} already added you, everything is ready and you just set a password.`
                  : 'If your coach already added you, everything is ready and you just set a password.'}
              </Text>
            </>
          )}
          {flowStep === 'create_password' && (
            <>
              <Text style={st.title}>Almost there{foundClientName ? `, ${firstName(foundClientName)}` : ''}</Text>
              <Text style={st.subtitle}>
                {foundTrainerName} has everything ready. Set a password and you're in.
              </Text>
            </>
          )}
          {flowStep === 'new_signup' && (
            <>
              <Text style={st.title}>Make your account</Text>
              <Text style={st.subtitle}>
                {inviteTrainer
                  ? `${coachFirst} sees your name and your training. Nothing else on this screen goes to him.`
                  : 'Your coach sees your name and your training. Nothing else on this screen goes to them.'}
              </Text>
            </>
          )}
          {flowStep === 'pick_trainer' && (
            <>
              <Text style={st.title}>Pick your coach</Text>
              <Text style={st.subtitle}>Choose who you'll be training with.</Text>
            </>
          )}

          {/* Messages */}
          {error ? (
            <View
              style={st.messageBox}
              accessible
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              accessibilityLabel={`Sign up failed. ${error}`}
            >
              <Ionicons name="alert-circle" size={19} color={C.danger} />
              <Text style={st.errorText}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={st.messageBox}>
              <Ionicons name="checkmark-circle" size={19} color={C.accent} />
              <Text style={st.successText}>{success}</Text>
            </View>
          ) : null}

          {/* Lookup */}
          {flowStep === 'lookup' && (
            <>
              <View style={st.field}>
                <Text style={st.fieldLabel}>Email or phone</Text>
                <TextInput
                  style={st.input}
                  placeholder="you@example.com or (555) 000-0000"
                  placeholderTextColor={C.textFaint}
                  value={contact}
                  onChangeText={setContact}
                  autoCapitalize="none"
                  autoFocus
                  keyboardType="email-address"
                  autoComplete="username"
                  textContentType="username"
                  returnKeyType="next"
                  accessibilityLabel="Email or phone number"
                  selectionColor={C.accent}
                />
              </View>
              <TouchableOpacity
                style={[st.primaryBtn, { marginTop: 26 }, loading && st.btnDisabled]}
                onPress={handleLookup}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Continue"
              >
                <Text style={st.primaryBtnText}>{loading ? 'Checking...' : 'Continue'}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Coach pre-added you: password only */}
          {flowStep === 'create_password' && (
            <>
              <View style={st.field}>
                <Text style={st.fieldLabel}>Password</Text>
                <View style={st.passwordWrap}>
                  <TextInput
                    style={[st.input, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
                    placeholder="6+ characters"
                    placeholderTextColor={C.textFaint}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password-new"
                    textContentType="newPassword"
                    returnKeyType="go"
                    autoFocus
                    accessibilityLabel="Create password"
                    selectionColor={C.accent}
                  />
                  <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }} onPress={() => setShowPassword(!showPassword)} style={st.showBtn} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    <Text style={st.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={st.fieldHint}>Six characters is enough.</Text>
              </View>

              <TouchableOpacity
                style={[st.primaryBtn, { marginTop: 26 }, loading && st.btnDisabled]}
                onPress={handleCreatePassword}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Create account"
              >
                <Text style={st.primaryBtnText}>{loading ? 'Setting up...' : 'Create account'}</Text>
              </TouchableOpacity>
              <Text style={st.termsText}>
                By continuing you agree to the <Text style={st.termsLink}>terms</Text> and <Text style={st.termsLink}>privacy policy</Text>
              </Text>
            </>
          )}

          {/* New athlete */}
          {flowStep === 'new_signup' && (
            <>
              <View style={st.field}>
                <Text style={st.fieldLabel}>Name</Text>
                <TextInput
                  style={st.input}
                  placeholder="Your name"
                  placeholderTextColor={C.textFaint}
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  accessibilityLabel="Name"
                  selectionColor={C.accent}
                />
              </View>
              <View style={st.field}>
                <Text style={st.fieldLabel}>Email</Text>
                <TextInput
                  style={st.input}
                  placeholder="you@example.com"
                  placeholderTextColor={C.textFaint}
                  value={contact}
                  onChangeText={setContact}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  accessibilityLabel="Email"
                  selectionColor={C.accent}
                />
              </View>
              <View style={st.field}>
                <Text style={st.fieldLabel}>Password</Text>
                <View style={st.passwordWrap}>
                  <TextInput
                    style={[st.input, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
                    placeholder="6+ characters"
                    placeholderTextColor={C.textFaint}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password-new"
                    textContentType="newPassword"
                    returnKeyType="go"
                    accessibilityLabel="Create password"
                    selectionColor={C.accent}
                  />
                  <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }} onPress={() => setShowPassword(!showPassword)} style={st.showBtn} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    <Text style={st.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={st.fieldHint}>Six characters is enough.</Text>
              </View>

              <TouchableOpacity
                style={[st.primaryBtn, { marginTop: 26 }, loading && st.btnDisabled]}
                onPress={handleNewSignup}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Create account"
              >
                <Text style={st.primaryBtnText}>{loading ? 'Creating...' : 'Create account'}</Text>
              </TouchableOpacity>
              <Text style={st.termsText}>
                By continuing you agree to the <Text style={st.termsLink}>terms</Text> and <Text style={st.termsLink}>privacy policy</Text>
              </Text>
            </>
          )}

          {/* Pick a coach (no invite ref) */}
          {flowStep === 'pick_trainer' && (
            <>
              {loadingTrainers ? (
                <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 40 }} />
              ) : trainers.length === 0 ? (
                <View style={st.emptySection}>
                  <Ionicons name="people-outline" size={45} color={C.textFaint} />
                  <Text style={st.emptyText}>No coaches available yet</Text>
                </View>
              ) : (
                trainers.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    activeOpacity={0.7}
                    onPress={() => connectToTrainer(t.id)}
                    disabled={loading}
                    style={st.trainerCard}
                    accessibilityRole="button"
                    accessibilityLabel={`Select coach ${t.name}`}
                  >
                    <Avatar name={t.name} size="md" imageUrl={t.avatar_url} />
                    <View style={{ flex: 1 }}>
                      <Text style={st.trainerName}>{t.name}</Text>
                      {t.specialization ? <Text style={st.trainerSpec}>{t.specialization}</Text> : null}
                    </View>
                    <View style={st.selectBadge}>
                      <Text style={st.selectText}>Select</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {/* Footer */}
          {flowStep !== 'pick_trainer' && (
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => router.push('/(auth)/client-login')}
              style={st.footerRow}
              accessibilityRole="button"
              accessibilityLabel="Go to sign in"
            >
              <Text style={st.footerText}>
                Already have an account? <Text style={st.footerLink}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Welcome (25a)
  welcomeBody: { flex: 1, paddingHorizontal: 24 },
  brand: {
    fontFamily: F.headingBold, fontSize: 14.5, letterSpacing: 3.4,
    color: C.textFaint, textTransform: 'uppercase',
  },
  coachAvatarWrap: {
    width: 72, height: 72, borderRadius: 36, borderCurve: 'continuous', backgroundColor: '#2A3320',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  coachAvatarText: { fontFamily: F.headingBold, fontSize: 27, color: C.accent },
  welcomeTitle: {
    fontFamily: F.headingBold, fontSize: 34.5, lineHeight: 41.5,
    color: C.textPrimary, marginTop: 20,
  },
  welcomeSub: { fontFamily: F.body, fontSize: 15.5, lineHeight: 24.5, color: '#A9AF9F', marginTop: 12 },
  stepsCol: { gap: 11, marginTop: 26 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  stepNum: {
    width: 24, height: 24, borderRadius: 8, borderCurve: 'continuous', backgroundColor: '#1E211D',
    borderWidth: 1, borderColor: '#2E322B', alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { fontFamily: F.bodyBold, fontSize: 13, color: C.accent },
  stepLabel: { flex: 1, fontFamily: F.body, fontSize: 15, color: '#C9CEC2' },
  welcomeFooter: { paddingHorizontal: 24, paddingTop: 26 },

  // Form steps
  scrollContent: { flexGrow: 1, paddingHorizontal: 20 },
  backBtn: {
    width: 34, height: 34, borderRadius: 17, borderCurve: 'continuous', backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: F.headingBold, fontSize: 30, lineHeight: 36,
    color: C.textPrimary, marginTop: 26,
  },
  subtitle: { fontFamily: F.body, fontSize: 14.5, lineHeight: 22.5, color: C.textMuted, marginTop: 9, marginBottom: 26 },

  messageBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted, borderRadius: 12, borderCurve: 'continuous',
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  errorText: { fontFamily: F.body, fontSize: 14.5, color: C.danger, flex: 1 },
  successText: { fontFamily: F.body, fontSize: 14.5, color: C.accent, flex: 1 },

  field: { marginBottom: 11 },
  fieldLabel: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginBottom: 7 },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 14, borderCurve: 'continuous', paddingVertical: 18, paddingHorizontal: 15,
    fontFamily: F.bodyMedium, fontSize: 17, color: C.textPrimary,
  },
  fieldHint: { fontFamily: F.body, fontSize: 12.5, color: C.textFaint, marginTop: 7 },
  passwordWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14, borderCurve: 'continuous',
  },
  showBtn: { paddingHorizontal: 15, paddingVertical: 12 },
  showText: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.accent },

  primaryBtn: {
    backgroundColor: C.accent, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnText: { fontFamily: F.bodyBold, fontSize: 17.5, color: C.onAccent },
  btnDisabled: { opacity: 0.5 },

  termsText: {
    fontFamily: F.body, fontSize: 12.5, color: C.textFaint,
    textAlign: 'center', marginTop: 12, lineHeight: 18,
  },
  termsLink: { color: C.textMuted },

  trainerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 15, marginBottom: 10,
  },
  trainerName: { fontFamily: F.bodySemiBold, fontSize: 16, color: C.textPrimary },
  trainerSpec: { fontFamily: F.body, fontSize: 13.5, color: C.textMuted, marginTop: 2 },
  selectBadge: {
    borderWidth: 1, borderColor: C.border, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 14, paddingVertical: 7,
  },
  selectText: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: '#C9CEC2' },

  emptySection: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontFamily: F.body, fontSize: 15.5, color: C.textMuted },

  footerRow: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  footerText: { fontFamily: F.body, fontSize: 14.5, color: C.textMuted },
  footerLink: { fontFamily: F.bodySemiBold, color: C.accent },
});
