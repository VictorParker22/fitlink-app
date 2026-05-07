import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontFamily, FontSize } from '../../constants/theme';

export default function MessagesScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>
      <View style={styles.emptyState}>
        <Ionicons name="chatbubble-outline" size={48} color={Colors.textTertiary} />
        <Text style={styles.emptyTitle}>Your Messages</Text>
        <Text style={styles.emptyText}>Real-time chat coming in Phase 3</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { padding: Spacing.lg },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing['4xl'],
  },
  emptyTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
});
