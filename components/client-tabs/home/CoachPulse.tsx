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
import { FontFamily } from '../../../constants/theme';
import { ClientRoute } from '../../../types/routes';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

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
          <Text style={st.micro}>YOUR COACH</Text>
          <Text style={st.noCoachHero}>No coach yet.</Text>
          <Text style={st.noCoachSub}>Custom programming, real-time feedback, diet plans.</Text>
        </View>
        {/* §14 44×44 touch target */}
        <View style={st.ctaBtn}>
          <Text style={st.ctaBtnText}>Pair</Text>
          <Ionicons name="arrow-forward" size={14} color="#000" />
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
      <Text style={st.topTag}>YOUR COACH • {(trainer.name || 'VICTOR').toUpperCase()}</Text>

      <View style={st.mainRow}>
        {/* Square Avatar */}
        <View style={st.avatarSquare}>
          {trainer.avatar_url ? (
            <Avatar imageUrl={trainer.avatar_url} name={trainer.name} size="md" />
          ) : (
            <Text style={st.avatarPlaceholderText}>PHOTO</Text>
          )}
        </View>

        {/* Message with yellow bar */}
        <View style={st.messageCol}>
          <Text style={st.speechText} numberOfLines={3}>
            "{messageText}"
          </Text>
        </View>

        {/* Chat button */}
        <View style={st.chatBtn}>
          <Ionicons name="chatbubble-ellipses" size={18} color="#D9F95C" />
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
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    padding: 18,
    paddingBottom: 14,
    overflow: 'hidden',
  },

  topTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
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
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPlaceholderText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 1,
  },

  // Message with yellow bar
  messageCol: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: '#D9F95C',
    paddingLeft: 12,
    paddingVertical: 2,
  },
  speechText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Chat button
  chatBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(217, 249, 92, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(217, 249, 92, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── No-coach empty state ──
  noCoachCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  noCoachHero: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  noCoachSub: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 17,
  },
  // §14 CTA button 44×44 minimum
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
  },
  ctaBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
  },
});
