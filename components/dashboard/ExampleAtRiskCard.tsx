import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

/**
 * First-run only: a sample of the "needs attention" card the coach will get
 * once real athletes are on the roster. Every row is fake and the card says
 * so — a visible "Example" chip, sample names, and a caption. Dismissible;
 * the dashboard persists the dismissal.
 *
 * Never rendered once the coach has a single real client.
 */

const SAMPLE_ROWS = [
  { name: 'Maya R.', detail: 'No session logged in 9 days' },
  { name: 'Devon K.', detail: 'Trial ends in 2 days' },
];

export default function ExampleAtRiskCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.title}>Needs attention</Text>
        <View style={s.exampleChip}>
          <Text style={s.exampleChipText}>Example</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss example card"
        >
          <Ionicons name="close" size={16} color={CoachColors.textFaint} />
        </TouchableOpacity>
      </View>

      {SAMPLE_ROWS.map((row, i) => (
        <View key={row.name} style={[s.row, i < SAMPLE_ROWS.length - 1 && s.rowBorder]}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {row.name.split(' ').map(p => p[0]).join('').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.rowName}>{row.name}</Text>
            <Text style={s.rowDetail}>{row.detail}</Text>
          </View>
          <View style={s.rowTag}>
            <Text style={s.rowTagText}>Example</Text>
          </View>
        </View>
      ))}

      <Text style={s.caption}>
        Sample data — once you have athletes, anyone drifting shows up here
        before they churn.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
  },
  exampleChip: {
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  exampleChipText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    opacity: 0.75,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.textSecondary,
  },
  rowName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },
  rowDetail: {
    fontFamily: CoachFonts.body,
    fontSize: 11.5,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  rowTag: {
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  rowTagText: {
    fontFamily: CoachFonts.body,
    fontSize: 9.5,
    color: CoachColors.textFaint,
  },
  caption: {
    fontFamily: CoachFonts.body,
    fontSize: 11.5,
    color: CoachColors.textFaint,
    lineHeight: 16,
    marginTop: 12,
  },
});
