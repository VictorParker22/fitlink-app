/**
 * (auth)/account.tsx — the account step of the editorial onboarding (design
 * canvas "FitLink Arrival", Account.dc.html).
 *
 * Value first, account second: by the time an athlete or coach lands here,
 * their goals/specialties are already staged in lib/onboardingDraft.ts. This
 * screen's only job is turning that draft into a real session. Exactly two
 * ways in — email or a phone verification code — no third-party sign-in.
 * Once a session exists, AuthContext applies the draft and AuthGuard routes;
 * this screen never navigates on a successful phone verification.
 */
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Linking, Keyboard,
  KeyboardAvoidingView, Platform, ScrollView, AccessibilityInfo,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { saveDraft } from '../../lib/onboardingDraft';
import { useAuth } from '../../context/AuthContext';
import { TERMS_URL, PRIVACY_URL } from '../../lib/legalLinks';
import { OB, OBFonts, OBRadius, OBSpace } from '../../constants/onboardingDesign';
import { Screen, TopNav, Headline, Sub, AccentDot, PrimaryButton, TextButton, Segment, Hairline } from '../../components/onboarding/Editorial';

/** Keeps the birth-date field to digits and dashes as YYYY-MM-DD. Copied
 *  from client-signup.tsx so both screens format identically. */
function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  return [y, m, d].filter(Boolean).join('-');
}

const MIN_AGE = 16;

function parseDob(value: string): { ok: true; iso: string } | { ok: false; message: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return { ok: false, message: 'Enter your date of birth as YYYY-MM-DD' };
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  const valid = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  if (!valid || y < 1900) return { ok: false, message: 'That date does not look right' };
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  if (age < MIN_AGE) return { ok: false, message: `You need to be ${MIN_AGE} or older to use FitLink` };
  return { ok: true, iso: value.trim() };
}

/** Formats a raw phone entry into E.164, matching login.tsx exactly so
 *  the two screens read numbers the same way. */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (raw.startsWith('+')) return raw;
  return `+${digits}`;
}

function friendlyError(err: any, fallback: string): string {
  const msg = err?.message || '';
  if (msg.toLowerCase().includes('rate limit')) return 'Too many codes. Try again in a few minutes.';
  return msg || fallback;
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Mode = 'email' | 'phone';
type PhoneStep = 'phone' | 'otp';

const OTP_LENGTH = 6;
const OTP_SECONDS = 5 * 60;

export default function AccountScreen() {
  const router = useRouter();
  const { signInWithPhone, verifyOtp, verifyOtpAsClient } = useAuth();
  const params = useLocalSearchParams<{ role?: string }>();
  const role: 'client' | 'trainer' = params.role === 'trainer' ? 'trainer' : 'client';
  const isClient = role === 'client';

  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [mode, setMode] = useState<Mode>('email');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(OTP_SECONDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dobRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const hasAutoSubmitted = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  const dobCheck = parseDob(dob);
  const nameOk = name.trim().length > 0;
  const dobOk = !isClient || dobCheck.ok;
  const formattedPhone = formatPhone(phone);
  const phoneOk = formattedPhone.replace(/\D/g, '').length >= 11;

  const startCountdown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsLeft(OTP_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
  }, []);

  const switchMode = (m: Mode) => {
    Haptics.selectionAsync();
    setMode(m);
    setError('');
    setPhoneStep('phone');
    setOtpCode('');
    if (timerRef.current) clearInterval(timerRef.current);
  };

  /* ── Email ─────────────────────────────────────────────────────────── */
  const handleContinueWithEmail = async () => {
    if (!nameOk || !dobOk) return;
    setError('');
    await saveDraft({ name: name.trim(), ...(isClient && dobCheck.ok ? { dob: dobCheck.iso } : {}) });
    router.push((isClient ? '/(auth)/client-signup' : '/(auth)/coach-signup') as any);
  };

  /* ── Phone ─────────────────────────────────────────────────────────── */
  const handleSendCode = async () => {
    if (!nameOk || !dobOk || !phoneOk || loading) return;
    setError('');
    setLoading(true);
    try {
      await saveDraft({ name: name.trim(), ...(isClient && dobCheck.ok ? { dob: dobCheck.iso } : {}) });
      await signInWithPhone(formattedPhone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  const handleVerify = useCallback(async () => {
    if (otpCode.length < OTP_LENGTH || loading) return;
    setError('');
    setLoading(true);
    try {
      if (isClient) {
        await verifyOtpAsClient(formattedPhone, otpCode, name.trim() || undefined);
      } else {
        await verifyOtp(formattedPhone, otpCode, name.trim() ? { name: name.trim() } : {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Success: do nothing. AuthContext applies the draft on SIGNED_IN and
      // AuthGuard routes from there.
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(err, 'Invalid code'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode, formattedPhone, name, isClient, loading]);

  useEffect(() => {
    if (otpCode.length === OTP_LENGTH) {
      Keyboard.dismiss();
      if (!hasAutoSubmitted.current && !loading) {
        hasAutoSubmitted.current = true;
        handleVerify();
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

  /* ── Footer ────────────────────────────────────────────────────────── */
  let footerButton: ReactNode;
  if (mode === 'email') {
    footerButton = (
      <PrimaryButton
        label="Continue with email"
        onPress={handleContinueWithEmail}
        disabled={!nameOk || !dobOk}
      />
    );
  } else if (phoneStep === 'phone') {
    footerButton = (
      <PrimaryButton
        label={loading ? 'Sending…' : 'Send code'}
        onPress={handleSendCode}
        disabled={!nameOk || !dobOk || !phoneOk}
        loading={loading}
      />
    );
  } else {
    footerButton = (
      <PrimaryButton
        label={loading ? 'Verifying…' : 'Verify'}
        onPress={handleVerify}
        disabled={otpCode.length < OTP_LENGTH}
        loading={loading}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen
        footer={(
          <>
            {error ? (
              <Text style={s.errorText} accessible accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {error}
              </Text>
            ) : null}
            {footerButton}
            <View style={s.legalWrap}>
              <Text style={s.legalText}>
                By continuing you agree to the{' '}
                <Text style={s.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms of use</Text>
                {' '}and{' '}
                <Text style={s.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy policy</Text>
                .
              </Text>
            </View>
          </>
        )}
      >
        <TopNav onBack={() => router.back()} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false}>
            <View style={{ gap: 10 }}>
              <Headline>Keep this. Save your FitLink.</Headline>
              <Sub>
                {isClient
                  ? 'Your goals and matches are ready. An account makes them yours on any phone.'
                  : 'Your specialties are saved. An account makes them yours on any phone.'}
              </Sub>
            </View>

            <Hairline style={{ marginTop: 28 }} />

            <View style={{ marginTop: 24, gap: 16 }}>
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>Your name</Text>
                <View style={s.fieldBox}>
                  <TextInput
                    style={s.fieldInput}
                    placeholder="Your name"
                    placeholderTextColor={OB.faint}
                    value={name}
                    onChangeText={setName}
                    autoComplete="name"
                    textContentType="name"
                    returnKeyType="next"
                    onSubmitEditing={() => (isClient ? dobRef.current : phoneRef.current)?.focus()}
                    accessibilityLabel="Your name"
                    selectionColor={OB.accent}
                  />
                </View>
              </View>

              {isClient && (
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>Date of birth</Text>
                  <View style={s.fieldBox}>
                    <TextInput
                      ref={dobRef}
                      style={s.fieldInput}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={OB.faint}
                      value={dob}
                      onChangeText={(t) => {
                        const v = formatDobInput(t);
                        setDob(v);
                        // number-pad has no return key on iOS: the field is
                        // done the moment the date is complete.
                        if (v.length === 10) {
                          Keyboard.dismiss();
                          if (mode === 'phone') phoneRef.current?.focus();
                        }
                      }}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      blurOnSubmit
                      maxLength={10}
                      accessibilityLabel="Date of birth"
                      selectionColor={OB.accent}
                    />
                  </View>
                  <Text style={s.hint}>16 or older. Your coach never sees this.</Text>
                </View>
              )}

              <Segment
                options={[{ key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }]}
                value={mode}
                onChange={switchMode}
              />

              {mode === 'phone' && phoneStep === 'phone' && (
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>Phone</Text>
                  <View style={s.fieldBox}>
                    <TextInput
                      ref={phoneRef}
                      style={s.fieldInput}
                      placeholder="(555) 123-4567"
                      placeholderTextColor={OB.faint}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      textContentType="telephoneNumber"
                      returnKeyType="done"
                      onSubmitEditing={handleSendCode}
                      accessibilityLabel="Phone number"
                      selectionColor={OB.accent}
                    />
                  </View>
                  <Text style={s.hint}>We'll send you a verification code by text.</Text>
                </View>
              )}

              {mode === 'phone' && phoneStep === 'otp' && (
                <>
                  <Text style={s.otpSub}>We sent a six-digit code to {formattedPhone}.</Text>

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
                    <Pressable onPress={handleSendCode} hitSlop={8} accessibilityRole="button" accessibilityLabel="Resend code">
                      <Text style={s.resendText}>Resend</Text>
                    </Pressable>
                  </View>

                  <TextButton label="Use a different number" onPress={useDifferentNumber} />
                </>
              )}
            </View>

            <View style={s.noteRow}>
              <AccentDot />
              <Text style={s.noteText}>
                {isClient
                  ? 'Nothing is shared with a coach until you choose one.'
                  : 'You set every price. Athletes pay in the app.'}
              </Text>
            </View>
          </Pressable>
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  body: { flexGrow: 1, paddingHorizontal: OBSpace.screen, paddingTop: 8, paddingBottom: 24 },

  fieldWrap: { gap: 8 },
  fieldLabel: { fontFamily: OBFonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: OB.faint },
  fieldBox: {
    height: 54, borderRadius: OBRadius.m, borderCurve: 'continuous', backgroundColor: OB.surface,
    borderWidth: 1, borderColor: OB.line, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  fieldInput: { flex: 1, fontFamily: OBFonts.sans, fontSize: 16, color: OB.fg, padding: 0 },
  hint: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.faint },

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

  errorText: { fontFamily: OBFonts.sans, fontSize: 14, color: OB.danger },

  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  noteText: { flex: 1, fontFamily: OBFonts.sans, fontSize: 13, lineHeight: 18, color: OB.muted },

  legalWrap: { paddingTop: 8 },
  legalText: { fontFamily: OBFonts.sans, fontSize: 12, lineHeight: 17, color: OB.faint, textAlign: 'center' },
  legalLink: { color: OB.muted, textDecorationLine: 'underline' },
});
