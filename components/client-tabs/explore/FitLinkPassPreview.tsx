import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';
import { useClient } from '../../../context/ClientContext';

interface FitLinkPassPreviewProps {
  hasActivePlan: boolean;
  onExplorePlansPress: () => void;
  onSubscribePress?: () => void;
}

export default function FitLinkPassPreview({ hasActivePlan, onExplorePlansPress, onSubscribePress }: FitLinkPassPreviewProps) {
  const router = useRouter();
  const { subscription } = useClient();
  const trackNodes = subscription?.plans?.track || [];

  return (
    <View style={s.container}>
      <View style={s.card}>
        <View style={s.topRow}>
          <View style={s.tagBadge}>
            <Ionicons name="ticket" size={12} color={CoachColors.accent} />
            <Text style={s.tagText}>FitLink Pass // gamified progression</Text>
          </View>
          <View style={s.xpBadge}>
            <Text style={s.xpText}>+50 XP / workout</Text>
          </View>
        </View>

        <Text style={s.title}>Level up your fitness journey</Text>
        <Text style={s.desc}>
          Complete assigned workouts, log meals, and hit milestone check-ins to gain XP, level up, and unlock custom rewards along your personal pass timeline.
        </Text>

        {/* Mini track visualizer */}
        <View style={s.trackVisualizer}>
          <View style={s.trackLine} />

          {trackNodes.length > 0 ? (
            trackNodes.slice(0, 4).map((node: any, idx: number) => {
              let icon = 'ellipse';
              let label = node.label || `Lvl ${idx + 1}`;

              if (node.type === 'workout') {
                icon = 'barbell';
              } else if (node.type === 'diet') {
                icon = 'restaurant';
              } else if (node.type === 'milestone') {
                icon = 'trophy';
                if (!node.label) label = 'Reward';
              }

              return (
                <View key={idx} style={s.nodeItem}>
                  <View style={s.nodeCircle}>
                    <Ionicons name={icon as any} size={10} color={CoachColors.onAccent} />
                  </View>
                  <Text style={s.nodeLabel}>{label}</Text>
                </View>
              );
            })
          ) : (
            <>
              <View style={s.nodeItem}>
                <View style={s.nodeCircle}>
                  <Ionicons name="barbell" size={10} color={CoachColors.onAccent} />
                </View>
                <Text style={s.nodeLabel}>Lvl 1</Text>
              </View>

              <View style={s.nodeItem}>
                <View style={s.nodeCircle}>
                  <Ionicons name="restaurant" size={10} color={CoachColors.onAccent} />
                </View>
                <Text style={s.nodeLabel}>Lvl 2</Text>
              </View>

              <View style={s.nodeItem}>
                <View style={s.nodeCircle}>
                  <Ionicons name="trophy" size={10} color={CoachColors.onAccent} />
                </View>
                <Text style={s.nodeLabel}>Reward</Text>
              </View>

              <View style={s.nodeItem}>
                <View style={s.nodeCircle}>
                  <Ionicons name="checkmark-done" size={10} color={CoachColors.onAccent} />
                </View>
                <Text style={s.nodeLabel}>Lvl 4</Text>
              </View>
            </>
          )}
        </View>

        {/* CTA */}
        {hasActivePlan ? (
          <TouchableOpacity
            style={s.ctaBtn}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push(ClientRoute.myPass);
            }}
          >
            <Text style={s.ctaText}>View my FitLink Pass →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.ctaBtn, s.ctaBtnUnlock]}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (onSubscribePress) {
                onSubscribePress();
              } else {
                onExplorePlansPress();
              }
            }}
          >
            <Ionicons name="lock-open" size={14} color={CoachColors.onAccent} />
            <Text style={[s.ctaText, { color: CoachColors.onAccent }]}>Subscribe to unlock pass →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    padding: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  xpBadge: {
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  xpText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  desc: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    lineHeight: 19,
    marginBottom: 16,
  },
  trackVisualizer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 10,
    marginBottom: 16,
    position: 'relative',
  },
  trackLine: {
    position: 'absolute',
    left: 36,
    right: 36,
    height: 2,
    backgroundColor: CoachColors.borderMuted,
    top: 24,
  },
  nodeItem: {
    alignItems: 'center',
    gap: 4,
    zIndex: 1,
  },
  nodeCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CoachColors.accent,
  },
  nodeLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.textSecondary,
  },
  ctaBtn: {
    height: 44,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnUnlock: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
    flexDirection: 'row',
    gap: 6,
  },
  ctaText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
    letterSpacing: 1,
  },
});
