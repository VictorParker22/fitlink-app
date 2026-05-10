import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  Image, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontFamily, FontSize } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 260;

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
  const [phoneName, setPhoneName] = useState('');

  // Email
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailName, setEmailName] = useState('');

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

      const { data: existing } = await supabase
        .from('trainers')
        .select('id')
        .eq('phone', formatted)
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
      if (phoneName.trim()) metadata.name = phoneName.trim();
      await verifyOtp(phone, otpCode, metadata);
    } catch (err: any) {
      setError(err.message || 'Invalid code');
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
          setError('Passwords don\'t match');
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
      setError(err.message || 'Something went wrong');
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
      setError(err.message || 'Failed to send reset email');
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

  const toggleSignUp = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setSuccess('');
    setConfirmPassword('');
  };

  // Dynamic title
  const getTitle = () => {
    if (authMode === 'phone') {
      return phoneStep === 'otp' ? 'Verify Code' : 'Sign In With Phone';
    }
    return isSignUp ? 'Sign Up For Free' : 'Sign In To FitLink';
  };

  const getSubtitle = () => {
    if (authMode === 'phone') {
      return phoneStep === 'otp'
        ? `Enter the code sent to ${phone}`
        : 'We\'ll send you a quick verification code';
    }
    return isSignUp
      ? 'Quickly make your account in 1 minute'
      : "Let's personalize your fitness coaching";
  };

  return (
    <View style={styles.container}>
      {/* Hero Image with White Gradient Overlay */}
      <View style={styles.heroSection}>
        <Image
          source={require('../../assets/images/login-hero.png')}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(250,251,252,0.4)', 'rgba(250,251,252,0.85)', '#FAFBFC']}
          locations={[0, 0.4, 0.7, 1]}
          style={styles.heroGradient}
        />
        {/* Logo Badge */}
        <View style={styles.logoBadge}>
          <Ionicons name="fitness" size={22} color={Colors.white} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.formWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>{getSubtitle()}</Text>

          {/* Auth Mode Tabs */}
          <View style={styles.authTabs}>
            <TouchableOpacity
              style={[styles.authTab, authMode === 'phone' && styles.authTabActive]}
              onPress={() => switchMode('phone')}
            >
              <Ionicons name="call-outline" size={15} color={authMode === 'phone' ? Colors.accent : Colors.textTertiary} />
              <Text style={[styles.authTabText, authMode === 'phone' && styles.authTabTextActive]}>Phone</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.authTab, authMode === 'email' && styles.authTabActive]}
              onPress={() => switchMode('email')}
            >
              <Ionicons name="mail-outline" size={15} color={authMode === 'email' ? Colors.accent : Colors.textTertiary} />
              <Text style={[styles.authTabText, authMode === 'email' && styles.authTabTextActive]}>Email</Text>
            </TouchableOpacity>
          </View>

          {/* Messages */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          {/* ===== PHONE FLOW ===== */}
          {authMode === 'phone' && phoneStep === 'phone' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="call-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="(555) 123-4567"
                    placeholderTextColor={Colors.textTertiary}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                  />
                </View>
                <Text style={styles.inputHint}>We'll send you a verification code via SMS</Text>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                onPress={handleSendOtp}
                disabled={loading}
              >
                <Text style={styles.submitText}>{loading ? 'Sending...' : 'Send Verification Code'}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>
            </>
          )}

          {authMode === 'phone' && phoneStep === 'otp' && (
            <>
              {/* Change phone link */}
              <TouchableOpacity
                onPress={() => { setPhoneStep('phone'); setError(''); setSuccess(''); }}
                style={styles.changePhoneRow}
              >
                <Ionicons name="arrow-back" size={14} color={Colors.accentText} />
                <Text style={styles.changePhoneText}>Change number</Text>
              </TouchableOpacity>

              {/* Name for new users */}
              {isNewUser && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Your Name</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Coach Mike Johnson"
                      placeholderTextColor={Colors.textTertiary}
                      value={phoneName}
                      onChangeText={setPhoneName}
                      autoComplete="name"
                    />
                  </View>
                </View>
              )}

              {/* OTP Code */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Verification Code</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="keypad-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    placeholder="000000"
                    placeholderTextColor={Colors.textTertiary}
                    value={otpCode}
                    onChangeText={(t) => setOtpCode(t.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                onPress={handleVerifyOtp}
                disabled={loading}
              >
                <Text style={styles.submitText}>{loading ? 'Verifying...' : 'Verify & Sign In'}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSendOtp} style={styles.resendRow}>
                <Text style={styles.resendText}>Didn't receive it? <Text style={styles.resendLink}>Resend Code</Text></Text>
              </TouchableOpacity>
            </>
          )}

          {/* ===== EMAIL FLOW ===== */}
          {authMode === 'email' && (
            <>
              {/* Name (Sign Up only) */}
              {isSignUp && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Coach Mike Johnson"
                      placeholderTextColor={Colors.textTertiary}
                      value={emailName}
                      onChangeText={setEmailName}
                      autoComplete="name"
                    />
                  </View>
                </View>
              )}

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="coach@example.com"
                    placeholderTextColor={Colors.textTertiary}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.textTertiary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password (Sign Up only) */}
              {isSignUp && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm Password</Text>
                  <View style={[
                    styles.inputWrapper,
                    confirmPassword && password !== confirmPassword && styles.inputWrapperError,
                  ]}>
                    <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="••••••••"
                      placeholderTextColor={Colors.textTertiary}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                      <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                  {confirmPassword && password !== confirmPassword && (
                    <View style={styles.matchError}>
                      <Text style={styles.matchErrorEmoji}>⚠️</Text>
                      <Text style={styles.matchErrorText}>ERROR: Passwords Don't Match!</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                onPress={handleEmailSubmit}
                disabled={loading}
              >
                <Text style={styles.submitText}>{loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>

              {/* Toggle + Forgot */}
              <View style={styles.footerLinks}>
                <TouchableOpacity onPress={toggleSignUp}>
                  <Text style={styles.toggleText}>
                    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                    <Text style={styles.toggleLink}>{isSignUp ? 'Sign In.' : 'Sign Up.'}</Text>
                  </Text>
                </TouchableOpacity>
                {!isSignUp && (
                  <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
                    <Text style={styles.forgotText}>Forgot Password</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Social Icons (shown on phone & email sign in) */}
          {authMode === 'phone' && phoneStep === 'phone' && (
            <View style={styles.socialSection}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or continue with</Text>
                <View style={styles.dividerLine} />
              </View>
              <TouchableOpacity
                style={styles.emailSwitchBtn}
                onPress={() => switchMode('email')}
              >
                <Ionicons name="mail-outline" size={16} color={Colors.textPrimary} />
                <Text style={styles.emailSwitchText}>Continue with Email</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Client Login Link */}
          <TouchableOpacity onPress={() => router.push('/(auth)/client-login' as any)} style={{ marginTop: Spacing.xl, alignItems: 'center' }}>
            <Text style={styles.toggleText}>
              Are you a client? <Text style={styles.toggleLink}>Sign in here →</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },

  // Hero
  heroSection: {
    height: HERO_HEIGHT,
    width: '100%',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT,
  },
  logoBadge: {
    position: 'absolute',
    left: Spacing.xl,
    bottom: 50,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },

  // Form
  formWrapper: {
    flex: 1,
    marginTop: -30,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },

  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize['3xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },

  // Auth Tabs
  authTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.bgSecondary,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  authTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: Radius.md,
  },
  authTabActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  authTabText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
  authTabTextActive: {
    color: Colors.textPrimary,
    fontFamily: FontFamily.bodySemiBold,
  },

  // Messages
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.redSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorEmoji: { fontSize: 14 },
  errorText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.red,
    flex: 1,
  },
  successBox: {
    backgroundColor: Colors.greenSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.green,
    textAlign: 'center',
  },

  // Input
  inputGroup: {
    marginBottom: Spacing.base,
  },
  inputLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7F2',
    borderWidth: 1.5,
    borderColor: '#FDDCB5',
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
  },
  inputWrapperError: {
    borderColor: Colors.red,
    backgroundColor: Colors.redSoft,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: FontSize.base,
    fontFamily: FontFamily.body,
    color: Colors.textPrimary,
  },
  inputHint: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 4,
    marginLeft: 2,
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 4,
  },
  otpInput: {
    letterSpacing: 6,
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.xl,
  },
  matchError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  matchErrorEmoji: { fontSize: 12 },
  matchErrorText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.red,
  },

  // Phone OTP extras
  changePhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.lg,
  },
  changePhoneText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.accentText,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  resendText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  resendLink: {
    fontFamily: FontFamily.bodySemiBold,
    color: Colors.accentText,
    textDecorationLine: 'underline',
  },

  // Submit
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.textPrimary,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    marginTop: Spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.md,
    color: Colors.white,
  },

  // Social / Alt auth
  socialSection: {
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
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  emailSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 14,
  },
  emailSwitchText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },

  // Footer
  footerLinks: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  toggleText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  toggleLink: {
    fontFamily: FontFamily.bodySemiBold,
    color: Colors.accentText,
    textDecorationLine: 'underline',
  },
  forgotBtn: {
    marginTop: 2,
  },
  forgotText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.accentText,
    textDecorationLine: 'underline',
  },
});
