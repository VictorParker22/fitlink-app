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
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

type AuthMode = 'phone' | 'email';
type PhoneStep = 'phone' | 'otp';

const OTP_LENGTH = 6;

/**
 * FitLink coach sign in — design #14d ("Getting in").
 *
 * Solid lime pill for the primary action, a red-bordered field (not just a
 * banner) when a password is wrong, and "Text me a code instead" as a
 * secondary outline pill under an "or" divider — the same shell also carries
 * the phone-OTP and inline sign-up paths the old screen supported.
 */
export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithPhone, verifyOtp } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('email');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [isNewUser, setIsNewUser] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // accessibilityLiveRegion is Android-only, so on iOS an error that merely
  // appears on screen is silent for VoiceOver. Announce it explicitly.
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`Sign in failed. ${error}`);
  }, [error]);

  const [success, setSuccess] = useState('');

  // Phone
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const otpInputRef = useRef<TextInput>(null);
  const hasAutoSubmitted = useRef(false);
  const [phoneName, setPhoneName] = useState('');

  // Email
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailName, setEmailName] = useState('');

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (raw.startsWith('+')) return raw;
    return `+${digits}`;
  };

  // --- Phone OTP ---
  const handleSendOtp = async () => {
    setError('');
    setSuccess('');
    const formatted = formatPhone(phone);
    if (formatted.length < 11) return setError('Enter a valid phone number');

    setLoading(true);
    try {
      await signInWithPhone(formatted);
      setPhone(formatted);
      setPhoneStep('otp');
      setSuccess('Code sent! Check your phone.');
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    setSuccess('');
    if (otpCode.length < OTP_LENGTH) return setError('Enter the 6-digit code');

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
        if (trainerRow) {
          setIsNewUser(false);
        }
      }
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

  // --- Email ---
  const handleEmailSubmit = async () => {
    setError('');
    setSuccess('');
    if (!email.trim() || !password.trim()) return setError('Fill in all fields');

    setLoading(true);
    try {
      if (isSignUp) {
        if (password.length < 6) throw new Error('Password must be 6+ characters');
        if (password !== confirmPassword) {
          setError("Passwords don't match");
          setLoading(false);
          return;
        }
        await signUp(email, password, emailName);
        setSuccess('Account created! Check email to confirm.');
        setIsSignUp(false);
      } else {
        await signIn(email, password);
      }
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

  const handleForgotPassword = async () => {
    if (!email.trim()) return setError('Enter your email first');
    setLoading(true);
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email);
      if (e) throw e;
      setSuccess('Reset link sent! Check your email.');
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setError('Too many reset attempts. Please try again later.');
      } else {
        setError(err.message || 'Failed to send reset email');
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError('');
    setSuccess('');
    setPhoneStep('phone');
    setOtpCode('');
    setIsSignUp(false);
  };

  useEffect(() => {
    if (otpCode.length === OTP_LENGTH && !hasAutoSubmitted.current && !loading) {
      hasAutoSubmitted.current = true;
      handleVerifyOtp();
    }
    if (otpCode.length < OTP_LENGTH) {
      hasAutoSubmitted.current = false;
    }
  }, [otpCode]);

  const toggleSignUp = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setSuccess('');
    setConfirmPassword('');
  };

  // Dynamic title & subtitle
  const getTitle = () => {
    if (authMode === 'phone') return phoneStep === 'otp' ? 'Check your\nmessages' : 'Welcome back';
    return isSignUp ? 'Create your\naccount' : 'Welcome back';
  };

  const getSubtitle = () => {
    if (authMode === 'phone') {
      return phoneStep === 'otp'
        ? `We sent a six-digit code to ${phone}.`
        : "We'll send you a verification code by text.";
    }
    return isSignUp ? 'Start building your coaching business.' : 'Sign in to keep your day running.';
  };

  // In the email sign-in flow, a generic error is shown as a red field
  // instead of a top banner — matches the design's wrong-password state.
  const isPasswordFieldError = authMode === 'email' && !isSignUp && !!error;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>

            {/* Header — back + logo */}
            <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
              <TouchableOpacity hitSlop={5}
                style={styles.backButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="chevron-back" size={20} color={CoachColors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.headerLogo}>FITLINK</Text>
              <View style={styles.backButton} />
            </View>

            {/* Title + Subtitle */}
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{getTitle()}</Text>
              <Text style={styles.subtitle}>{getSubtitle()}</Text>
            </View>

            {/* Auth Mode Tabs */}
            <View style={styles.authTabs}>
              <TouchableOpacity
                style={[styles.authTab, authMode === 'email' && styles.authTabActive]}
                onPress={() => switchMode('email')}
                accessibilityRole="tab"
                accessibilityLabel="Sign in with email"
              >
                <Text style={[styles.authTabText, authMode === 'email' && styles.authTabTextActive]}>Email</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.authTab, authMode === 'phone' && styles.authTabActive]}
                onPress={() => switchMode('phone')}
                accessibilityRole="tab"
                accessibilityLabel="Sign in with phone"
              >
                <Text style={[styles.authTabText, authMode === 'phone' && styles.authTabTextActive]}>Phone</Text>
              </TouchableOpacity>
            </View>

            {/* Messages — suppressed for the email sign-in password error,
                which renders inline against the field instead. */}
            {!isPasswordFieldError && <Messages error={error} success={success} />}

            {/* ===== PHONE FLOW ===== */}
            {authMode === 'phone' && phoneStep === 'phone' && (
              <View style={styles.form}>
                <Field label="Phone number" hint="We'll send you a verification code by text.">
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
              </View>
            )}

            {authMode === 'phone' && phoneStep === 'otp' && (
              <>
                <TouchableOpacity
                  onPress={() => { setPhoneStep('phone'); setError(''); setSuccess(''); }}
                  style={styles.changeRow}
                  accessibilityRole="button"
                  accessibilityLabel="Change phone number"
                >
                  <Ionicons name="arrow-back" size={13} color={CoachColors.textMuted} />
                  <Text style={styles.changeText}>Change number</Text>
                </TouchableOpacity>

                <OtpBoxes
                  inputRef={otpInputRef}
                  value={otpCode}
                  onChangeText={(t) => setOtpCode(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                />

                <TouchableOpacity onPress={handleSendOtp} style={styles.resendRow} accessibilityRole="button" accessibilityLabel="Resend verification code">
                  <Text style={styles.resendText}>Didn't arrive? <Text style={styles.resendLink}>Resend code</Text></Text>
                </TouchableOpacity>
              </>
            )}

            {/* ===== EMAIL FLOW ===== */}
            {authMode === 'email' && (
              <View style={styles.form}>
                {/* Name (Sign Up only) */}
                {isSignUp && (
                  <Field label="Your name">
                    <TextInput
                      style={styles.input}
                      placeholder="Coach Mike Johnson"
                      placeholderTextColor={CoachColors.textFaint}
                      value={emailName}
                      onChangeText={setEmailName}
                      autoComplete="name"
                      textContentType="name"
                      returnKeyType="next"
                      accessibilityLabel="Full name"
                      selectionColor={CoachColors.accent}
                    />
                  </Field>
                )}

                {/* Email */}
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

                {/* Password */}
                <View style={styles.field}>
                  <View style={styles.passwordLabelRow}>
                    <Text style={styles.fieldLabel}>Password</Text>
                    {!isSignUp && (
                      <TouchableOpacity onPress={handleForgotPassword} hitSlop={8} accessibilityRole="button" accessibilityLabel="Forgot password">
                        <Text style={styles.forgotText}>Forgot it?</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={[styles.fieldBox, isPasswordFieldError && styles.fieldBoxError]}>
                    <View style={styles.rowBetween}>
                      <TextInput
                        style={[styles.input, styles.flex1]}
                        placeholder="••••••••"
                        placeholderTextColor={CoachColors.textFaint}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoComplete={isSignUp ? 'password-new' : 'password'}
                        textContentType={isSignUp ? 'newPassword' : 'password'}
                        returnKeyType={isSignUp ? 'next' : 'go'}
                        accessibilityLabel="Password"
                        selectionColor={CoachColors.accent}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={CoachColors.textFaint} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {isPasswordFieldError && (
                    <View style={styles.messageRow}>
                      <Ionicons name="alert-circle" size={13} color={CoachColors.danger} />
                      <Text style={styles.fieldError}>{error}</Text>
                    </View>
                  )}
                </View>

                {/* Confirm Password (Sign Up only) */}
                {isSignUp && (
                  <Field label="Confirm password">
                    <View style={styles.rowBetween}>
                      <TextInput
                        style={[styles.input, styles.flex1]}
                        placeholder="••••••••"
                        placeholderTextColor={CoachColors.textFaint}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                        autoComplete="password-new"
                        textContentType="newPassword"
                        returnKeyType="go"
                        accessibilityLabel="Confirm password"
                        selectionColor={CoachColors.accent}
                      />
                      <TouchableOpacity
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      >
                        <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={CoachColors.textFaint} />
                      </TouchableOpacity>
                    </View>
                  </Field>
                )}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        {authMode === 'phone' && phoneStep === 'phone' && (
          <PrimaryButton
            title={loading ? 'Sending…' : 'Send code'}
            disabled={loading}
            onPress={handleSendOtp}
          />
        )}

        {authMode === 'phone' && phoneStep === 'otp' && (
          <PrimaryButton
            title={loading ? 'Verifying…' : 'Verify'}
            disabled={loading || otpCode.length < OTP_LENGTH}
            onPress={handleVerifyOtp}
          />
        )}

        {authMode === 'email' && (
          <>
            <PrimaryButton
              title={loading ? 'Please wait…' : (isSignUp ? 'Sign up' : 'Sign in')}
              disabled={loading}
              onPress={handleEmailSubmit}
            />
            <Text style={styles.termsText}>
              By continuing you agree to the <Text style={styles.termsLink}>Terms</Text> and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>.
            </Text>
          </>
        )}

        {authMode === 'phone' && phoneStep === 'phone' && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
            <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
              style={styles.altMethodBtn}
              onPress={() => switchMode('email')}
              accessibilityRole="button"
              accessibilityLabel="Continue with email"
            >
              <Ionicons name="mail-outline" size={15} color={CoachColors.textSecondary} />
              <Text style={styles.altMethodText}>Continue with email</Text>
            </TouchableOpacity>
          </>
        )}

        {authMode === 'email' && !isSignUp && (
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>
        )}
        {authMode === 'email' && !isSignUp && (
          <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
            style={styles.altMethodBtn}
            onPress={() => switchMode('phone')}
            accessibilityRole="button"
            accessibilityLabel="Text me a code instead"
          >
            <Ionicons name="phone-portrait-outline" size={15} color={CoachColors.textSecondary} />
            <Text style={styles.altMethodText}>Text me a code instead</Text>
          </TouchableOpacity>
        )}

        {authMode === 'email' && (
          <TouchableOpacity onPress={toggleSignUp} accessibilityRole="button" accessibilityLabel={isSignUp ? 'Switch to sign in' : 'Switch to sign up'}>
            <Text style={styles.footerLinkRow}>
              {isSignUp ? 'Already have an account? ' : 'New here? '}
              <Text style={styles.footerLinkStrong}>{isSignUp ? 'Sign in' : 'Create an account'}</Text>
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.push('/(auth)/client-login' as any)}
          accessibilityRole="button"
          accessibilityLabel="Go to client login"
        >
          <Text style={styles.clientLinkRow}>
            Training with a coach? <Text style={styles.clientLinkStrong}>Athlete sign-in</Text>
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
          accessibilityLabel={`Sign in failed. ${error}`}
        >
          <Ionicons name="alert-circle" size={16} color={CoachColors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {success ? (
        <View style={styles.messageRow}>
          <Ionicons name="checkmark-circle" size={16} color={CoachColors.accent} />
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
  scrollContent: { flexGrow: 1 },
  inner: { flex: 1, paddingHorizontal: 24 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 8,
  },
  backButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerLogo: {
    fontFamily: CoachFonts.headingBold, fontSize: 13, letterSpacing: 2.8,
    color: CoachColors.textFaint,
  },

  // Title
  titleBlock: { paddingTop: 24 },
  title: {
    fontFamily: CoachFonts.headingBold, fontSize: 30, lineHeight: 35,
    letterSpacing: -0.6, color: CoachColors.textPrimary,
  },
  subtitle: {
    fontFamily: CoachFonts.body, fontSize: 13.5, lineHeight: 20,
    color: CoachColors.textSecondary, marginTop: 10,
  },

  // Tabs
  authTabs: { flexDirection: 'row', marginTop: 24, gap: 22, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted },
  authTab: { paddingBottom: 11, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  authTabActive: { borderBottomColor: CoachColors.accent },
  authTabText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted },
  authTabTextActive: { color: CoachColors.textPrimary, fontFamily: CoachFonts.bodyBold },

  // Messages
  messages: { marginTop: 18, gap: 8 },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  errorText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.danger, flex: 1 },
  successText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.accent, flex: 1 },
  fieldError: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.danger, flex: 1 },

  // Form
  form: { marginTop: 22, gap: 16 },
  field: {},
  passwordLabelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 },
  fieldLabel: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginBottom: 7 },
  forgotText: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.accent },
  fieldBox: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 12, paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 13 : 4,
  },
  fieldBoxError: { borderWidth: 1.5, borderColor: CoachColors.danger },
  fieldHint: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textFaint, marginTop: 7 },
  input: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, padding: 0 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex1: { flex: 1 },

  // OTP
  otpRow: { flexDirection: 'row', gap: 9, marginTop: 24, position: 'relative' },
  otpBox: {
    flex: 1, aspectRatio: 1 / 1.25, backgroundColor: CoachColors.surface,
    borderWidth: 1.5, borderColor: CoachColors.borderMuted, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  otpBoxFilled: { borderColor: CoachColors.border },
  otpBoxActive: { borderColor: CoachColors.accent },
  otpDigit: { fontFamily: CoachFonts.headingBold, fontSize: 22, color: CoachColors.textPrimary },
  otpCursor: { width: 2, height: 24, backgroundColor: CoachColors.accent },
  otpHiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },

  resendRow: { alignItems: 'center', marginTop: 20 },
  resendText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },
  resendLink: { fontFamily: CoachFonts.bodyBold, color: CoachColors.textFaint },

  // Change phone
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22 },
  changeText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },

  // Sticky footer
  footer: { paddingHorizontal: 24, paddingTop: 18 },

  primaryBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: CoachColors.borderMuted },
  primaryBtnText: { fontFamily: CoachFonts.headingBold, fontSize: 15, color: CoachColors.onAccent },
  primaryBtnTextDisabled: { color: CoachColors.textFaint },

  termsText: {
    fontFamily: CoachFonts.body, fontSize: 11.5, lineHeight: 17, color: CoachColors.textFaint,
    marginTop: 14, textAlign: 'center',
  },
  termsLink: { color: CoachColors.textSecondary, textDecorationLine: 'underline' },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: CoachColors.borderMuted },
  dividerText: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textFaint },

  altMethodBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
    paddingVertical: 13, marginTop: 16,
  },
  altMethodText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },

  footerLinkRow: {
    fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted,
    marginTop: 18, textAlign: 'center',
  },
  footerLinkStrong: { fontFamily: CoachFonts.bodyBold, color: CoachColors.accent },

  clientLinkRow: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint,
    marginTop: 12, textAlign: 'center',
  },
  clientLinkStrong: { fontFamily: CoachFonts.bodySemiBold, color: CoachColors.textSecondary },
});
