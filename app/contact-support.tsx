import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import Card from '../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const TOPICS = ['Bug Report', 'Feature Request', 'Account Issue', 'Billing', 'Other'];

export default function ContactSupportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedTopic, setSelectedTopic] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleSend = async () => {
    if (!selectedTopic) return Alert.alert('Select a topic', 'Please choose what your message is about.');
    if (!message.trim()) return Alert.alert('Empty message', 'Please describe your issue.');
    setSending(true);
    // Simulate sending (in production, this would hit a Supabase edge function or email API)
    await new Promise((r) => setTimeout(r, 1500));
    setSending(false);
    Alert.alert('Message Sent!', 'We\'ll get back to you within 24 hours.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Contact Support</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Quick Contact */}
          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => Linking.openURL('mailto:support@getfitlink.com')}>
              <View style={[styles.quickIcon, { backgroundColor: `${colors.blue}18` }]}>
                <Ionicons name="mail" size={20} color={colors.blue} />
              </View>
              <Text style={styles.quickLabel}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => Linking.openURL('https://twitter.com/fitlinkapp')}>
              <View style={[styles.quickIcon, { backgroundColor: `${colors.accent}18` }]}>
                <Ionicons name="logo-twitter" size={20} color={colors.accent} />
              </View>
              <Text style={styles.quickLabel}>Twitter</Text>
            </TouchableOpacity>
          </View>

          {/* Contact Form */}
          <Text style={styles.sectionLabel}>SEND A MESSAGE</Text>

          <Text style={styles.fieldLabel}>Topic</Text>
          <View style={styles.topicRow}>
            {TOPICS.map((topic) => (
              <TouchableOpacity
                key={topic}
                style={[styles.topicChip, selectedTopic === topic && styles.topicChipActive]}
                onPress={() => setSelectedTopic(topic)}
              >
                <Text style={[styles.topicText, selectedTopic === topic && styles.topicTextActive]}>{topic}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Your Message</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Describe your issue or feedback..."
            placeholderTextColor={colors.textTertiary}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <Text style={styles.emailNote}>We'll respond to {user?.email || user?.phone || 'your account email'}</Text>

          <Button title="Send Message" onPress={handleSend} loading={sending} full size="lg" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  quickRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  quickBtn: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: Spacing.lg, backgroundColor: colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border },
  quickIcon: { width: 44, height: 44, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary },

  sectionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, letterSpacing: 0.8, marginTop: Spacing['2xl'], marginBottom: Spacing.md },
  fieldLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, marginBottom: 6, marginTop: Spacing.md },

  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  topicChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  topicChipActive: { backgroundColor: colors.accentSoft, borderColor: 'rgba(255,95,59,0.3)' },
  topicText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textSecondary },
  topicTextActive: { color: colors.accent },

  textArea: {
    backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: Radius.md, padding: 14, minHeight: 120,
    fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textPrimary,
  },

  emailNote: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: Spacing.sm, marginBottom: Spacing.xl },
});
