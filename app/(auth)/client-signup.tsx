import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Dimensions, StatusBar, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import { Spacing, FontFamily } from '../../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type FlowStep = 'lookup' | 'create_password' | 'new_signup' | 'pick_trainer';

export default function ClientSignupScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [flowStep, setFlowStep] = useState<FlowStep>('lookup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [foundClient, setFoundClient] = useState<any>(null);
  const [foundTrainerName, setFoundTrainerName] = useState('');

  const [trainers, setTrainers] = useState<any[]>([]);
  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null);
  const [loadingTrainers, setLoadingTrainers] = useState(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const isEmail = (val: string) => val.includes('@');
  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (raw.startsWith('+')) return raw;
    return `+${digits}`;
  };

  // --- Step 1: Lookup ---
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
          setSuccess('You already have an account! Redirecting to sign in...');
          setTimeout(() => router.push('/(auth)/client-login'), 1500);
        } else {
          setFoundClient({ name: data.client_name });
          setFoundTrainerName(data.trainer_name || 'your trainer');
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
  }, [contact]);

  // --- Existing client: create password ---
  const handleCreatePassword = async () => {
    setError('');
    if (!password.trim()) return setError('Create a password');
    if (password.length < 6) return setError('Password must be 6+ characters');
    if (password !== confirmPassword) return setError("Passwords don't match");

    setLoading(true);
    try {
      const contactEmail = isEmail(contact.trim()) ? contact.trim().toLowerCase() : `${formatPhone(contact.trim()).replace('+', '')}@fitlink.phone`;

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

      setSuccess("You're in! Redirecting...");
    } catch (err: any) {
      console.error('[ClientSignup] Error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // --- New client: full signup ---
  const handleNewSignup = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name');
    if (!contact.trim()) return setError('Enter your email');
    if (password.length < 6) return setError('Password must be 6+ characters');
    if (password !== confirmPassword) return setError("Passwords don't match");

    setLoading(true);
    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: contact.trim().toLowerCase(),
        password,
        options: { data: { name: name.trim(), role: 'client' } },
      });
      if (signUpErr) throw signUpErr;

      setLoadingTrainers(true);
      const { data: trainerList } = await supabase
        .from('trainers')
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

  // --- Pick trainer ---
  const handlePickTrainer = async (trainerId: string) => {
    setSelectedTrainer(trainerId);
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
      if (!result?.success) throw new Error(result?.reason || 'Failed to create client');

      setSuccess('Connected! Redirecting...');
    } catch (err: any) {
      setError(err.message || 'Failed to connect to trainer');
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (flowStep) {
      case 'lookup': return 'Get started';
      case 'create_password': return 'Almost there';
      case 'new_signup': return 'Create your\naccount';
      case 'pick_trainer': return 'Pick your\ncoach';
    }
  };

  const getSubtitle = () => {
    switch (flowStep) {
      case 'lookup': return "Enter your email or phone and we'll check if your coach already set you up.";
      case 'create_password': return '';
      case 'new_signup': return 'Fill in your details to join FitLink as a client.';
      case 'pick_trainer': return 'Choose a coach to train with.';
    }
  };

  // Step numbers for indicator
  const stepNum = flowStep === 'lookup' ? 1 : flowStep === 'create_password' || flowStep === 'new_signup' ? 2 : 3;

  const goBack = () => {
    if (flowStep === 'lookup') {
      router.back();
    } else if (flowStep === 'pick_trainer') {
      setFlowStep('new_signup');
    } else {
      setFlowStep('lookup');
      setPassword(''); setConfirmPassword(''); setError(''); setSuccess('');
    }
  };

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
              <TouchableOpacity style={styles.backButton} onPress={goBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.headerLogo}>FITLINK</Text>
            </View>

            {/* Step indicator */}
            <View style={styles.stepRow}>
              <View style={[styles.stepDot, stepNum >= 1 && styles.stepDotActive]} />
              <View style={[styles.stepLine, stepNum >= 2 && styles.stepLineActive]} />
              <View style={[styles.stepDot, stepNum >= 2 && styles.stepDotActive]} />
              <View style={[styles.stepLine, stepNum >= 3 && styles.stepLineActive]} />
              <View style={[styles.stepDot, stepNum >= 3 && styles.stepDotActive]} />
            </View>

            <View style={styles.stepLabels}>
              <Text style={[styles.stepLabel, stepNum >= 1 && styles.stepLabelActive]}>Verify</Text>
              <Text style={[styles.stepLabel, stepNum >= 2 && styles.stepLabelActive]}>Account</Text>
              <Text style={[styles.stepLabel, stepNum >= 3 && styles.stepLabelActive]}>Coach</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>{getTitle()}</Text>
            {getSubtitle() ? <Text style={styles.subtitle}>{getSubtitle()}</Text> : null}

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

            {/* ===== STEP 1: Lookup ===== */}
            {flowStep === 'lookup' && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email or phone</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="email@example.com or (555) 000-0000"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={contact}
                    onChangeText={setContact}
                    autoCapitalize="none"
                    autoFocus
                    accessibilityLabel="Email or phone number"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <View style={styles.inputLine} />
                  <Text style={styles.inputHint}>Your coach may have already added you</Text>
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleLookup}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                >
                  <Text style={styles.submitText}>{loading ? 'Checking...' : 'Continue'}</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ===== STEP 2a: Existing client — create password ===== */}
            {flowStep === 'create_password' && (
              <>
                <View style={styles.statusBanner}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannerTitle}>Welcome, {foundClient?.name}!</Text>
                    <Text style={styles.bannerSub}>Coach {foundTrainerName} has everything ready. Just create a password.</Text>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Create password</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="6+ characters"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoFocus
                      accessibilityLabel="Create password"
                      selectionColor="rgba(255,255,255,0.5)"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inputLine} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    accessibilityLabel="Confirm password"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <View style={[styles.inputLine, confirmPassword && password !== confirmPassword && styles.inputLineError]} />
                  {confirmPassword && password !== confirmPassword && (
                    <Text style={styles.fieldError}>Passwords don't match</Text>
                  )}
                </View>

                <Text style={styles.termsText}>
                  By creating an account, you agree to our{' '}
                  <Text style={styles.termsLink}>Terms and Conditions</Text> and consent to our{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>.
                </Text>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleCreatePassword}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={loading ? 'Setting up' : "Let's go"}
                >
                  <Text style={styles.submitText}>{loading ? 'Setting up...' : "Let's go"}</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ===== STEP 2b: New client — full signup ===== */}
            {flowStep === 'new_signup' && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Full name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Your full name"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={name}
                    onChangeText={setName}
                    accessibilityLabel="Full name"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <View style={styles.inputLine} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="email@example.com"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={contact}
                    onChangeText={setContact}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    accessibilityLabel="Email"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <View style={styles.inputLine} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Create password</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="6+ characters"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      accessibilityLabel="Create password"
                      selectionColor="rgba(255,255,255,0.5)"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inputLine} />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    accessibilityLabel="Confirm password"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <View style={[styles.inputLine, confirmPassword && password !== confirmPassword && styles.inputLineError]} />
                  {confirmPassword && password !== confirmPassword && (
                    <Text style={styles.fieldError}>Passwords don't match</Text>
                  )}
                </View>

                <Text style={styles.termsText}>
                  By creating an account, you agree to our{' '}
                  <Text style={styles.termsLink}>Terms and Conditions</Text> and consent to our{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>.
                </Text>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleNewSignup}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={loading ? 'Creating' : 'Continue'}
                >
                  <Text style={styles.submitText}>{loading ? 'Creating...' : 'Continue'}</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ===== STEP 3: Pick trainer ===== */}
            {flowStep === 'pick_trainer' && (
              <>
                {loadingTrainers ? (
                  <ActivityIndicator size="large" color="rgba(255,255,255,0.6)" style={{ marginTop: Spacing['2xl'] }} />
                ) : trainers.length === 0 ? (
                  <View style={styles.emptySection}>
                    <Ionicons name="people-outline" size={40} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.emptyText}>No coaches available yet</Text>
                  </View>
                ) : (
                  trainers.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      activeOpacity={0.7}
                      onPress={() => handlePickTrainer(t.id)}
                      disabled={loading}
                      style={styles.trainerCard}
                      accessibilityRole="button"
                      accessibilityLabel={`Select coach ${t.name}`}
                    >
                      <View style={styles.trainerRow}>
                        <Avatar name={t.name} size="md" imageUrl={t.avatar_url} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.trainerName}>{t.name}</Text>
                          {t.specialization && <Text style={styles.trainerSpec}>{t.specialization}</Text>}
                        </View>
                        <View style={styles.selectBadge}>
                          <Text style={styles.selectText}>Select</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}

            {/* Footer */}
            <TouchableOpacity
              onPress={() => router.push('/(auth)/client-login')}
              style={styles.footerRow}
              accessibilityRole="button"
              accessibilityLabel="Go to client sign in"
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

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SCREEN_HEIGHT * 0.06, paddingBottom: Spacing.md },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerLogo: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: 'rgba(255,255,255,0.6)', letterSpacing: 4 },

  // Step indicator
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, alignSelf: 'flex-start' },
  stepDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'transparent' },
  stepDotActive: { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
  stepLine: { width: 40, height: 1.5, backgroundColor: 'rgba(255,255,255,0.15)' },
  stepLineActive: { backgroundColor: '#4CAF50' },
  stepLabels: { flexDirection: 'row', alignSelf: 'flex-start', gap: 30, marginBottom: Spacing.xl, marginLeft: -4 },
  stepLabel: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  stepLabelActive: { color: 'rgba(255,255,255,0.7)' },

  title: { fontFamily: FontFamily.headingExtraBold, fontSize: 34, color: '#FFFFFF', lineHeight: 40, marginBottom: Spacing.sm },
  subtitle: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 20, marginBottom: Spacing.xl },

  messageBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, marginBottom: Spacing.lg },
  errorText: { fontFamily: FontFamily.body, fontSize: 13, color: '#FF6B6B', flex: 1 },
  successText: { fontFamily: FontFamily.body, fontSize: 13, color: '#4CAF50', flex: 1 },

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

  statusBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 16, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  bannerTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, color: '#FFFFFF' },
  bannerSub: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 18 },

  termsText: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 18, marginBottom: Spacing.xl },
  termsLink: { textDecorationLine: 'underline', color: 'rgba(255,255,255,0.6)' },

  submitBtn: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 4, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, color: '#FFFFFF', letterSpacing: 0.5 },

  trainerCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  trainerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trainerName: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, color: '#FFFFFF' },
  trainerSpec: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  selectBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  selectText: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: '#FFFFFF' },

  emptySection: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyText: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.4)' },

  footerRow: { alignItems: 'center', marginTop: Spacing['2xl'], paddingBottom: Spacing.xl },
  footerText: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  footerLink: { fontFamily: FontFamily.bodySemiBold, color: '#FFFFFF', textDecorationLine: 'underline' },
});
