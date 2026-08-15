import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Avatar from '../../../components/Avatar';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../../../lib/useReducedMotion';

interface CoachPulseProps {
  trainer: any;
  latestMessage?: string;
  isOnline?: boolean;
}

export default function CoachPulse({
  trainer,
  latestMessage,
  isOnline = true,
}: CoachPulseProps) {
  const router = useRouter();

  // Reduce Motion — stop pulse when user has motion sensitivity
  const reduced = useReducedMotion();

  // §15 "Alive" — online dot pulses when coach is online
  const dotPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isOnline || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1.6, duration: 800, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline, reduced]);

  // §8 No-coach empty state with CTA — not just text
  if (!trainer) {
    return (
      <TouchableOpacity
        style={st.noCoachCard}
        activeOpacity={0.85}
        onPress={() => {
          Haptics.selectionAsync();
          router.push(ClientRoute.workouts as any);
        }}
      >
        <View style={st.noCoachLeft}>
          {/* §1 Micro → hero → context */}
          <Text style={st.micro}>Your coach</Text>
          <Text style={st.noCoachHero}>No coach yet.</Text>
          <Text style={st.noCoachSub}>Custom programming, real-time feedback, diet plans.</Text>
        </View>
        {/* §14 44×44 touch target */}
        <View style={st.ctaBtn}>
          <Text style={st.ctaBtnText}>Pair</Text>
          <Ionicons name="arrow-forward" size={14} color={CoachColors.onAccent} />
        </View>
      </TouchableOpacity>
    );
  }

  const messageText = latestMessage
    || "Reviewed your logs. Form looks crisp — hold the tempo Friday.";

  return (
    <TouchableOpacity
      style={st.card}
      activeOpacity={0.88}
      onPress={() => {
        Haptics.selectionAsync();
        router.push(ClientRoute.myMessages as any);
      }}
    >
      {/* Top Tag */}
      <Text style={st.topTag}>Your coach · {trainer.name || 'Victor'}</Text>

      <View style={st.mainRow}>
        {/* Square Avatar */}
        <View style={st.avatarSquare}>
          {trainer.avatar_url ? (
            <Avatar imageUrl={trainer.avatar_url} name={trainer.name} size="md" />
          ) : (
            <Text style={st.avatarPlaceholderText}>Photo</Text>
          )}
        </View>

        {/* Message with accent bar */}
        <View style={st.messageCol}>
          <Text style={st.speechText} numberOfLines={3}>
            "{messageText}"
          </Text>
        </View>

        {/* Chat button */}
        <View style={st.chatBtn}>
          <Ionicons name="chatbubble-ellipses" size={18} color={CoachColors.accent} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  // §2 Layer 1 surface + 1px border
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: 18,
    paddingBottom: 14,
    overflow: 'hidden',
  },

  topTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  // Main row
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  // Square avatar
  avatarSquare: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPlaceholderText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Message with accent bar
  messageCol: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: CoachColors.accent,
    paddingLeft: 12,
    paddingVertical: 2,
  },
  speechText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13,
    color: CoachColors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Chat button
  chatBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1,
    borderColor: CoachColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── No-coach empty state ──
  noCoachCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  noCoachLeft: {
    flex: 1,
    gap: 4,
  },
  // §1 "No coach" empty state: micro → punchy statement → sub
  micro: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  noCoachHero: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  noCoachSub: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12,
    color: CoachColors.textMuted,
    lineHeight: 17,
  },
  // §14 CTA button 44×44 minimum
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoachColors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
  },
  ctaBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.onAccent,
  },
});
