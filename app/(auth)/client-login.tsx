import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Dimensions, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import { Spacing, FontFamily } from '../../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type LookupStatus = 'idle' | 'checking' | 'found' | 'not_found';
type FlowStep = 'enter_info' | 'create_password' | 'pick_trainer';

export default function ClientLoginScreen() {
  const router = useRouter();
  const { signUpAsClient, signIn } = useAuth();

  const [flowStep, setFlowStep] = useState<FlowStep>('enter_info');
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>('idle');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [foundClient, setFoundClient] = useState<any>(null);
  const [foundTrainerName, setFoundTrainerName] = useState('');

  const [trainers, setTrainers] = useState<any[]>([]);
  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null);
  const [loadingTrainers, setLoadingTrainers] = useState(false);

  const [isSignIn, setIsSignIn] = useState(false);

  const isEmail = (val: string) => val.includes('@');
  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (raw.startsWith('+')) return raw;
    return `+${digits}`;
  };

  // --- Lookup client by email or phone ---
  const handleLookup = useCallback(async () => {
    const trimmed = contact.trim();
    const isEmailInput = isEmail(trimmed);
    const lookupVal = isEmailInput ? trimmed.toLowerCase() : formatPhone(trimmed);

    if (!trimmed || (isEmailInput && !trimmed.includes('@')) || (!isEmailInput && trimmed.replace(/\D/g, '').length < 10)) {
      return setError('Enter a valid email or phone number');
    }

    setError(''); setSuccess('');
    setLookupStatus('checking');

    try {
      const { data, error: rpcErr } = await supabase.rpc('lookup_client_by_contact', {
        contact_value: lookupVal,
      });

      if (__DEV__) console.log('[ClientLogin] RPC result:', JSON.stringify({ lookupVal, data, rpcErr }));
      if (rpcErr) throw rpcErr;

      if (data?.found) {
        if (data.has_account) {
          setLookupStatus('not_found');
          setIsSignIn(true);
          setSuccess('You already have an account! Sign in below.');
        } else {
          setFoundClient({ name: data.client_name });
          setFoundTrainerName(data.trainer_name || 'your trainer');
          setName(data.client_name || '');
          setLookupStatus('found');
          setFlowStep('create_password');
        }
      } else {
        setLookupStatus('not_found');
        setFlowStep('enter_info');
      }
    } catch (err) {
      console.error('[ClientLogin] Lookup error:', err);
      setLookupStatus('not_found');
      setError('Something went wrong. Try again.');
    }
  }, [contact]);

  // --- Existing client: create password & sign in ---
  const handleCreatePassword = async () => {
    setError('');
    if (!password.trim()) return setError('Create a password');
    if (password.length < 6) return setError('Password must be 6+ characters');
    if (password !== confirmPassword) return setError("Passwords don't match");

    setLoading(true);
    try {
      const contactEmail = isEmail(contact.trim()) ? contact.trim().toLowerCase() : `${formatPhone(contact.trim()).replace('+', '')}@fitlink.phone`;

      if (__DEV__) console.log('[ClientLogin] Step 1: Signing up with', contactEmail);

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: contactEmail,
        password,
        options: { data: { name: name || 'Client', role: 'client' } },
      });
      if (signUpErr) throw signUpErr;
      if (__DEV__) console.log('[ClientLogin] Step 2: SignUp success, userId:', signUpData.user?.id);

      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: contactEmail,
        password,
      });
      if (signInErr) throw signInErr;
      if (__DEV__) console.log('[ClientLogin] Step 3: SignIn success');

      const userId = signInData.user?.id;
      if (userId) {
        const { data: linkResult, error: linkErr } = await supabase.rpc('link_client_to_auth_user', {
          p_email: contactEmail,
          p_phone: !isEmail(contact.trim()) ? formatPhone(contact.trim()) : null,
        });
        if (__DEV__) console.log('[ClientLogin] Step 4: Link result:', JSON.stringify({ linkResult, linkErr }));
      }

      setSuccess("You're in! Redirecting...");
    } catch (err: any) {
      console.error('[ClientLogin] Error:', err);
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

      if (!selectedTrainer) {
        setLoadingTrainers(true);
        const { data: trainerList } = await supabase
          .from('trainers')
          .select('id, name, specialization, avatar_url')
          .order('name');
        setTrainers(trainerList || []);
        setLoadingTrainers(false);
        setFlowStep('pick_trainer');
        setLoading(false);
        return;
      }

      await createClientRow(data.user!.id, selectedTrainer);
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // --- Pick trainer & create client row ---
  const handlePickTrainer = async (trainerId: string) => {
    setSelectedTrainer(trainerId);
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await createClientRow(user.id, trainerId);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to trainer');
      setLoading(false);
    }
  };

  const createClientRow = async (userId: string, trainerId: string) => {
    const { data: result, error: rpcErr } = await supabase.rpc('create_client_and_notify', {
      p_name: name.trim(),
      p_email: contact.trim().toLowerCase(),
      p_trainer_id: trainerId,
      p_phone: !isEmail(contact.trim()) ? formatPhone(contact.trim()) : null,
    });

    if (__DEV__) console.log('[ClientLogin] Create client RPC:', JSON.stringify({ result, rpcErr }));

    if (rpcErr) throw rpcErr;
    if (!result?.success) throw new Error(result?.reason || 'Failed to create client');

    setSuccess('Connected! Redirecting...');
  };

  // --- Existing user sign in ---
  const handleSignIn = async () => {
    setError('');
    if (!contact.trim() || !password.trim()) return setError('Fill in all fields');
    setLoading(true);
    try {
      await signIn(contact.trim().toLowerCase(), password);
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message || 'Invalid credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmed = contact.trim().toLowerCase();
    if (!trimmed || !isEmail(trimmed)) return setError('Enter your email address first');
    setLoading(true);
    setError('');
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(trimmed);
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

  const getTitle = () => {
    if (flowStep === 'create_password') return 'Almost there';
    if (flowStep === 'pick_trainer') return 'Pick your coach';
    if (isSignIn) return 'Welcome back';
    return 'Get started';
  };

  const getSubtitle = () => {
    if (flowStep === 'create_password') return '';
    if (flowStep === 'pick_trainer') return 'Choose a trainer to start your fitness journey with.';
    if (isSignIn) return 'Sign in to your client account.';
    return "Enter your email or phone and we'll check if your trainer already set you up.";
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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => flowStep === 'enter_info' ? router.back() : setFlowStep('enter_info')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={flowStep === 'enter_info' ? 'Go back' : 'Back'}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerLogo}>FITLINK</Text>
          </View>

          {/* Title + Subtitle */}
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

          {/* ============ STEP 1: Enter email to check ============ */}
          {flowStep === 'enter_info' && !isSignIn && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email or phone</Text>
                <TextInput
                  style={styles.input}
                  placeholder="email@example.com or (555) 000-0000"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={contact}
                  onChangeText={(t) => { setContact(t); setLookupStatus('idle'); }}
                  autoCapitalize="none"
                  autoFocus
                  accessibilityLabel="Email or phone number"
                  selectionColor="rgba(255,255,255,0.5)"
                />
                <View style={styles.inputLine} />
              </View>

              {/* Found banner */}
              {lookupStatus === 'found' && (
                <View style={styles.statusBanner}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannerTitle}>Welcome, {foundClient?.name}!</Text>
                    <Text style={styles.bannerSub}>Your trainer {foundTrainerName} already added you. Just create a password below.</Text>
                  </View>
                </View>
              )}

              {lookupStatus === 'not_found' && contact.trim().length > 3 && (
                <>
                  <View style={styles.statusBanner}>
                    <Ionicons name="person-add" size={20} color="rgba(255,255,255,0.6)" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerTitle}>New here? No problem!</Text>
                      <Text style={styles.bannerSub}>Fill out your info below and pick your trainer.</Text>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Your name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Your full name"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={name}
                      onChangeText={setName}
                      accessibilityLabel="Your full name"
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

                  <TouchableOpacity
                    style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                    onPress={handleNewSignup}
                    disabled={loading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={loading ? 'Creating account' : 'Sign up and pick trainer'}
                  >
                    <Text style={styles.submitText}>{loading ? 'Creating...' : 'Sign up & pick trainer'}</Text>
                  </TouchableOpacity>
                </>
              )}

              {lookupStatus === 'idle' && (
                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleLookup}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                >
                  <Text style={styles.submitText}>Continue</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => setIsSignIn(true)} style={styles.toggleRow} accessibilityRole="button" accessibilityLabel="Switch to sign in">
                <Text style={styles.toggleText}>Already have an account? <Text style={styles.toggleLink}>Sign in</Text></Text>
              </TouchableOpacity>
            </>
          )}

          {/* ============ Sign In Mode ============ */}
          {flowStep === 'enter_info' && isSignIn && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="email@example.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={contact}
                  onChangeText={setContact}
                  autoCapitalize="none"
                  accessibilityLabel="Email"
                  selectionColor="rgba(255,255,255,0.5)"
                />
                <View style={styles.inputLine} />
              </View>

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
                    accessibilityLabel="Password"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                </View>
                <View style={styles.inputLine} />
              </View>

              <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotRow} accessibilityRole="button" accessibilityLabel="Forgot password">
                <Text style={styles.forgotText}>Forgot password</Text>
              </TouchableOpacity>

              <Text style={styles.termsText}>
                By clicking "Sign in", you agree to our{' '}
                <Text style={styles.termsLink}>Terms and Conditions</Text> and consent to our{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>.
              </Text>

              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                onPress={handleSignIn}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={loading ? 'Signing in' : 'Sign in'}
              >
                <Text style={styles.submitText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsSignIn(false)} style={styles.toggleRow} accessibilityRole="button" accessibilityLabel="Switch to sign up">
                <Text style={styles.toggleText}>Don't have an account? <Text style={styles.toggleLink}>Sign up</Text></Text>
              </TouchableOpacity>
            </>
          )}

          {/* ============ STEP 2: Existing client — create password ============ */}
          {flowStep === 'create_password' && (
            <>
              <View style={styles.statusBanner}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTitle}>Welcome, {foundClient?.name}!</Text>
                  <Text style={styles.bannerSub}>Coach {foundTrainerName} has everything ready for you. Just create a password to get started.</Text>
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

              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                onPress={handleCreatePassword}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={loading ? 'Setting up account' : 'Create account and continue'}
              >
                <Text style={styles.submitText}>{loading ? 'Setting up...' : "Let's go"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setFlowStep('enter_info'); setPassword(''); setConfirmPassword(''); setError(''); }}
                style={styles.toggleRow}
                accessibilityRole="button"
                accessibilityLabel="Change email address"
              >
                <Text style={styles.changeText}>← Change email</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ============ STEP 3: Pick a trainer ============ */}
          {flowStep === 'pick_trainer' && (
            <>
              {loadingTrainers ? (
                <ActivityIndicator size="large" color="rgba(255,255,255,0.6)" style={{ marginTop: Spacing['2xl'] }} />
              ) : trainers.length === 0 ? (
                <View style={styles.emptySection}>
                  <Ionicons name="people-outline" size={40} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>No trainers available yet</Text>
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
                    accessibilityLabel={`Select trainer ${t.name}`}
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

          {/* Coach Login Link */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login' as any)}
            style={styles.coachRow}
            accessibilityRole="button"
            accessibilityLabel="Go to coach login"
          >
            <Text style={styles.coachText}>
              Are you a coach? <Text style={styles.coachLink}>Sign in here →</Text>
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
    backgroundColor: '#000000',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 20,
    marginBottom: Spacing.xl,
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

  // Status banners
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.15)',
  },
  bannerTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  bannerSub: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    lineHeight: 18,
  },

  // Forgot
  forgotRow: {
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
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
  changeText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },

  // Trainer picker
  trainerCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  trainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trainerName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  trainerSpec: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  selectBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  selectText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFFFFF',
  },

  // Empty
  emptySection: {
    alignItems: 'center',
    paddingVertical: Spacing['4xl'],
    gap: Spacing.md,
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },

  // Coach link
  coachRow: {
    marginTop: Spacing['2xl'],
    alignItems: 'center',
    paddingBottom: Spacing.xl,
  },
  coachText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  coachLink: {
    fontFamily: FontFamily.bodySemiBold,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
});
