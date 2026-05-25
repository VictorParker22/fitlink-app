import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import Button from '../components/Button';

export default function SessionNotesScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
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

  const title = client ? `${client.name}'s Session` : session.group_name || 'Group Session';
  const displayDate = new Date(session.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: colors.bgElevated }]}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Session Notes</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={[styles.sessionInfo, { backgroundColor: colors.bgElevated }]}>
            <Ionicons name="calendar-outline" size={20} color={Colors.purple} />
            <View style={styles.sessionInfoText}>
              <Text style={[styles.sessionTitle, { color: colors.textPrimary }]}>{title}</Text>
              <Text style={[styles.sessionDate, { color: colors.textSecondary }]}>{displayDate} • {session.type}</Text>
            </View>
          </View>

          <Text style={[styles.label, { color: colors.textPrimary }]}>Post-Session Summary</Text>
          <Text style={[styles.subLabel, { color: colors.textTertiary }]}>
            Record performance, struggles, and what to focus on next time.
          </Text>

          <View style={[styles.inputContainer, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <TextInput
              style={[styles.textArea, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. John struggled with squats today, lower weight next time."
              placeholderTextColor={colors.textTertiary}
              multiline
              autoFocus
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={[styles.footer, { backgroundColor: colors.bgPrimary, borderTopColor: colors.border }]}>
          <Button 
            title="Save Notes" 
            onPress={handleSave} 
            loading={saving}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md },
  
  content: { flex: 1, padding: Spacing.lg },
  
  sessionInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.xl },
  sessionInfoText: { flex: 1 },
  sessionTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base },
  sessionDate: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },

  label: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, marginBottom: 4 },
  subLabel: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginBottom: Spacing.md },

  inputContainer: { borderRadius: Radius.md, borderWidth: 1, flex: 1, marginBottom: Spacing.md },
  textArea: { flex: 1, borderRadius: Radius.sm, padding: Spacing.md, fontFamily: FontFamily.body, fontSize: FontSize.base },

  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl, borderTopWidth: 1 },
});
