// components/coach/CoachCopilotCard.tsx
// The flagship "AI" priority queue — a horizontal scroll of ranked action cards.
// Each card tells the coach exactly who needs attention and why, with one-tap CTA.

import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Animated, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCoachCopilot } from '../../hooks/useCoachCopilot';
import { useHaptic } from '../../hooks/useHaptic';
import { Bolt } from '../mascot/Bolt';
import { PrecisionIcons } from '../icons/PrecisionIcons';
import { FontFamily, FontSize, Radius, Spacing, Colors } from '../../constants/theme';
import type { CopilotAction, ActionPriority, ActionCategory } from '../../lib/copilot/types';

// ─── Priority config ──────────────────────────────────────────────────────────
const PRIORITY: Record<ActionPriority, { color: string; bg: string; border: string; icon: keyof typeof Ionicons.glyphMap }> = {
  critical:    { color: '#FF453A', bg: 'rgba(255,69,58,0.10)',  border: 'rgba(255,69,58,0.25)',  icon: 'alert-circle'      },
  high:        { color: '#FF9500', bg: 'rgba(255,149,0,0.10)',  border: 'rgba(255,149,0,0.25)',  icon: 'warning'           },
  medium:      { color: '#FFCC00', bg: 'rgba(255,204,0,0.10)', border: 'rgba(255,204,0,0.20)',  icon: 'time-outline'      },
  low:         { color: '#8E8E93', bg: 'rgba(142,142,147,0.08)', border: 'rgba(142,142,147,0.15)', icon: 'chatbubble-outline' },
  celebration: { color: '#30D158', bg: 'rgba(48,209,88,0.10)', border: 'rgba(48,209,88,0.25)',  icon: 'flame-outline'     },
};

// ─── Individual Action Card ───────────────────────────────────────────────────
const ActionCard: React.FC<{
  action: CopilotAction;
  index: number;
  onDismiss: (id: string, category: ActionCategory) => void;
  onTap: (category: ActionCategory) => void;
}> = ({ action, index, onDismiss, onTap }) => {
  const router  = useRouter();
  const haptic  = useHaptic();
  const p       = PRIORITY[action.priority];
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        delay: index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 400,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateX]);

  const handleCta = () => {
    haptic.trigger(action.priority === 'critical' ? 'heavy' : 'medium');
    onTap(action.category);
    const { ctaRoute, ctaParams } = action;

    if (ctaRoute === '/client/[id]' && ctaParams?.id) {
      router.push(`/client/${ctaParams.id}` as any);
    } else if (ctaRoute === '/messages') {
      router.push('/(tabs)/messages' as any);
    } else if (ctaRoute === '/schedule') {
      router.push(`/book-session?clientId=${ctaParams?.clientId}` as any);
    } else {
      router.push(ctaRoute as any);
    }
  };

  const handleDismiss = () => {
    haptic.trigger('light');
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onDismiss(action.id, action.category);
    });
  };

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <View style={[styles.card, { backgroundColor: p.bg, borderColor: p.border }]}>

        {/* Priority icon */}
        <View style={[styles.iconChip, { backgroundColor: `${p.color}20` }]}>
          <Ionicons name={p.icon} size={14} color={p.color} />
        </View>

        {/* Headline */}
        <Text style={[styles.headline, { color: p.color }]} numberOfLines={2}>
          {action.headline}
        </Text>

        {/* Client name */}
        <Text style={styles.clientName}>{action.clientName}</Text>

        {/* Subtext */}
        <Text style={styles.subtext} numberOfLines={3}>{action.subtext}</Text>

        {/* Suggestion box */}
        <View style={styles.suggestionBox}>
          <Ionicons name="bulb-outline" size={11} color="rgba(255,255,255,0.5)" style={{ marginTop: 1 }} />
          <Text style={styles.suggestionText} numberOfLines={2}>{action.suggestedAction}</Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, { borderColor: p.color }]}
          onPress={handleCta}
          activeOpacity={0.75}
        >
          <Text style={[styles.ctaText, { color: p.color }]}>{action.ctaLabel} →</Text>
        </TouchableOpacity>

        {/* Dismiss button */}
        {action.dismissable && (
          <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={13} color="rgba(255,255,255,0.35)" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

// ─── Main Copilot card ────────────────────────────────────────────────────────
export const CoachCopilotCard: React.FC = () => {
  const { actions, dismissAction, trackTap, totalCount } = useCoachCopilot();

  // Empty state — all clients are healthy
  if (actions.length === 0) {
    return (
      <View style={[styles.container, styles.emptyState]}>
        <View style={styles.emptyIconWrap}>
          <Bolt pose="Celebrate" size={48} />
        </View>
        <Text style={styles.emptyTitle}>All caught up</Text>
        <Text style={styles.emptySub}>Your roster is on track. Great coaching.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <PrecisionIcons.Sparkles size={16} color="#FFCC00" />
          <Text style={styles.headerTitle}>Copilot</Text>
        </View>
        <View style={styles.actionCountBadge}>
          <Text style={styles.actionCountText}>{totalCount} action{totalCount !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={292} // card width + gap
        snapToAlignment="start"
      >
        {actions.map((action, i) => (
          <ActionCard key={action.id} action={action} index={i} onDismiss={dismissAction} onTap={trackTap} />
        ))}
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    paddingVertical: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  actionCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionCountText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  scrollContent: {
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingBottom: 2,
  },

  // ── Action card ──
  card: {
    width: 272,
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    position: 'relative',
  },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  headline: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 3,
  },
  clientName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  subtext: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 17,
    marginBottom: 10,
  },
  suggestionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  suggestionText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 16,
    flex: 1,
  },
  ctaBtn: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
  },
  dismissBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: Spacing.xl,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(48,209,88,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 17,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  emptySub: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
});
