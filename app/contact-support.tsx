import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useClient } from '../context/ClientContext';
import { supabase } from '../lib/supabase';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const TOPICS = ['Bug Report', 'Feature Request', 'Account Issue', 'Billing', 'Other'];

export default function ContactSupportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { clientData } = useClient();
  const [selectedTopic, setSelectedTopic] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleSend = async () => {
    if (!selectedTopic) return Alert.alert('Select a topic', 'Please choose what your message is about.');
    if (!message.trim()) return Alert.alert('Empty message', 'Please describe your issue.');
    setSending(true);
    
    try {
      if (clientData) {
        await supabase.from('activities').insert({
          trainer_id: clientData.trainer_id,
          type: 'support_request',
          message: `${clientData.name} requested support for: ${selectedTopic}\n\nMessage: ${message}`
        });
      } else {
        await new Promise((r) => setTimeout(r, 1500)); // Fallback if no clientData
      }
      
      setSending(false);
      Alert.alert('Message Sent!', 'We\'ll get back to you within 24 hours.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.warn('Error sending support message:', error);
      setSending(false);
      Alert.alert('Error', 'Failed to send message. Please try again later.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>CONTACT SUPPORT</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Quick Contact */}
          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => Linking.openURL('mailto:support@getfitlink.com')}>
              <View style={styles.quickIcon}>
                <Ionicons name="mail" size={16} color={colors.textPrimary} />
              </View>
              <Text style={styles.quickLabel}>EMAIL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => Linking.openURL('https://twitter.com/fitlinkapp')}>
              <View style={styles.quickIcon}>
                <Ionicons name="logo-twitter" size={16} color={colors.textPrimary} />
              </View>
              <Text style={styles.quickLabel}>TWITTER</Text>
            </TouchableOpacity>
          </View>

          {/* Contact Form */}
          <Text style={styles.sectionLabel}>SEND A MESSAGE</Text>

          <Text style={styles.fieldLabel}>TOPIC</Text>
          <View style={styles.topicRow}>
            {TOPICS.map((topic) => (
              <TouchableOpacity
                key={topic}
                style={[styles.topicChip, selectedTopic === topic && styles.topicChipActive]}
                onPress={() => setSelectedTopic(topic)}
              >
                <Text style={[styles.topicText, selectedTopic === topic && styles.topicTextActive]}>{topic.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>YOUR MESSAGE</Text>
          <TextInput
            style={styles.textArea}
            placeholder="DESCRIBE YOUR ISSUE OR FEEDBACK..."
            placeholderTextColor={colors.textTertiary}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <Text style={styles.emailNote}>WE'LL RESPOND TO {user?.email?.toUpperCase() || user?.phone || 'YOUR ACCOUNT EMAIL'}</Text>

          <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending} activeOpacity={0.8}>
            <Text style={styles.sendBtnText}>{sending ? 'SENDING...' : 'SEND MESSAGE'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 110 },

  quickRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: Spacing.md,
    backgroundColor: colors.bgSecondary,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: colors.textPrimary, letterSpacing: 1 },

  sectionLabel: { fontFamily: FontFamily.heading, fontSize: 11, color: colors.textTertiary, letterSpacing: 1.5, marginTop: Spacing['2xl'], marginBottom: Spacing.md },
  fieldLabel: { fontFamily: FontFamily.heading, fontSize: 10, color: colors.textSecondary, letterSpacing: 1, marginBottom: Spacing.xs, marginTop: Spacing.md },

  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  topicChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topicChipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  topicText: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.8 },
  topicTextActive: { color: colors.bgPrimary },

  textArea: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    padding: Spacing.md,
    minHeight: 120,
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },

  emailNote: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: colors.textTertiary, marginTop: Spacing.sm, marginBottom: Spacing.xl, letterSpacing: 0.5 },

  sendBtn: {
    backgroundColor: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    borderRadius: Radius.xs,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: colors.bgPrimary,
    letterSpacing: 1.5,
  },
});
