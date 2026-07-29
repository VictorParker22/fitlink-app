import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions,
  StatusBar, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Spacing, FontFamily } from '../../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type AuthMode = 'phone' | 'email';
type Step = 'info' | 'otp';

export default function CoachSignupScreen() {
  const router = useRouter();
  const { signUp, signInWithPhone, verifyOtp } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('email');
  const [step, setStep] = useState<Step>('info');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
  const handleEmailSignup = async () => {
    setError(''); setSuccess('');
    if (!name.trim()) return setError('Enter your name');
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid email');
    if (password.length < 6) return setError('Password must be 6+ characters');
    if (password !== confirmPassword) return setError("Passwords don't match");

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
    if (otpCode.length < 6) return setError('Enter the 6-digit code');

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
    if (otpCode.length === 6 && !hasAutoSubmitted.current && !loading) {
      hasAutoSubmitted.current = true;
      handleVerifyOtp();
    }
    if (otpCode.length < 6) hasAutoSubmitted.current = false;
  }, [otpCode]);

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(''); setSuccess('');
    setStep('info');
    setOtpCode('');
  };

  // Step indicator
  const currentStepNum = step === 'otp' ? 2 : 1;
  const totalSteps = authMode === 'phone' ? 2 : 1;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => step === 'otp' ? setStep('info') : router.back()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.headerLogo}>FITLINK</Text>
            </View>

            {/* Step indicator */}
            {authMode === 'phone' && (
              <View style={styles.stepRow}>
                <View style={[styles.stepDot, currentStepNum >= 1 && styles.stepDotActive]} />
                <View style={[styles.stepLine, currentStepNum >= 2 && styles.stepLineActive]} />
                <View style={[styles.stepDot, currentStepNum >= 2 && styles.stepDotActive]} />
              </View>
            )}

            {/* Title */}
            <Text style={styles.title}>
              {step === 'otp' ? 'Verify your\nphone' : 'Create your\naccount'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'otp'
                ? `Enter the code sent to ${phone}`
                : 'Start building your coaching business on FitLink.'}
            </Text>

            {/* Auth Mode Tabs */}
            {step === 'info' && (
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
            )}

            {/* Messages */}
            {error ? (
              <View style={styles.messageBox}>
                <Ionicons name="alert-circle" size={18} color="#FF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {success ? (
              <View style={styles.messageBox}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={styles.successText}>{success}</Text>
              </View>
            ) : null}

            {/* ===== INFO STEP ===== */}
            {step === 'info' && (
              <>
                {/* Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Full name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Coach Mike Johnson"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={name}
                    onChangeText={setName}
                    autoComplete="name"
                    accessibilityLabel="Full name"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <View style={styles.inputLine} />
                </View>

                {authMode === 'email' ? (
                  <>
                    {/* Email */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Email</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="coach@example.com"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        accessibilityLabel="Email address"
                        selectionColor="rgba(255,255,255,0.5)"
                      />
                      <View style={styles.inputLine} />
                    </View>

                    {/* Password */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Password</Text>
                      <View style={styles.passwordRow}>
                        <TextInput
                          style={[styles.input, styles.passwordInput]}
                          placeholder="6+ characters"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry={!showPassword}
                          accessibilityLabel="Password"
                          selectionColor="rgba(255,255,255,0.5)"
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.inputLine} />
                    </View>

                    {/* Confirm Password */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Confirm password</Text>
                      <View style={styles.passwordRow}>
                        <TextInput
                          style={[styles.input, styles.passwordInput]}
                          placeholder="••••••••"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          secureTextEntry={!showConfirmPassword}
                          accessibilityLabel="Confirm password"
                          selectionColor="rgba(255,255,255,0.5)"
                        />
                        <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn} accessibilityRole="button" accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                          <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                      </View>
                      <View style={[styles.inputLine, confirmPassword && password !== confirmPassword && styles.inputLineError]} />
                      {confirmPassword && password !== confirmPassword && (
                        <Text style={styles.fieldError}>Passwords don't match</Text>
                      )}
                    </View>
                  </>
                ) : (
                  /* Phone */
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Phone number</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="(555) 123-4567"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      accessibilityLabel="Phone number"
                      selectionColor="rgba(255,255,255,0.5)"
                    />
                    <View style={styles.inputLine} />
                    <Text style={styles.inputHint}>We'll send a verification code via SMS</Text>
                  </View>
                )}

                {/* Terms */}
                <Text style={styles.termsText}>
                  By creating an account, you agree to our{' '}
                  <Text style={styles.termsLink}>Terms and Conditions</Text> and consent to our{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>.
                </Text>

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={authMode === 'email' ? handleEmailSignup : handleSendOtp}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={loading ? 'Creating account' : 'Create account'}
                >
                  <Text style={styles.submitText}>
                    {loading ? 'Creating...' : (authMode === 'email' ? 'Create account' : 'Send code')}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* ===== OTP STEP ===== */}
            {step === 'otp' && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Verification code</Text>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    placeholder="000000"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={otpCode}
                    onChangeText={(t) => setOtpCode(t.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    accessibilityLabel="Verification code"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <View style={styles.inputLine} />
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleVerifyOtp}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={loading ? 'Verifying' : 'Verify and continue'}
                >
                  <Text style={styles.submitText}>{loading ? 'Verifying...' : 'Verify & continue'}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleSendOtp} style={styles.linkRow} accessibilityRole="button" accessibilityLabel="Resend code">
                  <Text style={styles.linkText}>Didn't receive it? <Text style={styles.linkUnderline}>Resend code</Text></Text>
                </TouchableOpacity>
              </>
            )}

            {/* Footer */}
            <TouchableOpacity
              onPress={() => router.push('/(auth)/login')}
              style={styles.footerRow}
              accessibilityRole="button"
              accessibilityLabel="Go to sign in"
            >
              <Text style={styles.footerText}>
                Already have an account? <Text style={styles.footerLink}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: SCREEN_HEIGHT * 0.06, paddingBottom: Spacing.md,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerLogo: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: 'rgba(255,255,255,0.6)', letterSpacing: 4 },

  // Step indicator
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xl, gap: 0 },
  stepDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'transparent' },
  stepDotActive: { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
  stepLine: { width: 40, height: 1.5, backgroundColor: 'rgba(255,255,255,0.15)' },
  stepLineActive: { backgroundColor: '#4CAF50' },

  // Title
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: 34, color: '#FFFFFF', lineHeight: 40, marginBottom: Spacing.sm },
  subtitle: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 20, marginBottom: Spacing.xl },

  // Tabs
  authTabs: { flexDirection: 'row', marginBottom: Spacing['2xl'], gap: 24 },
  authTab: { paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  authTabActive: { borderBottomColor: '#FFFFFF' },
  authTabText: { fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.4)' },
  authTabTextActive: { color: '#FFFFFF', fontFamily: FontFamily.bodySemiBold },

  // Messages
  messageBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, marginBottom: Spacing.lg },
  errorText: { fontFamily: FontFamily.body, fontSize: 13, color: '#FF6B6B', flex: 1 },
  successText: { fontFamily: FontFamily.body, fontSize: 13, color: '#4CAF50', flex: 1 },

  // Input
  inputGroup: { marginBottom: 28 },
  inputLabel: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  input: { fontSize: 16, fontFamily: FontFamily.body, color: '#FFFFFF', paddingVertical: 8, paddingHorizontal: 0 },
  inputLine: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 2 },
  inputLineError: { backgroundColor: '#FF4444' },
  inputHint: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 8 },
  fieldError: { fontFamily: FontFamily.body, fontSize: 12, color: '#FF6B6B', marginTop: 6 },

  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1 },
  eyeBtn: { padding: 8 },

  otpInput: { letterSpacing: 8, fontFamily: FontFamily.headingSemiBold, fontSize: 22 },

  // Terms
  termsText: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 18, marginBottom: Spacing.xl },
  termsLink: { textDecorationLine: 'underline', color: 'rgba(255,255,255,0.6)' },

  // Submit
  submitBtn: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 4, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, color: '#FFFFFF', letterSpacing: 0.5 },

  // Links
  linkRow: { alignItems: 'center', marginTop: Spacing.lg },
  linkText: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  linkUnderline: { fontFamily: FontFamily.bodySemiBold, color: '#FFFFFF', textDecorationLine: 'underline' },

  // Footer
  footerRow: { alignItems: 'center', marginTop: Spacing['2xl'], paddingBottom: Spacing.xl },
  footerText: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  footerLink: { fontFamily: FontFamily.bodySemiBold, color: '#FFFFFF', textDecorationLine: 'underline' },
});
