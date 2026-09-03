import { useState, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

type AuthMode = 'phone' | 'email';
type Step = 'info' | 'otp';

const OTP_LENGTH = 6;

/**
 * FitLink coach signup — design #14b/#14c ("Getting in").
 *
 * A three-field form (name, email, password — no confirm box, the password
 * is simply shown as you type) behind a solid lime pill, no ghost/outline
 * button and no green progress dots. The phone path's OTP step reuses the
 * same shell as #14c: six boxes standing in for a single hidden input.
 */
export default function CoachSignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp, signInWithPhone, verifyOtp } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('email');
  const [step, setStep] = useState<Step>('info');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // accessibilityLiveRegion is Android-only, so on iOS an error that merely
  // appears on screen is silent for VoiceOver. Announce it explicitly.
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`Sign up failed. ${error}`);
  }, [error]);

  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const otpInputRef = useRef<TextInput>(null);
  const hasAutoSubmitted = useRef(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (raw.startsWith('+')) return raw;
    return `+${digits}`;
  };

  // --- Email Sign Up ---
  // Note: the design drops the separate "confirm password" box — the value
  // is shown in the clear as you type instead, so a mismatch can't happen.
  // We keep `confirmPassword` state out entirely rather than fake a check.
  const handleEmailSignup = async () => {
    setError(''); setSuccess('');
    if (!name.trim()) return setError('Enter your name');
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid email');
    if (password.length < 6) return setError('Password must be 6+ characters');

    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, name.trim());
      setSuccess('Account created! Check your email to confirm, then sign in.');
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Phone Sign Up ---
  const handleSendOtp = async () => {
    setError(''); setSuccess('');
    const formatted = formatPhone(phone);
    if (formatted.length < 11) return setError('Enter a valid phone number');
    if (!name.trim()) return setError('Enter your name');

    setLoading(true);
    try {
      await signInWithPhone(formatted);
      setPhone(formatted);
      setStep('otp');
      setSuccess('Code sent! Check your phone.');
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(''); setSuccess('');
    if (otpCode.length < OTP_LENGTH) return setError('Enter the 6-digit code');

    setLoading(true);
    try {
      await verifyOtp(phone, otpCode, { name: name.trim() });
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message || 'Invalid code');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit OTP
  useEffect(() => {
    if (otpCode.length === OTP_LENGTH && !hasAutoSubmitted.current && !loading) {
      hasAutoSubmitted.current = true;
      handleVerifyOtp();
    }
    if (otpCode.length < OTP_LENGTH) hasAutoSubmitted.current = false;
  }, [otpCode]);

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(''); setSuccess('');
    setStep('info');
    setOtpCode('');
  };

  const otpReady = otpCode.length === OTP_LENGTH;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          // The sticky footer below is a flex sibling (not an overlay) and it
          // already carries insets.bottom — repeating it here just added a
          // home-indicator-sized dead gap at the end of the form.
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
              <TouchableOpacity hitSlop={5}
                style={styles.backButton}
                onPress={() => step === 'otp' ? setStep('info') : router.back()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="chevron-back" size={22} color={CoachColors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.headerLogo}>FITLINK</Text>
              <View style={styles.backButton} />
            </View>

            {step === 'info' ? (
              <>
                {/* Title */}
                <View style={styles.titleBlock}>
                  <Text style={styles.title}>Set up your{'\n'}coaching account</Text>
                  <Text style={styles.subtitle}>Free for your first five athletes. Elite when you need more.</Text>
                </View>

                {/* Auth Mode Tabs */}
                <View style={styles.authTabs}>
                  <TouchableOpacity
                    style={[styles.authTab, authMode === 'email' && styles.authTabActive]}
                    onPress={() => switchMode('email')}
                    accessibilityRole="tab"
                    accessibilityLabel="Sign up with email"
                  >
                    <Text style={[styles.authTabText, authMode === 'email' && styles.authTabTextActive]}>Email</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.authTab, authMode === 'phone' && styles.authTabActive]}
                    onPress={() => switchMode('phone')}
                    accessibilityRole="tab"
                    accessibilityLabel="Sign up with phone"
                  >
                    <Text style={[styles.authTabText, authMode === 'phone' && styles.authTabTextActive]}>Phone</Text>
                  </TouchableOpacity>
                </View>

                <Messages error={error} success={success} />

                <View style={styles.form}>
                  <Field label="Your name">
                    <TextInput
                      style={styles.input}
                      placeholder="Coach Mike Johnson"
                      placeholderTextColor={CoachColors.textFaint}
                      value={name}
                      onChangeText={setName}
                      autoComplete="name"
                      textContentType="name"
                      returnKeyType="next"
                      accessibilityLabel="Full name"
                      selectionColor={CoachColors.accent}
                    />
                  </Field>

                  {authMode === 'email' ? (
                    <>
                      <Field label="Email">
                        <TextInput
                          style={styles.input}
                          placeholder="coach@example.com"
                          placeholderTextColor={CoachColors.textFaint}
                          value={email}
                          onChangeText={setEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoComplete="email"
                          textContentType="emailAddress"
                          returnKeyType="next"
                          accessibilityLabel="Email address"
                          selectionColor={CoachColors.accent}
                        />
                      </Field>

                      <Field
                        label="Password"
                        hint="Shown as you type, so there's no second box to fill in."
                      >
                        <View style={styles.rowBetween}>
                          <TextInput
                            style={[styles.input, styles.flex1]}
                            placeholder="At least 6 characters"
                            placeholderTextColor={CoachColors.textFaint}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            autoComplete="password-new"
                            textContentType="newPassword"
                            returnKeyType="next"
                            accessibilityLabel="Password"
                            selectionColor={CoachColors.accent}
                          />
                          <TouchableOpacity
                            onPress={() => setShowPassword(!showPassword)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                          >
                            <Ionicons
                              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                              size={18}
                              color={CoachColors.textFaint}
                            />
                          </TouchableOpacity>
                        </View>
                      </Field>
                    </>
                  ) : (
                    <Field label="Phone number" hint="We'll send a verification code via text.">
                      <TextInput
                        style={styles.input}
                        placeholder="(555) 123-4567"
                        placeholderTextColor={CoachColors.textFaint}
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        autoComplete="tel"
                        textContentType="telephoneNumber"
                        returnKeyType="done"
                        accessibilityLabel="Phone number"
                        selectionColor={CoachColors.accent}
                      />
                    </Field>
                  )}
                </View>
              </>
            ) : (
              <>
                {/* Title */}
                <View style={styles.titleBlock}>
                  <Text style={styles.title}>Check your{'\n'}messages</Text>
                  <Text style={styles.subtitle}>
                    We sent a six-digit code to <Text style={styles.subtitleStrong}>{phone}</Text>.{' '}
                    <Text style={styles.subtitleLink} onPress={() => setStep('info')}>Wrong number?</Text>
                  </Text>
                </View>

                <Messages error={error} success={success} />

                <OtpBoxes
                  inputRef={otpInputRef}
                  value={otpCode}
                  onChangeText={(t) => setOtpCode(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                />

                <TouchableOpacity
                  onPress={handleSendOtp}
                  style={styles.resendRow}
                  accessibilityRole="button"
                  accessibilityLabel="Resend code"
                >
                  <Text style={styles.resendText}>
                    Didn't arrive? <Text style={styles.resendLink}>Resend code</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky footer: primary action + terms/sign-in links */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        {step === 'info' ? (
          <>
            <PrimaryButton
              title={loading ? 'Creating…' : (authMode === 'email' ? 'Create account' : 'Send code')}
              disabled={loading}
              onPress={authMode === 'email' ? handleEmailSignup : handleSendOtp}
            />
            <Text style={styles.termsText}>
              By continuing you agree to the <Text style={styles.termsLink}>Terms</Text> and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>.
            </Text>
          </>
        ) : (
          <>
            <PrimaryButton
              title={loading ? 'Verifying…' : 'Verify'}
              disabled={!otpReady || loading}
              onPress={handleVerifyOtp}
            />
            <Text style={styles.termsText}>Submits on its own once all six are in</Text>
          </>
        )}

        <TouchableOpacity
          onPress={() => router.push('/(auth)/login')}
          accessibilityRole="button"
          accessibilityLabel="Go to sign in"
        >
          <Text style={styles.footerLinkRow}>
            Already have an account? <Text style={styles.footerLinkStrong}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>{children}</View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function Messages({ error, success }: { error: string; success: string }) {
  if (!error && !success) return null;
  return (
    <View style={styles.messages}>
      {error ? (
        <View
          style={styles.messageRow}
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          accessibilityLabel={`Sign up failed. ${error}`}
        >
          <Ionicons name="alert-circle" size={18} color={CoachColors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {success ? (
        <View style={styles.messageRow}>
          <Ionicons name="checkmark-circle" size={18} color={CoachColors.accent} />
          <Text style={styles.successText}>{success}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && styles.primaryBtnDisabled]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text style={[styles.primaryBtnText, disabled && styles.primaryBtnTextDisabled]}>{title}</Text>
    </TouchableOpacity>
  );
}

/**
 * Six-box OTP display (#14c) backed by one hidden TextInput so the native
 * keyboard, paste and autofill-from-SMS all keep working — only the visual
 * layer changes.
 */
function OtpBoxes({
  inputRef, value, onChangeText,
}: {
  inputRef: React.RefObject<TextInput | null>;
  value: string;
  onChangeText: (t: string) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={1}
      style={styles.otpRow}
      onPress={() => inputRef.current?.focus()}
    >
      {Array.from({ length: OTP_LENGTH }).map((_, i) => {
        const digit = value[i];
        const isCursor = i === value.length;
        return (
          <View
            key={i}
            style={[
              styles.otpBox,
              digit !== undefined && styles.otpBoxFilled,
              isCursor && styles.otpBoxActive,
            ]}
          >
            {digit !== undefined ? (
              <Text style={styles.otpDigit}>{digit}</Text>
            ) : isCursor ? (
              <View style={styles.otpCursor} />
            ) : null}
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        style={styles.otpHiddenInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        accessibilityLabel="Verification code"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 8,
  },
  backButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerLogo: {
    fontFamily: CoachFonts.headingBold, fontSize: 14.5, letterSpacing: 2.8,
    color: CoachColors.textFaint,
  },

  // Title
  titleBlock: { paddingTop: 28 },
  title: {
    fontFamily: CoachFonts.headingBold, fontSize: 33.5, lineHeight: 39,
    letterSpacing: -0.6, color: CoachColors.textPrimary,
  },
  subtitle: {
    fontFamily: CoachFonts.body, fontSize: 15, lineHeight: 22.5,
    color: CoachColors.textSecondary, marginTop: 10,
  },
  subtitleStrong: { fontFamily: CoachFonts.bodySemiBold, color: CoachColors.textPrimary },
  subtitleLink: { fontFamily: CoachFonts.bodyBold, color: CoachColors.accent },

  // Tabs
  authTabs: { flexDirection: 'row', marginTop: 24, gap: 22, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted },
  authTab: { paddingBottom: 11, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  authTabActive: { borderBottomColor: CoachColors.accent },
  authTabText: { fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textMuted },
  authTabTextActive: { color: CoachColors.textPrimary, fontFamily: CoachFonts.bodyBold },

  // Messages
  messages: { marginTop: 18, gap: 8 },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.danger, flex: 1 },
  successText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.accent, flex: 1 },

  // Form
  form: { marginTop: 22, gap: 16 },
  field: {},
  fieldLabel: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginBottom: 7 },
  fieldBox: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 13 : 4,
  },
  fieldHint: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint, marginTop: 7 },
  input: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17.5, color: CoachColors.textPrimary, padding: 0 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex1: { flex: 1 },

  // OTP
  otpRow: { flexDirection: 'row', gap: 9, marginTop: 30, position: 'relative' },
  otpBox: {
    flex: 1, aspectRatio: 1 / 1.25, backgroundColor: CoachColors.surface,
    borderWidth: 1.5, borderColor: CoachColors.borderMuted, borderRadius: 12, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
  },
  otpBoxFilled: { borderColor: CoachColors.border },
  otpBoxActive: { borderColor: CoachColors.accent },
  otpDigit: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary },
  otpCursor: { width: 2, height: 24, backgroundColor: CoachColors.accent },
  otpHiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },

  resendRow: { alignItems: 'center', marginTop: 20 },
  resendText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted },
  resendLink: { fontFamily: CoachFonts.bodyBold, color: CoachColors.textFaint },

  // Sticky footer
  footer: { paddingHorizontal: 24, paddingTop: 18 },

  primaryBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: CoachColors.borderMuted },
  primaryBtnText: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.onAccent },
  primaryBtnTextDisabled: { color: CoachColors.textFaint },

  termsText: {
    fontFamily: CoachFonts.body, fontSize: 13, lineHeight: 19, color: CoachColors.textFaint,
    marginTop: 14, textAlign: 'center',
  },
  termsLink: { color: CoachColors.textSecondary, textDecorationLine: 'underline' },

  footerLinkRow: {
    fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textMuted,
    marginTop: 18, textAlign: 'center',
  },
  footerLinkStrong: { fontFamily: CoachFonts.bodyBold, color: CoachColors.accent },
});
