/**
 * (auth)/login.tsx — the editorial sign-in (design canvas "FitLink Arrival",
 * SignIn.dc.html / SignInCode.dc.html / ForgotPassword.dc.html).
 *
 * ONE door for both roles: a coach and an athlete sign in on the exact same
 * screen. The account carries its own role in user_metadata — AuthContext
 * reads it on session change and AuthGuard routes accordingly. This screen
 * never has to ask "which one are you".
 *
 * Mechanics kept from the pre-editorial screen (do not regress these):
 *   - email + password sign-in
 *   - phone number -> six-digit OTP (signInWithPhone / verifyOtp)
 *   - the optional "name" field on first OTP verification for a brand-new
 *     phone user (isNewUser starts true; once verifyOtp shows a trainer row
 *     already exists, it flips false and the field disappears)
 *   - forgot password via supabase.auth.resetPasswordForEmail
 *   - rate-limit-aware error copy
 *
 * What changed: no more inline sign-up toggle — "New here?" now sends people
 * to the role picker, which is where the editorial account creation flow
 * lives. Forgot-password is answered inline (a sent-state card takes the
 * place of the link) instead of an Alert.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { OB, OBFonts, OBRadius, OBSpace, OBMotion } from '../../constants/onboardingDesign';
import { Screen, TopNav, Headline, Sub, Segment, PrimaryButton } from '../../components/onboarding/Editorial';

type Mode = 'email' | 'phone';
type PhoneStep = 'phone' | 'otp';

const OTP_LENGTH = 6;
const OTP_SECONDS = 5 * 60;

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (raw.startsWith('+')) return raw;
  return `+${digits}`;
}

function friendlyError(err: any, fallback: string): string {
  const msg = err?.message || '';
  if (msg.toLowerCase().includes('rate limit')) return 'Too many attempts. Try again later.';
  return msg || fallback;
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function LoginScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { signIn, signInWithPhone, verifyOtp } = useAuth();

  const [mode, setMode] = useState<Mode>('email');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [isNewUser, setIsNewUser] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneName, setPhoneName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(OTP_SECONDS);

  const otpInputRef = useRef<TextInput>(null);
  const hasAutoSubmitted = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`Sign in failed. ${error}`);
  }, [error]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startCountdown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsLeft(OTP_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
  }, []);

  /* ── Crossfade between field sets (Reduce Motion: instant) ────────────── */
  const contentKey = mode === 'email' ? 'email' : phoneStep;
  const prevKeyRef = useRef(contentKey);
  const contentOpacity = useSharedValue(1);
  useEffect(() => {
    if (prevKeyRef.current === contentKey) return;
    prevKeyRef.current = contentKey;
    if (reduceMotion) {
      contentOpacity.value = 1;
      return;
    }
    contentOpacity.value = 0;
    contentOpacity.value = withTiming(1, { duration: OBMotion.select, easing: Easing.out(Easing.cubic) });
  }, [contentKey, reduceMotion, contentOpacity]);
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  /* ── Mode switching ─────────────────────────────────────────────────── */
  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setForgotSent(false);
    setPhoneStep('phone');
    setOtpCode('');
    if (timerRef.current) clearInterval(timerRef.current);
  };

  /* ── Email sign-in ─────────────────────────────────────────────────── */
  const handleEmailSignIn = async () => {
    setError('');
    if (!email.trim() || !password.trim()) { setError('Fill in all fields'); return; }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(friendlyError(err, 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    if (!email.trim()) { setError('Enter your email first'); return; }
    setLoading(true);
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (e) throw e;
      setForgotSent(true);
    } catch (err: any) {
      setError(friendlyError(err, 'Failed to send reset email'));
    } finally {
      setLoading(false);
    }
  };

  /* ── Phone OTP ─────────────────────────────────────────────────────── */
  const handleSendOtp = async () => {
    setError('');
    const formatted = formatPhone(phone);
    if (formatted.length < 11) { setError('Enter a valid phone number'); return; }
    setLoading(true);
    try {
      await signInWithPhone(formatted);
      setPhone(formatted);
      setOtpCode('');
      hasAutoSubmitted.current = false;
      setPhoneStep('otp');
      startCountdown();
    } catch (err: any) {
      setError(friendlyError(err, 'Failed to send code'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = useCallback(async () => {
    setError('');
    if (otpCode.length < OTP_LENGTH) { setError('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const metadata: Record<string, string> = {};
      if (isNewUser && phoneName.trim()) metadata.name = phoneName.trim();

      const data = await verifyOtp(phone, otpCode, metadata);

      if (isNewUser && data?.user?.id) {
        const { data: trainerRow } = await supabase
          .from('trainers')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();
        if (trainerRow) setIsNewUser(false);
      }
    } catch (err: any) {
      setError(friendlyError(err, 'Invalid code'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode, phone, phoneName, isNewUser]);

  useEffect(() => {
    if (otpCode.length === OTP_LENGTH) {
      Keyboard.dismiss();
      if (!hasAutoSubmitted.current && !loading) {
        hasAutoSubmitted.current = true;
        handleVerifyOtp();
      }
    } else {
      hasAutoSubmitted.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode]);

  const useDifferentNumber = () => {
    setPhoneStep('phone');
    setOtpCode('');
    setError('');
    if (timerRef.current) clearInterval(timerRef.current);
  };

  /* ── Footer state ──────────────────────────────────────────────────── */
  let primaryLabel: string;
  let primaryOnPress: () => void;
  let primaryDisabled = false;
  if (mode === 'phone') {
    if (phoneStep === 'phone') {
      primaryLabel = loading ? 'Sending…' : 'Send code';
      primaryOnPress = handleSendOtp;
    } else {
      primaryLabel = loading ? 'Verifying…' : 'Verify';
      primaryOnPress = handleVerifyOtp;
      primaryDisabled = otpCode.length < OTP_LENGTH;
    }
  } else {
    primaryLabel = loading ? 'Signing in…' : 'Sign in';
    primaryOnPress = handleEmailSignIn;
  }
  const showCreateRow = !(mode === 'phone' && phoneStep === 'otp');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <Screen
          footer={(
            <>
              {error ? (
                <Text
                  style={s.errorText}
                  accessible
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                >
                  {error}
                </Text>
              ) : null}
              <PrimaryButton label={primaryLabel} onPress={primaryOnPress} loading={loading} disabled={primaryDisabled} />
              {showCreateRow && (
                <Pressable
                  onPress={() => router.push('/(auth)/role' as any)}
                  style={s.createRow}
                  accessibilityRole="button"
                  accessibilityLabel="Create an account"
                >
                  <Text style={s.createRowText}>New here? <Text style={s.createRowStrong}>Create an account</Text></Text>
                </Pressable>
              )}
            </>
          )}
        >
          <TopNav onBack={() => router.back()} />

          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={{ paddingHorizontal: OBSpace.screen, gap: 10, marginTop: 8 }}>
              <Headline>Welcome back.</Headline>
              <Sub>Coach or athlete, the same door.</Sub>
            </View>

            {!(mode === 'phone' && phoneStep === 'otp') && (
              <View style={{ paddingHorizontal: OBSpace.screen, marginTop: 28 }}>
                <Segment
                  options={[{ key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }]}
                  value={mode}
                  onChange={switchMode}
                />
              </View>
            )}

            <Animated.View style={[{ paddingHorizontal: OBSpace.screen, marginTop: 16, gap: 16 }, contentStyle]}>
              {mode === 'email' && (
                <>
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>Email</Text>
                    <View style={s.fieldBox}>
                      <TextInput
                        style={s.fieldInput}
                        placeholder="you@example.com"
                        placeholderTextColor={OB.faint}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        textContentType="emailAddress"
                        returnKeyType="next"
                        accessibilityLabel="Email"
                        selectionColor={OB.accent}
                      />
                    </View>
                  </View>

                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>Password</Text>
                    <View style={s.fieldBox}>
                      <TextInput
                        style={[s.fieldInput, { flex: 1 }]}
                        placeholder="Your password"
                        placeholderTextColor={OB.faint}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoComplete="password"
                        textContentType="password"
                        returnKeyType="done"
                        onSubmitEditing={handleEmailSignIn}
                        accessibilityLabel="Password"
                        selectionColor={OB.accent}
                      />
                      <Pressable
                        onPress={() => setShowPassword((v) => !v)}
                        style={s.eyeBtn}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={OB.faint} />
                      </Pressable>
                    </View>
                  </View>

                  {forgotSent ? (
                    <View style={s.sentCard}>
                      <Ionicons name="checkmark" size={18} color={OB.accent} />
                      <Text style={s.sentText}>
                        <Text style={s.sentBold}>Sent.</Text> Check {email.trim()}, including spam. Nothing in
                        five minutes?{' '}
                        <Text onPress={handleForgotPassword} style={s.sentLink}>Tap resend.</Text>
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleForgotPassword}
                      style={s.forgotRow}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Forgot password"
                    >
                      <Text style={s.forgotText}>Forgot password?</Text>
                    </Pressable>
                  )}
                </>
              )}

              {mode === 'phone' && phoneStep === 'phone' && (
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>Phone</Text>
                  <View style={s.fieldBox}>
                    <TextInput
                      style={s.fieldInput}
                      placeholder="(555) 123-4567"
                      placeholderTextColor={OB.faint}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      textContentType="telephoneNumber"
                      returnKeyType="done"
                      onSubmitEditing={handleSendOtp}
                      accessibilityLabel="Phone number"
                      selectionColor={OB.accent}
                    />
                  </View>
                  <Text style={s.hint}>We'll send you a verification code by text.</Text>
                </View>
              )}

              {mode === 'phone' && phoneStep === 'otp' && (
                <>
                  <Text style={s.otpSub}>We sent a six-digit code to {phone}.</Text>

                  <Pressable style={s.otpRow} onPress={() => otpInputRef.current?.focus()} accessibilityRole="none">
                    {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                      const digit = otpCode[i];
                      const active = i === otpCode.length;
                      return (
                        <View key={i} style={[s.otpBox, active && s.otpBoxActive]}>
                          {digit !== undefined ? <Text style={s.otpDigit}>{digit}</Text> : null}
                        </View>
                      );
                    })}
                    <TextInput
                      ref={otpInputRef}
                      style={s.otpHidden}
                      value={otpCode}
                      onChangeText={(t) => setOtpCode(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                      keyboardType="number-pad"
                      maxLength={OTP_LENGTH}
                      autoComplete="one-time-code"
                      textContentType="oneTimeCode"
                      autoFocus
                      accessibilityLabel="Verification code"
                    />
                  </Pressable>

                  <View style={s.countdownRow}>
                    <Text style={s.countdownText}>
                      Expires in <Text style={s.countdownMono}>{formatCountdown(secondsLeft)}</Text>
                    </Text>
                    <Pressable onPress={handleSendOtp} hitSlop={8} accessibilityRole="button" accessibilityLabel="Resend code">
                      <Text style={s.resendText}>Resend</Text>
                    </Pressable>
                  </View>

                  {isNewUser && (
                    <View style={s.fieldWrap}>
                      <Text style={s.fieldLabel}>Name (optional)</Text>
                      <View style={s.fieldBox}>
                        <TextInput
                          style={s.fieldInput}
                          placeholder="Your name"
                          placeholderTextColor={OB.faint}
                          value={phoneName}
                          onChangeText={setPhoneName}
                          autoComplete="name"
                          textContentType="name"
                          returnKeyType="done"
                          accessibilityLabel="Your name"
                          selectionColor={OB.accent}
                        />
                      </View>
                    </View>
                  )}

                  <Pressable onPress={useDifferentNumber} style={s.differentNumberBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Use a different number">
                    <Text style={s.differentNumberText}>Use a different number</Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          </ScrollView>
        </Screen>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: 24 },

  fieldWrap: { gap: 8 },
  fieldLabel: { fontFamily: OBFonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: OB.faint },
  fieldBox: {
    height: 54, borderRadius: OBRadius.m, borderCurve: 'continuous', backgroundColor: OB.surface,
    borderWidth: 1, borderColor: OB.line, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  fieldInput: { flex: 1, fontFamily: OBFonts.sans, fontSize: 16, color: OB.fg, padding: 0 },
  eyeBtn: { width: 44, height: 44, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.faint },

  forgotRow: { alignSelf: 'flex-end' },
  forgotText: { fontFamily: OBFonts.sansMedium, fontSize: 14, color: OB.muted },

  sentCard: {
    flexDirection: 'row', gap: 12, padding: 16, borderRadius: OBRadius.m, borderCurve: 'continuous',
    backgroundColor: OB.accentSoft, borderWidth: 1, borderColor: OB.accent, alignItems: 'center',
  },
  sentText: { flex: 1, fontFamily: OBFonts.sans, fontSize: 14, lineHeight: 20, color: OB.fg },
  sentBold: { fontFamily: OBFonts.sansSemiBold },
  sentLink: { fontFamily: OBFonts.sansSemiBold, textDecorationLine: 'underline' },

  otpSub: { fontFamily: OBFonts.sans, fontSize: 15, lineHeight: 23, color: OB.muted, marginTop: -4 },
  otpRow: { flexDirection: 'row', gap: 8, position: 'relative' },
  otpBox: {
    flex: 1, height: 64, borderRadius: OBRadius.m, borderCurve: 'continuous', backgroundColor: OB.surface,
    borderWidth: 1, borderColor: OB.line, alignItems: 'center', justifyContent: 'center',
  },
  otpBoxActive: { borderColor: OB.accent },
  otpDigit: { fontFamily: OBFonts.mono, fontSize: 26, color: OB.fg },
  otpHidden: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },

  countdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countdownText: { fontFamily: OBFonts.sans, fontSize: 14, color: OB.faint },
  countdownMono: { fontFamily: OBFonts.mono, color: OB.fg },
  resendText: { fontFamily: OBFonts.sansMedium, fontSize: 14, color: OB.muted },

  differentNumberBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  differentNumberText: { fontFamily: OBFonts.sansMedium, fontSize: 15, color: OB.muted },

  errorText: { fontFamily: OBFonts.sans, fontSize: 14, color: OB.danger },

  createRow: { height: 48, alignItems: 'center', justifyContent: 'center' },
  createRowText: { fontFamily: OBFonts.sans, fontSize: 14, color: OB.muted, textAlign: 'center' },
  createRowStrong: { fontFamily: OBFonts.sansSemiBold, color: OB.fg },
});
