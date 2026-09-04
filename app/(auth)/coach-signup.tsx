/**
 * (auth)/coach-signup.tsx — coach sign-up on the editorial onboarding system
 * (design canvas "FitLink Arrival", EmailSignup.dc.html / SignInCode.dc.html).
 *
 * Two paths behind one Segment: email (name, email, password) or phone
 * (name, phone → OTP). Mechanics preserved from the previous version:
 * supabase auth.signUp for email (unconfirmed until the athlete/coach opens
 * the confirmation email), signInWithPhone + verifyOtp for phone, both via
 * AuthContext so layers tracking keeps firing exactly as before. AuthGuard
 * handles the redirect once a session exists — this screen never navigates
 * on a successful phone verification.
 */
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Linking, Keyboard,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Animated,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { loadDraft } from '../../lib/onboardingDraft';
import { TERMS_URL, PRIVACY_URL } from '../../lib/legalLinks';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { OB, OBFonts, OBRadius, OBSpace, OBMotion } from '../../constants/onboardingDesign';
import {
  Screen, TopNav, Headline, Sub, PrimaryButton, TextButton, Segment, AccentDot,
} from '../../components/onboarding/Editorial';

type AuthMode = 'email' | 'phone';
type Step = 'info' | 'otp';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 300;

const AUTH_OPTIONS: { key: AuthMode; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
];

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (raw.startsWith('+')) return raw;
  return `+${digits}`;
}

export default function CoachSignupScreen() {
  const router = useRouter();
  const { signUp, signInWithPhone, verifyOtp } = useAuth();
  const { showAlert } = useAlert();
  const reduced = useReducedMotion();

  const [authMode, setAuthMode] = useState<AuthMode>('email');
  const [step, setStep] = useState<Step>('info');
  const [draftAck, setDraftAck] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`Sign up failed. ${error}`);
  }, [error]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const hasAutoSubmitted = useRef(false);

  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadDraft().then((d) => {
      if (d.role === 'trainer' && d.goals?.length) setDraftAck(true);
      // The account step already asked for the name; do not ask twice.
      if (d.name) setName((prev) => prev || d.name!);
    });
  }, []);

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
  }, [step, authMode]);
  const bodyOpacity = stepAnim;
  const bodyTranslateY = stepAnim.interpolate({ inputRange: [0, 1], outputRange: reduced ? [0, 0] : [16, 0] });

  // ── Countdown for the OTP resend ──────────────────────────────────────
  useEffect(() => {
    if (step !== 'otp' || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, secondsLeft]);

  // --- Email Sign Up ---
  const handleEmailSignup = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name');
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid email');
    if (password.length < 6) return setError('Password must be 6+ characters');

    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, name.trim());
      showAlert({
        type: 'success',
        title: 'Check your email',
        message: 'Confirm your address, then sign in to finish setting up.',
        buttons: [{ text: 'Got it' }],
      });
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setError('Too many attempts. Try again later.');
      } else {
        setError(err.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Phone Sign Up ---
  const handleSendOtp = async () => {
    setError('');
    const formatted = formatPhone(phone);
    if (formatted.length < 11) return setError('Enter a valid phone number');
    if (!name.trim()) return setError('Enter your name');

    setLoading(true);
    try {
      await signInWithPhone(formatted);
      setPhone(formatted);
      setOtpCode('');
      setSecondsLeft(RESEND_SECONDS);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    if (otpCode.length < OTP_LENGTH) return setError('Enter the 6-digit code');

    setLoading(true);
    try {
      await verifyOtp(phone, otpCode, { name: name.trim() });
      // Left loading — AuthGuard takes it from here.
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setError('Too many attempts. Try again later.');
      } else {
        setError(err.message || 'Invalid code');
      }
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || loading) return;
    setError('');
    setLoading(true);
    try {
      await signInWithPhone(phone);
      setOtpCode('');
      setSecondsLeft(RESEND_SECONDS);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit OTP once all six digits are in.
  useEffect(() => {
    if (otpCode.length === OTP_LENGTH && !hasAutoSubmitted.current && !loading) {
      hasAutoSubmitted.current = true;
      handleVerifyOtp();
    }
    if (otpCode.length < OTP_LENGTH) hasAutoSubmitted.current = false;
  }, [otpCode]);

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError('');
  };

  const handleBack = () => {
    setError('');
    if (step === 'otp') setStep('info');
    else router.back();
  };

  const otpReady = otpCode.length === OTP_LENGTH;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <Screen
      footer={
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
          <PrimaryButton
            label={step === 'otp' ? 'Verify' : authMode === 'email' ? 'Create account' : 'Send code'}
            onPress={step === 'otp' ? handleVerifyOtp : authMode === 'email' ? handleEmailSignup : handleSendOtp}
            loading={loading}
            disabled={step === 'otp' && !otpReady}
          />
          {step === 'info' ? (
            <Text style={styles.legalText}>
              By continuing you agree to the{' '}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms of use</Text>
              {' '}and{' '}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy policy</Text>.
            </Text>
          ) : (
            <TextButton label="Use a different number" onPress={() => setStep('info')} />
          )}
        </>
      }
    >
      <TopNav onBack={handleBack} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[styles.body, { opacity: bodyOpacity, transform: [{ translateY: bodyTranslateY }] }]}>
            {step === 'info' ? (
              <>
                <View style={{ gap: 10 }}>
                  <Headline>Your email, then you are in.</Headline>
                  <Sub>
                    {draftAck
                      ? 'Your answers are saved. This just makes them yours.'
                      : 'Free for your first five athletes. Elite when you need more.'}
                  </Sub>
                </View>

                <View style={{ marginTop: 24 }}>
                  <Segment options={AUTH_OPTIONS} value={authMode} onChange={switchMode} />
                </View>

                <View style={{ marginTop: 20, gap: 14 }}>
                  <Field label="Your name">
                    <TextInput
                      ref={nameRef}
                      style={styles.input}
                      placeholder="Coach Mike Johnson"
                      placeholderTextColor={OB.faint}
                      value={name}
                      onChangeText={setName}
                      autoComplete="name"
                      textContentType="name"
                      returnKeyType="next"
                      onSubmitEditing={() => (authMode === 'email' ? emailRef : phoneRef).current?.focus()}
                      accessibilityLabel="Full name"
                      selectionColor={OB.accent}
                    />
                  </Field>

                  {authMode === 'email' ? (
                    <>
                      <Field label="Email">
                        <TextInput
                          ref={emailRef}
                          style={styles.input}
                          placeholder="you@example.com"
                          placeholderTextColor={OB.faint}
                          value={email}
                          onChangeText={setEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoComplete="email"
                          textContentType="emailAddress"
                          returnKeyType="next"
                          onSubmitEditing={() => passwordRef.current?.focus()}
                          accessibilityLabel="Email address"
                          selectionColor={OB.accent}
                        />
                      </Field>

                      <Field label="Password">
                        <View style={styles.passwordRow}>
                          <TextInput
                            ref={passwordRef}
                            style={[styles.input, { flex: 1 }]}
                            placeholder="At least 6 characters"
                            placeholderTextColor={OB.faint}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            autoComplete="password-new"
                            textContentType="newPassword"
                            returnKeyType="done"
                            onSubmitEditing={handleEmailSignup}
                            accessibilityLabel="Password"
                            selectionColor={OB.accent}
                          />
                          <Pressable
                            onPress={() => setShowPassword((v) => !v)}
                            hitSlop={8}
                            style={styles.eyeBtn}
                            accessibilityRole="button"
                            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                          >
                            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={OB.faint} />
                          </Pressable>
                        </View>
                      </Field>
                    </>
                  ) : (
                    <Field label="Phone number">
                      <TextInput
                        ref={phoneRef}
                        style={styles.input}
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
                    </Field>
                  )}
                </View>

                <View style={styles.noteRow}>
                  <AccentDot />
                  <Text style={styles.noteText}>You set every price. Athletes pay in the app.</Text>
                </View>
              </>
            ) : (
              <>
                <View style={{ gap: 10 }}>
                  <Headline>Check your messages.</Headline>
                  <Sub>We sent a six-digit code to {phone}.</Sub>
                </View>

                <View style={{ marginTop: 28 }}>
                  <OtpBoxes inputRef={otpInputRef} value={otpCode} onChangeText={(t) => {
                    setOtpCode(t);
                    if (t.length === OTP_LENGTH) Keyboard.dismiss();
                  }} />
                  <View style={styles.otpFooterRow}>
                    <Text style={styles.otpTimer}>
                      Expires in <Text style={styles.otpTimerMono}>{mm}:{ss}</Text>
                    </Text>
                    <Pressable onPress={handleResend} disabled={secondsLeft > 0 || loading} hitSlop={8} accessibilityRole="button" accessibilityLabel="Resend code">
                      <Text style={[styles.resendText, (secondsLeft > 0 || loading) && { opacity: 0.4 }]}>Resend</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * Six-box OTP display backed by one hidden TextInput so the native keyboard,
 * paste and autofill-from-SMS all keep working — only the visual layer
 * changes.
 */
function OtpBoxes({
  inputRef, value, onChangeText,
}: {
  inputRef: React.RefObject<TextInput | null>;
  value: string;
  onChangeText: (t: string) => void;
}) {
  return (
    <Pressable style={styles.otpRow} onPress={() => inputRef.current?.focus()}>
      {Array.from({ length: OTP_LENGTH }).map((_, i) => {
        const digit = value[i];
        const isCursor = i === value.length;
        return (
          <View key={i} style={[styles.otpBox, isCursor && styles.otpBoxActive]}>
            {digit !== undefined ? <Text style={styles.otpDigit}>{digit}</Text> : null}
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        style={styles.otpHiddenInput}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        accessibilityLabel="Verification code"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: OBSpace.screen, paddingTop: 8 },

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

  errorText: { fontFamily: OBFonts.sans, fontSize: 14, color: OB.danger, marginBottom: 4 },

  legalText: { fontFamily: OBFonts.sans, fontSize: 12, lineHeight: 17, color: OB.faint, textAlign: 'center', marginTop: 4 },
  legalLink: { color: OB.muted, textDecorationLine: 'underline' },

  otpRow: { flexDirection: 'row', gap: 8, position: 'relative' },
  otpBox: {
    flex: 1, height: 64, borderRadius: OBRadius.m, borderCurve: 'continuous', backgroundColor: OB.surface,
    borderWidth: 1, borderColor: OB.line, alignItems: 'center', justifyContent: 'center',
  },
  otpBoxActive: { borderColor: OB.accent },
  otpDigit: { fontFamily: OBFonts.mono, fontSize: 26, color: OB.fg },
  otpHiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },

  otpFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  otpTimer: { fontFamily: OBFonts.sans, fontSize: 14, color: OB.faint },
  otpTimerMono: { fontFamily: OBFonts.mono, color: OB.fg },
  resendText: { fontFamily: OBFonts.sansMedium, fontSize: 14, color: OB.muted },
});
