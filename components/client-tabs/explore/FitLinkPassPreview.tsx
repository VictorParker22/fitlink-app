import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { FontFamily } from '../../../constants/theme';
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
            <Ionicons name="ticket" size={12} color="#FF6B35" />
            <Text style={s.tagText}>FITLINK PASS // GAMIFIED PROGRESSION</Text>
          </View>
          <View style={s.xpBadge}>
            <Text style={s.xpText}>+50 XP / WORKOUT</Text>
          </View>
        </View>

        <Text style={s.title}>Level Up Your Fitness Journey</Text>
        <Text style={s.desc}>
          Complete assigned workouts, log meals, and hit milestone check-ins to gain XP, level up, and unlock custom rewards along your personal pass timeline.
        </Text>

        {/* Mini track visualizer */}
        <View style={s.trackVisualizer}>
          <View style={s.trackLine} />

          {trackNodes.length > 0 ? (
            trackNodes.slice(0, 4).map((node: any, idx: number) => {
              let icon = 'ellipse';
              let color = '#FFF';
              let label = node.label || `LVL ${idx + 1}`;
              
              if (node.type === 'workout') {
                icon = 'barbell';
                color = '#FF6B35';
              } else if (node.type === 'diet') {
                icon = 'restaurant';
                color = '#A78BFA';
              } else if (node.type === 'milestone') {
                icon = 'trophy';
                color = '#FFD700';
                if (!node.label) label = 'REWARD';
              }

              return (
                <View key={idx} style={s.nodeItem}>
                  <View style={[s.nodeCircle, { backgroundColor: color }]}>
                    <Ionicons name={icon as any} size={10} color={color === '#FFD700' ? '#000' : '#FFF'} />
                  </View>
                  <Text style={s.nodeLabel}>{label}</Text>
                </View>
              );
            })
          ) : (
            <>
              <View style={s.nodeItem}>
                <View style={[s.nodeCircle, { backgroundColor: '#FF6B35' }]}>
                  <Ionicons name="barbell" size={10} color="#FFF" />
                </View>
                <Text style={s.nodeLabel}>LVL 1</Text>
              </View>

              <View style={s.nodeItem}>
                <View style={[s.nodeCircle, { backgroundColor: '#A78BFA' }]}>
                  <Ionicons name="restaurant" size={10} color="#FFF" />
                </View>
                <Text style={s.nodeLabel}>LVL 2</Text>
              </View>

              <View style={s.nodeItem}>
                <View style={[s.nodeCircle, { backgroundColor: '#FFD700' }]}>
                  <Ionicons name="trophy" size={10} color="#000" />
                </View>
                <Text style={s.nodeLabel}>REWARD</Text>
              </View>

              <View style={s.nodeItem}>
                <View style={[s.nodeCircle, { backgroundColor: '#22C55E' }]}>
                  <Ionicons name="checkmark-done" size={10} color="#FFF" />
                </View>
                <Text style={s.nodeLabel}>LVL 4</Text>
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
            <Text style={s.ctaText}>VIEW MY FITLINK PASS →</Text>
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
            <Ionicons name="lock-open" size={14} color="#000000" />
            <Text style={[s.ctaText, { color: '#000000' }]}>SUBSCRIBE TO UNLOCK PASS →</Text>
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#FF6B35',
    letterSpacing: 1.2,
  },
  xpBadge: {
    backgroundColor: '#0C1C12',
    borderWidth: 1,
    borderColor: '#22C55E',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  xpText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#22C55E',
    letterSpacing: 1,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  desc: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 19,
    marginBottom: 16,
  },
  trackVisualizer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 10,
    marginBottom: 16,
    position: 'relative',
  },
  trackLine: {
    position: 'absolute',
    left: 36,
    right: 36,
    height: 2,
    backgroundColor: '#1C1C1E',
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
  },
  nodeLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
  },
  ctaBtn: {
    height: 44,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnUnlock: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    flexDirection: 'row',
    gap: 6,
  },
  ctaText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
