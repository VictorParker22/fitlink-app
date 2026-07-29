import { useState, useMemo, useEffect, useRef } from 'react';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type AuthMode = 'phone' | 'email';
type PhoneStep = 'phone' | 'otp';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signUp, signInWithPhone, verifyOtp } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('phone');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [isNewUser, setIsNewUser] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Phone
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
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

      const phonesToCheck = [formatted, formatted.replace('+1', ''), formatted.replace('+', '')];
      const { data: existing } = await supabase
        .from('trainers')
        .select('id')
        .in('phone', phonesToCheck)
        .maybeSingle();
      setIsNewUser(!existing);

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
    if (otpCode.length < 6) return setError('Enter the 6-digit code');

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
    if (otpCode.length === 6 && !hasAutoSubmitted.current && !loading) {
      hasAutoSubmitted.current = true;
      handleVerifyOtp();
    }
    if (otpCode.length < 6) {
      hasAutoSubmitted.current = false;
    }
  }, [otpCode]);

  const toggleSignUp = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setSuccess('');
    setConfirmPassword('');
  };

  // Dynamic title
  const getTitle = () => {
    if (authMode === 'phone') {
      return phoneStep === 'otp' ? 'Verify Code' : 'Sign in';
    }
    return isSignUp ? 'Create account' : 'Sign in';
  };

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
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.headerLogo}>FITLINK</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>{getTitle()}</Text>

            {/* Auth Mode Tabs */}
            <View style={styles.authTabs}>
              <TouchableOpacity
                style={[styles.authTab, authMode === 'phone' && styles.authTabActive]}
                onPress={() => switchMode('phone')}
                accessibilityRole="tab"
                accessibilityLabel="Sign in with phone"
              >
                <Text style={[styles.authTabText, authMode === 'phone' && styles.authTabTextActive]}>Phone</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.authTab, authMode === 'email' && styles.authTabActive]}
                onPress={() => switchMode('email')}
                accessibilityRole="tab"
                accessibilityLabel="Sign in with email"
              >
                <Text style={[styles.authTabText, authMode === 'email' && styles.authTabTextActive]}>Email</Text>
              </TouchableOpacity>
            </View>

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

            {/* ===== PHONE FLOW ===== */}
            {authMode === 'phone' && phoneStep === 'phone' && (
              <>
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
                  <Text style={styles.inputHint}>We'll send you a verification code via SMS</Text>
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleSendOtp}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={loading ? 'Sending verification code' : 'Send verification code'}
                >
                  <Text style={styles.submitText}>{loading ? 'Sending...' : 'Send Code'}</Text>
                </TouchableOpacity>
              </>
            )}

            {authMode === 'phone' && phoneStep === 'otp' && (
              <>
                <TouchableOpacity
                  onPress={() => { setPhoneStep('phone'); setError(''); setSuccess(''); }}
                  style={styles.changeRow}
                  accessibilityRole="button"
                  accessibilityLabel="Change phone number"
                >
                  <Ionicons name="arrow-back" size={14} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.changeText}>Change number</Text>
                </TouchableOpacity>

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
                  accessibilityLabel={loading ? 'Verifying code' : 'Verify and sign in'}
                >
                  <Text style={styles.submitText}>{loading ? 'Verifying...' : 'Verify & Sign In'}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleSendOtp} style={styles.linkRow} accessibilityRole="button" accessibilityLabel="Resend verification code">
                  <Text style={styles.linkText}>Didn't receive it? <Text style={styles.linkUnderline}>Resend Code</Text></Text>
                </TouchableOpacity>
              </>
            )}

            {/* ===== EMAIL FLOW ===== */}
            {authMode === 'email' && (
              <>
                {/* Name (Sign Up only) */}
                {isSignUp && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Full name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Coach Mike Johnson"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={emailName}
                      onChangeText={setEmailName}
                      autoComplete="name"
                      accessibilityLabel="Full name"
                      selectionColor="rgba(255,255,255,0.5)"
                    />
                    <View style={styles.inputLine} />
                  </View>
                )}

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
                      placeholder="••••••••"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoComplete="password"
                      accessibilityLabel="Password"
                      selectionColor="rgba(255,255,255,0.5)"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeBtn}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inputLine} />
                </View>

                {/* Confirm Password (Sign Up only) */}
                {isSignUp && (
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
                      <TouchableOpacity
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={styles.eyeBtn}
                        accessibilityRole="button"
                        accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      >
                        <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                      </TouchableOpacity>
                    </View>
                    <View style={[styles.inputLine, confirmPassword && password !== confirmPassword && styles.inputLineError]} />
                    {confirmPassword && password !== confirmPassword && (
                      <Text style={styles.fieldError}>Passwords don't match</Text>
                    )}
                  </View>
                )}

                {/* Forgot Password */}
                {!isSignUp && (
                  <TouchableOpacity onPress={handleForgotPassword} style={styles.linkRow} accessibilityRole="button" accessibilityLabel="Forgot password">
                    <Text style={styles.forgotText}>Forgot password</Text>
                  </TouchableOpacity>
                )}

                {/* Terms */}
                <Text style={styles.termsText}>
                  By clicking "{isSignUp ? 'Sign up' : 'Sign in'}", you agree to our{' '}
                  <Text style={styles.termsLink}>Terms and Conditions</Text> and consent to our{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>.
                </Text>

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleEmailSubmit}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={loading ? 'Please wait' : (isSignUp ? 'Sign up' : 'Sign in')}
                >
                  <Text style={styles.submitText}>{loading ? 'Please wait...' : (isSignUp ? 'Sign up' : 'Sign in')}</Text>
                </TouchableOpacity>

                {/* Toggle Sign In / Sign Up */}
                <TouchableOpacity onPress={toggleSignUp} style={styles.toggleRow} accessibilityRole="button" accessibilityLabel={isSignUp ? 'Switch to sign in' : 'Switch to sign up'}>
                  <Text style={styles.toggleText}>
                    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                    <Text style={styles.toggleLink}>{isSignUp ? 'Sign in' : 'Sign up'}</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Phone — "or continue with" divider */}
            {authMode === 'phone' && phoneStep === 'phone' && (
              <View style={styles.dividerSection}>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or continue with</Text>
                  <View style={styles.dividerLine} />
                </View>
                <TouchableOpacity
                  style={styles.altMethodBtn}
                  onPress={() => switchMode('email')}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with email"
                >
                  <Ionicons name="mail-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.altMethodText}>Continue with Email</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Client Login Link */}
            <TouchableOpacity
              onPress={() => router.push('/(auth)/client-login' as any)}
              style={styles.clientRow}
              accessibilityRole="button"
              accessibilityLabel="Go to client login"
            >
              <Text style={styles.clientText}>
                Are you a client? <Text style={styles.clientLink}>Sign in here →</Text>
              </Text>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SCREEN_HEIGHT * 0.06,
    paddingBottom: Spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 4,
  },

  // Title
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 34,
    color: '#FFFFFF',
    marginBottom: Spacing['2xl'],
    marginTop: Spacing.lg,
  },

  // Auth Tabs
  authTabs: {
    flexDirection: 'row',
    marginBottom: Spacing['2xl'],
    gap: 24,
  },
  authTab: {
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  authTabActive: {
    borderBottomColor: '#FFFFFF',
  },
  authTabText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
  },
  authTabTextActive: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bodySemiBold,
  },

  // Messages
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: Spacing.lg,
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: '#FF6B6B',
    flex: 1,
  },
  successText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: '#4CAF50',
    flex: 1,
  },

  // Input
  inputGroup: {
    marginBottom: 28,
  },
  inputLabel: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
  },
  input: {
    fontSize: 16,
    fontFamily: FontFamily.body,
    color: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  inputLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 2,
  },
  inputLineError: {
    backgroundColor: '#FF4444',
  },
  inputHint: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 8,
  },
  fieldError: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: '#FF6B6B',
    marginTop: 6,
  },

  // Password
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  eyeBtn: {
    padding: 8,
  },

  // OTP
  otpInput: {
    letterSpacing: 8,
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 22,
  },

  // Change phone
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.lg,
  },
  changeText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },

  // Links
  linkRow: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  linkText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  linkUnderline: {
    fontFamily: FontFamily.bodySemiBold,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },

  // Forgot password
  forgotText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },

  // Terms
  termsText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 18,
    marginBottom: Spacing.xl,
    marginTop: Spacing.sm,
  },
  termsLink: {
    textDecorationLine: 'underline',
    color: 'rgba(255,255,255,0.6)',
  },

  // Submit
  submitBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Toggle
  toggleRow: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  toggleText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  toggleLink: {
    fontFamily: FontFamily.bodySemiBold,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },

  // Divider
  dividerSection: {
    marginTop: Spacing['2xl'],
    gap: Spacing.lg,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dividerText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  altMethodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 4,
    paddingVertical: 14,
  },
  altMethodText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },

  // Client
  clientRow: {
    marginTop: Spacing['2xl'],
    alignItems: 'center',
    paddingBottom: Spacing.xl,
  },
  clientText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  clientLink: {
    fontFamily: FontFamily.bodySemiBold,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
});
