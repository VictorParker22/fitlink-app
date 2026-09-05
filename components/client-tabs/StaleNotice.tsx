/**
 * StaleNotice — one quiet line at the top of a list that may be showing
 * cached rows while the phone is offline.
 *
 * Renders nothing while connected. Informational, not an alarm: the rows
 * beneath it are real data that was saved on this phone, so it uses the
 * surface/borderMuted/textSecondary tier (the same register as OfflineBanner)
 * and never the warning or danger colours. No motion — it simply appears and
 * disappears with connectivity, so Reduce Motion has nothing to gate.
 *
 * Mount inside a list's ListHeaderComponent (or as the first child of a
 * ScrollView's content) so it scrolls with the rows it describes.
 */

import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../../context/NetworkContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

export default function StaleNotice({ style }: { style?: StyleProp<ViewStyle> }) {
  const { isConnected } = useNetwork();
  if (isConnected) return null;

  return (
    <View
      style={[st.strip, style]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel="Showing what was saved on this phone. Reconnect to refresh."
    >
      <Ionicons name="cloud-offline-outline" size={16} color={CoachColors.textSecondary} />
      <Text style={st.text} numberOfLines={2}>
        Showing what was saved on this phone. Reconnect to refresh.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 10,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  text: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    lineHeight: 18,
    color: CoachColors.textSecondary,
  },
});
