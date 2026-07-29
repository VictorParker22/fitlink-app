import { useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Platform, Share, Alert, ActivityIndicator,
  Dimensions, Animated, Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GOAL_SUGGESTIONS = ['Lose weight', 'Build muscle', 'Improve strength', 'General fitness', 'Flexibility', 'Sports performance'];
const STATUS_OPTIONS = [
  { key: 'trial' as const, label: 'Trial', icon: 'time-outline' as const, desc: '14-day free trial' },
  { key: 'active' as const, label: 'Active', icon: 'checkmark-circle' as const, desc: 'Paying client' },
];

export default function AddClientScreen() {
  const router = useRouter();
  const { updateClient, plans, refreshClients, trainer, clients } = useApp();
  const { colors } = useTheme();
  const { showAlert } = useAlert();

  // Wizard state
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Identity
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

  // Step 2 — Plan enrollment
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [clientStatus, setClientStatus] = useState<'trial' | 'active'>('trial');

  // Step 3 — Goals & notes
  const [goals, setGoals] = useState('');
  const [notes, setNotes] = useState('');

  // Find existing
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResults, setFindResults] = useState<any[]>([]);
  const [findLoading, setFindLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const selectedPlanData = plans.find(p => p.id === selectedPlan);
  const progressPct = step / 3;

  // ── Contact Import ──
  const handleImportContact = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Contact access is needed to import client info.');
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });
      if (data.length === 0) {
        showAlert({ type: 'info', title: 'No Contacts', message: 'No contacts found on this device.' });
        return;
      }
      // Show a simple picker — take first matching or let system handle
      // For now use the first contact with a name
      const validContacts = data.filter(c => c.name).slice(0, 20);
      if (validContacts.length === 0) return;

      // Use Alert to let user pick (simple approach)
      const buttons = validContacts.slice(0, 5).map(c => ({
        text: c.name || 'Unknown',
        onPress: () => {
          setName(c.name || '');
          if (c.emails && c.emails.length > 0) setEmail(c.emails[0].email || '');
          if (c.phoneNumbers && c.phoneNumbers.length > 0) setPhone(c.phoneNumbers[0].number || '');
        },
      }));
      buttons.push({ text: 'Cancel', onPress: () => {} });
      Alert.alert('Select Contact', 'Choose a contact to import', buttons);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to access contacts' });
    }
  };

  // ── Avatar ──
  const handlePickAvatar = async () => {
    Alert.alert('Client Photo', 'Choose how to add a photo', [
      { text: 'Take Photo', onPress: () => launchPicker('camera') },
      { text: 'Choose from Library', onPress: () => launchPicker('library') },
      ...(avatarUri ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => { setAvatarUri(null); setAvatarBase64(null); } }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Camera access is needed.'); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Photo library access is needed.'); return; }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.7, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.7, base64: true });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Error', 'Could not read image data.'); return; }
    setAvatarUri(asset.uri);
    setAvatarBase64(asset.base64);
  };

  const uploadClientAvatar = async (clientId: string): Promise<string | undefined> => {
    if (!avatarBase64 || !avatarUri) return undefined;
    try {
      const fileExt = avatarUri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `clients/${clientId}/avatar.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
      const binaryStr = atob(avatarBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, bytes.buffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      return `${urlData.publicUrl}?t=${Date.now()}`;
    } catch (err: any) {
      console.error('Client avatar upload failed:', err);
      return undefined;
    }
  };

  // ── Save ──
  const handleSave = async () => {
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Name Required', message: 'Please enter a client name.' });
    if (saving) return; // Prevent double-tap

    // Duplicate check by email
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail) {
      const emailDup = clients.find(c => c.email?.toLowerCase() === trimmedEmail);
      if (emailDup) {
        return showAlert({ type: 'warning', title: 'Client Already Exists', message: `A client with this email (${emailDup.name}) is already in your list.` });
      }
    }

    setSaving(true);
    Keyboard.dismiss();
    try {
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 2. Insert directly — do NOT call addClient (it triggers setClients which re-renders everything)
      const insertPayload: any = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        plan_id: selectedPlan || null,
        status: clientStatus,
        trainer_id: user.id,
      };
      if (goals.trim() || notes.trim()) {
        insertPayload.assessment_data = {
          ...(goals.trim() ? { fitness_goals: goals.split(',').map(g => g.trim()).filter(Boolean) } : {}),
          ...(notes.trim() ? { coach_notes: notes.trim() } : {}),
        };
      }

      const { data: newClient, error } = await supabase
        .from('clients')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;

      // 3. Avatar upload in background
      if (avatarBase64 && avatarUri && newClient) {
        uploadClientAvatar(newClient.id).then(avatarUrl => {
          if (avatarUrl) updateClient(newClient.id, { avatar_url: avatarUrl } as any);
        }).catch(() => {});
      }

      // 4. Navigate back IMMEDIATELY — before any state updates
      showAlert({ type: 'success', title: 'Client Added!', message: `${name.trim()} has been enrolled.` });
      router.back();

      // 5. Update state AFTER navigation (screen is unmounted, no double re-render)
      setTimeout(() => {
        refreshClients();
      }, 600);

    } catch (err: any) {
      console.error('[AddClient] Save failed:', err);
      showAlert({ type: 'error', title: 'Failed to Add', message: err.message || 'Something went wrong. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Invite ──
  const handleInvite = async () => {
    const coachName = trainer?.name || 'your coach';
    const clientFirst = name.trim().split(' ')[0] || 'there';
    try {
      await Share.share({
        message: `Hey ${clientFirst}! ${coachName} has invited you to join FitLink to track your workouts and schedule sessions. Download here: https://fitlink.coach`,
        title: 'Join me on FitLink',
      });
    } catch (err) {}
  };

  // ── Find existing ──
  const handleFindUser = async () => {
    const q = findQuery.trim();
    if (!q) return;
    setFindLoading(true);
    setFindResults([]);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('search-unassigned-clients', {
        body: { query: q, trainerId: user?.id }
      });
      if (error) throw new Error(error.message || 'Search failed');
      setFindResults(data?.data || []);
      if ((data?.data || []).length === 0) {
        showAlert({ type: 'info', title: 'No Results', message: 'No users found. Try a different name or email.' });
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Search Error', message: err.message || 'Failed to search' });
    } finally {
      setFindLoading(false);
    }
  };

  const handleLinkClient = async (client: any) => {
    setLinking(client.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (client.authUserId) {
        // Auth user found on FitLink — create client record WITH auth_user_id + assessment
        const { error } = await supabase
          .from('clients')
          .insert({
            name: client.name || 'Client',
            email: client.email || null,
            phone: client.phone || null,
            status: 'active',
            trainer_id: user.id,
            auth_user_id: client.authUserId,
            assessment_data: client.assessment_data || null,
          });
        if (error) throw error;
      } else {
        // Existing client record — claim via edge function (bypasses RLS)
        const { error } = await supabase.functions.invoke('search-unassigned-clients', {
          body: { action: 'link', clientId: client.id, trainerId: user.id }
        });
        if (error) {
          const { error: updateErr } = await supabase
            .from('clients')
            .update({ trainer_id: user.id })
            .eq('id', client.id);
          if (updateErr) throw updateErr;
        }
      }

      // Navigate back FIRST
      showAlert({ type: 'success', title: 'Client Added!', message: `${client.name} is now your client.` });
      setLinking(null);
      router.back();

      // Refresh state AFTER navigation
      setTimeout(() => { refreshClients(); }, 600);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Link Error', message: err.message || 'Failed to link client' });
      setLinking(null);
    }
  };

  // ── Navigation ──
  const goNext = () => {
    if (step === 1 && !name.trim()) {
      return showAlert({ type: 'warning', title: 'Name Required', message: 'Enter a client name to continue.' });
    }
    if (step < 3) setStep(step + 1);
    else handleSave();
  };

  const goBack = () => {
    if (showFind) { setShowFind(false); return; }
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const initials = (name || 'FL').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // ═══════════ RENDER ═══════════
  return (
    <View style={st.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity onPress={goBack} style={st.headerBack}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle}>
              {step === 1 ? "Who's joining?" : step === 2 ? 'Enroll in a plan' : 'Final touches'}
            </Text>
            <Text style={st.headerSubtitle}>Step {step} of 3</Text>
          </View>
          {step > 1 && (
            <TouchableOpacity onPress={goNext} style={st.headerSkip}>
              <Text style={st.headerSkipText}>{step === 3 ? '' : 'Skip'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Progress Bar */}
        <View style={st.progressTrack}>
          <Animated.View style={[st.progressFill, { width: `${progressPct * 100}%` }]} />
        </View>

        <View style={{ flex: 1 }}>
          {/* ═══ STEP 1: Identity ═══ */}
          {step === 1 && !showFind && (
            <KeyboardAwareScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" extraScrollHeight={80} enableOnAndroid>
              {/* Quick Add Methods */}
              <Text style={st.sectionLabel}>QUICK ADD</Text>
              <View style={st.quickAddRow}>
                <TouchableOpacity style={st.quickAddCard} onPress={handleImportContact} activeOpacity={0.7}>
                  <View style={[st.quickAddIcon, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
                    <Ionicons name="people" size={22} color="#7DAAFF" />
                  </View>
                  <Text style={st.quickAddTitle}>Contacts</Text>
                  <Text style={st.quickAddDesc}>Import from phone</Text>
                </TouchableOpacity>

                <TouchableOpacity style={st.quickAddCard} onPress={() => setShowFind(true)} activeOpacity={0.7}>
                  <View style={[st.quickAddIcon, { backgroundColor: 'rgba(255,107,53,0.12)' }]}>
                    <Ionicons name="search" size={22} color="#FF8255" />
                  </View>
                  <Text style={st.quickAddTitle}>Find User</Text>
                  <Text style={st.quickAddDesc}>Already on FitLink</Text>
                </TouchableOpacity>
              </View>

              {/* Avatar + Name */}
              <Text style={st.sectionLabel}>CLIENT DETAILS</Text>
              <View style={st.identityCard}>
                <TouchableOpacity style={st.avatarPicker} onPress={handlePickAvatar} activeOpacity={0.8}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={st.avatarImage} contentFit="cover" />
                  ) : (
                    <View style={st.avatarPlaceholder}>
                      {name ? (
                        <Text style={st.avatarInitials}>{initials}</Text>
                      ) : (
                        <Ionicons name="person" size={28} color="rgba(255,255,255,0.2)" />
                      )}
                    </View>
                  )}
                  <View style={st.avatarBadge}>
                    <Ionicons name="camera" size={12} color="#FFF" />
                  </View>
                </TouchableOpacity>

                <View style={{ flex: 1, gap: 10 }}>
                  <View style={st.inputWrap}>
                    <Ionicons name="person-outline" size={16} color="rgba(255,255,255,0.2)" />
                    <TextInput
                      style={st.input}
                      placeholder="Full name"
                      placeholderTextColor="rgba(255,255,255,0.15)"
                      value={name}
                      onChangeText={setName}
                      autoFocus
                    />
                  </View>
                </View>
              </View>

              {/* Contact fields */}
              <View style={st.contactRow}>
                <View style={[st.inputWrap, { flex: 1 }]}>
                  <Ionicons name="mail-outline" size={16} color="rgba(255,255,255,0.2)" />
                  <TextInput
                    style={st.input}
                    placeholder="Email"
                    placeholderTextColor="rgba(255,255,255,0.15)"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <View style={st.contactRow}>
                <View style={[st.inputWrap, { flex: 1 }]}>
                  <Ionicons name="call-outline" size={16} color="rgba(255,255,255,0.2)" />
                  <TextInput
                    style={st.input}
                    placeholder="Phone"
                    placeholderTextColor="rgba(255,255,255,0.15)"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            </KeyboardAwareScrollView>
          )}

          {/* ═══ FIND EXISTING (overlay on step 1) ═══ */}
          {step === 1 && showFind && (
            <KeyboardAwareScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" extraScrollHeight={80} enableOnAndroid>
              <Text style={st.findTitle}>Find on FitLink</Text>
              <Text style={st.findDesc}>Search for someone already on the app.</Text>

              <View style={st.inputWrap}>
                <Ionicons name="search" size={16} color="rgba(255,255,255,0.2)" />
                <TextInput
                  style={st.input}
                  placeholder="Name, email, or phone..."
                  placeholderTextColor="rgba(255,255,255,0.15)"
                  value={findQuery}
                  onChangeText={setFindQuery}
                  onSubmitEditing={handleFindUser}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoFocus
                />
                {findQuery !== '' && (
                  <TouchableOpacity onPress={() => { setFindQuery(''); setFindResults([]); }}>
                    <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.2)" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[st.searchBtn, (!findQuery.trim() || findLoading) && { opacity: 0.4 }]}
                onPress={handleFindUser}
                disabled={!findQuery.trim() || findLoading}
              >
                {findLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <><Ionicons name="search" size={16} color="#000" /><Text style={st.searchBtnText}>Search</Text></>
                )}
              </TouchableOpacity>

              {findResults.length > 0 && (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <Text style={st.sectionLabel}>{findResults.length} USER{findResults.length !== 1 ? 'S' : ''} FOUND</Text>
                  {findResults.map(client => (
                    <View key={client.id} style={st.findResultCard}>
                      <View style={st.findResultInitials}>
                        {client.avatar_url ? (
                          <Image source={{ uri: client.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                        ) : (
                          <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                            {(client.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.findResultName}>{client.name}</Text>
                        <Text style={st.findResultContact}>{client.email || client.phone || 'No contact'}</Text>
                      </View>
                      <TouchableOpacity
                        style={[st.linkBtn, linking === client.id && { opacity: 0.5 }]}
                        onPress={() => handleLinkClient(client)}
                        disabled={linking === client.id}
                      >
                        {linking === client.id ? (
                          <ActivityIndicator size="small" color="#000" />
                        ) : (
                          <Text style={st.linkBtnText}>Add</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </KeyboardAwareScrollView>
          )}

          {/* ═══ STEP 2: Plan Enrollment ═══ */}
          {step === 2 && (
            <KeyboardAwareScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false} extraScrollHeight={80} enableOnAndroid>
              {/* Status selector */}
              <Text style={st.sectionLabel}>CLIENT STATUS</Text>
              <View style={st.statusRow}>
                {STATUS_OPTIONS.map(opt => {
                  const isActive = clientStatus === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[st.statusChip, isActive && st.statusChipActive]}
                      onPress={() => setClientStatus(opt.key)}
                    >
                      <Ionicons name={opt.icon} size={16} color={isActive ? '#FFF' : 'rgba(255,255,255,0.3)'} />
                      <View>
                        <Text style={[st.statusLabel, isActive && { color: '#FFF' }]}>{opt.label}</Text>
                        <Text style={st.statusDesc}>{opt.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Plan cards */}
              <Text style={st.sectionLabel}>SELECT A PLAN</Text>
              
              {/* No Plan option */}
              <TouchableOpacity
                style={[st.planCard, !selectedPlan && st.planCardActive]}
                onPress={() => setSelectedPlan(null)}
                activeOpacity={0.7}
              >
                <View style={[st.planStripe, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.planName, !selectedPlan && { color: '#FFF' }]}>No Plan</Text>
                  <Text style={st.planPrice}>Free trial • No charges</Text>
                </View>
                {!selectedPlan && (
                  <Ionicons name="checkmark-circle" size={22} color="#FF6B35" />
                )}
              </TouchableOpacity>

              {plans.map(plan => {
                const isActive = selectedPlan === plan.id;
                const planColor = plan.color || '#FF6B35';
                return (
                  <TouchableOpacity
                    key={plan.id}
                    style={[
                      st.planCard,
                      isActive && st.planCardActive,
                      isActive && { borderColor: planColor + '40' },
                    ]}
                    onPress={() => setSelectedPlan(plan.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[st.planStripe, { backgroundColor: planColor }]} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[st.planName, isActive && { color: '#FFF' }]}>{plan.name}</Text>
                        {plan.is_popular && (
                          <View style={st.popularBadge}>
                            <Text style={st.popularText}>⭐ Popular</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[st.planPrice, isActive && { color: 'rgba(255,255,255,0.6)' }]}>
                        ${plan.price}/{plan.period || 'month'}
                      </Text>
                      {plan.features && plan.features.length > 0 && (
                        <View style={{ marginTop: 8, gap: 4 }}>
                          {plan.features.slice(0, 3).map((f, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="checkmark" size={12} color={isActive ? planColor : 'rgba(255,255,255,0.15)'} />
                              <Text style={st.planFeature}>{f}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    {isActive && (
                      <Ionicons name="checkmark-circle" size={22} color={planColor} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </KeyboardAwareScrollView>
          )}

          {/* ═══ STEP 3: Goals, Notes & Invite ═══ */}
          {step === 3 && (
            <KeyboardAwareScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" extraScrollHeight={80} enableOnAndroid>
              {/* Goals */}
              <Text style={st.sectionLabel}>FITNESS GOALS</Text>
              <View style={st.goalChips}>
                {GOAL_SUGGESTIONS.map(g => {
                  const isSelected = goals.toLowerCase().includes(g.toLowerCase());
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[st.goalChip, isSelected && st.goalChipActive]}
                      onPress={() => {
                        if (isSelected) {
                          setGoals(goals.replace(new RegExp(g + ',?\\s*', 'i'), '').trim());
                        } else {
                          setGoals(prev => prev ? `${prev}, ${g}` : g);
                        }
                      }}
                    >
                      <Text style={[st.goalChipText, isSelected && { color: '#FFF' }]}>{g}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={st.inputWrap}>
                <Ionicons name="flag-outline" size={16} color="rgba(255,255,255,0.2)" />
                <TextInput
                  style={[st.input, { minHeight: 60 }]}
                  placeholder="Or type specific goals..."
                  placeholderTextColor="rgba(255,255,255,0.15)"
                  value={goals}
                  onChangeText={setGoals}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* Notes */}
              <Text style={[st.sectionLabel, { marginTop: 24 }]}>PRIVATE NOTES</Text>
              <View style={st.inputWrap}>
                <Ionicons name="document-text-outline" size={16} color="rgba(255,255,255,0.2)" />
                <TextInput
                  style={[st.input, { minHeight: 60 }]}
                  placeholder="Notes only you can see..."
                  placeholderTextColor="rgba(255,255,255,0.15)"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* Invite */}
              <Text style={[st.sectionLabel, { marginTop: 24 }]}>INVITE TO APP</Text>
              <TouchableOpacity style={st.inviteCard} onPress={handleInvite} activeOpacity={0.7}>
                <View style={st.inviteIconWrap}>
                  <Ionicons name="paper-plane" size={20} color="#FF6B35" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.inviteTitle}>
                    Send invite {name.trim() ? `to ${name.trim().split(' ')[0]}` : ''}
                  </Text>
                  <Text style={st.inviteDesc}>Share a link to download FitLink and connect</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.15)" />
              </TouchableOpacity>
            </KeyboardAwareScrollView>
          )}

          {/* ═══ Bottom CTA ═══ */}
          {!showFind && (
            <View style={st.ctaWrap}>
              <TouchableOpacity onPress={goNext} activeOpacity={0.85} disabled={saving}>
                <LinearGradient
                  colors={['#FF6B35', '#FF8255']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={st.ctaBtn}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Text style={st.ctaBtnText}>
                        {step === 3
                          ? `Add ${name.trim().split(' ')[0] || 'Client'} ✓`
                          : 'Next'}
                      </Text>
                      {step < 3 && <Ionicons name="arrow-forward" size={18} color="#FFF" />}
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              {step === 3 && selectedPlanData && (
                <Text style={st.ctaSubtext}>Enrolling in {selectedPlanData.name} · ${selectedPlanData.price}/{selectedPlanData.period || 'mo'}</Text>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ═══════════ STYLES ═══════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  headerBack: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: '#FFF' },
  headerSubtitle: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.25)', marginTop: 2 },
  headerSkip: { paddingHorizontal: 12, paddingVertical: 6 },
  headerSkipText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.3)' },

  // Progress
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: Spacing.lg, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: '#FF6B35', borderRadius: 2 },

  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: 120 },

  // Section label
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1.5, marginBottom: 12,
  },

  // Quick Add
  quickAddRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  quickAddCard: {
    flex: 1, alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, paddingVertical: 20, paddingHorizontal: 12,
  },
  quickAddIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  quickAddTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: '#FFF' },
  quickAddDesc: { fontFamily: FontFamily.body, fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center' },

  // Identity card
  identityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 14,
  },
  avatarPicker: { position: 'relative' },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: FontFamily.bodySemiBold, fontSize: 18, color: 'rgba(255,255,255,0.3)' },
  avatarBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#FF6B35', borderWidth: 2, borderColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },

  // Inputs
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  input: {
    flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.base, color: '#FFF',
    paddingVertical: 14,
  },
  contactRow: { marginTop: 10 },

  // Find
  findTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 24, color: '#FFF', marginBottom: 4 },
  findDesc: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.3)', marginBottom: 20 },
  searchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF6B35', borderRadius: Radius.full, paddingVertical: 14, marginTop: 12,
  },
  searchBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#000' },
  findResultCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  findResultInitials: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  findResultName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#FFF' },
  findResultContact: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.3)', marginTop: 2 },
  linkBtn: { backgroundColor: '#FF6B35', paddingHorizontal: 18, paddingVertical: 10, borderRadius: Radius.full },
  linkBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: '#000' },

  // Step 2 — Status
  statusRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statusChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14,
  },
  statusChipActive: { backgroundColor: 'rgba(255,107,53,0.08)', borderColor: 'rgba(255,107,53,0.25)' },
  statusLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.4)' },
  statusDesc: { fontFamily: FontFamily.body, fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 1 },

  // Step 2 — Plans
  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, padding: 16, marginBottom: 10, overflow: 'hidden',
  },
  planCardActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,107,53,0.25)',
  },
  planStripe: {
    width: 4, height: '100%', borderRadius: 2,
    position: 'absolute', left: 0, top: 0, bottom: 0,
  },
  planName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: 'rgba(255,255,255,0.5)', marginLeft: 4 },
  planPrice: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.25)', marginTop: 2, marginLeft: 4 },
  planFeature: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  popularBadge: {
    backgroundColor: 'rgba(251,191,36,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  popularText: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: '#FBBF24' },

  // Step 3 — Goals
  goalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  goalChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  goalChipActive: { backgroundColor: 'rgba(255,107,53,0.12)', borderColor: 'rgba(255,107,53,0.25)' },
  goalChipText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.35)' },

  // Step 3 — Invite
  inviteCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, padding: 16,
  },
  inviteIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,107,53,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  inviteTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#FFF' },
  inviteDesc: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.25)', marginTop: 2 },

  // CTA
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.lg, paddingBottom: 34, paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 18, borderRadius: 50, overflow: 'hidden',
  },
  ctaBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: '#FFF' },
  ctaSubtext: {
    fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.25)',
    textAlign: 'center', marginTop: 8,
  },
});
