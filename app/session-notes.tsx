import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

export default function SessionNotesScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { sessions, updateSession, getClientById } = useApp();

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const session = sessions.find((s) => s.id === sessionId);
  const client = session?.client_id ? getClientById(session.client_id) : null;

  useEffect(() => {
    if (session?.notes) {
      setNotes(session.notes);
    }
  }, [session]);

  if (!session) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSession(session.id, { notes: notes.trim() });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save notes.');
    } finally {
      setSaving(false);
    }
  };

  const title = client ? `${client.name}'s session` : session.group_name || 'Group session';
  const displayDate = new Date(session.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close session notes"
        >
          <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Session notes</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.sessionInfo}>
            <Ionicons name="calendar-outline" size={22} color={CoachColors.accent} />
            <View style={styles.sessionInfoText}>
              <Text style={styles.sessionTitle}>{title}</Text>
              <Text style={styles.sessionDate}>{displayDate} • {session.type}</Text>
            </View>
          </View>

          <Text style={styles.label}>Post-session summary</Text>
          <Text style={styles.subLabel}>
            Record performance, struggles, and what to focus on next time.
          </Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textArea}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. John struggled with squats today, lower weight next time."
              placeholderTextColor={CoachColors.textFaint}
              multiline
              autoFocus
              textAlignVertical="top"
              accessibilityLabel="Session notes"
            />
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Save notes"
          >
            {saving
              ? <ActivityIndicator size="small" color={CoachColors.onAccent} />
              : <Text style={styles.saveBtnText}>Save notes</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 20, color: CoachColors.textPrimary },

  content: { flex: 1, padding: 16 },

  sessionInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, marginBottom: 20, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted },
  sessionInfoText: { flex: 1 },
  sessionTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 19, color: CoachColors.textPrimary },
  sessionDate: { fontFamily: CoachFonts.body, fontSize: 14.5, marginTop: 2, color: CoachColors.textSecondary },

  label: { fontFamily: CoachFonts.headingSemiBold, fontSize: 20, marginBottom: 4, color: CoachColors.textPrimary },
  subLabel: { fontFamily: CoachFonts.body, fontSize: 17, marginBottom: 10, color: CoachColors.textMuted },

  inputContainer: { borderRadius: 12, borderWidth: 1, flex: 1, marginBottom: 10, backgroundColor: CoachColors.surface, borderColor: CoachColors.border },
  textArea: { flex: 1, borderRadius: 8, padding: 10, fontFamily: CoachFonts.body, fontSize: 19, color: CoachColors.textPrimary },

  // SafeAreaView edges={['top','bottom']} already applies the home-indicator inset.
  footer: { padding: 16, paddingBottom: 10, borderTopWidth: 1, backgroundColor: CoachColors.bg, borderTopColor: CoachColors.borderMuted },

  saveBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999, minHeight: 52,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 15,
  },
  saveBtnText: { fontFamily: CoachFonts.headingBold, fontSize: 18, color: CoachColors.onAccent },
});
