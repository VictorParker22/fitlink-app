import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';
import * as Haptics from 'expo-haptics';

interface GreetingHeaderProps {
  clientName: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  unreadCount?: number;
}

const TAGLINES: Record<string, string> = {
  morning:   'Time to move.',
  afternoon: 'Keep it going.',
  evening:   'Finish strong.',
  night:     'Rest hard.',
};

export default function GreetingHeader({
  clientName,
  timeOfDay,
  unreadCount = 0,
}: GreetingHeaderProps) {
  const router  = useRouter();
  const firstName = (clientName || 'Athlete').split(' ')[0];
  const tagline   = TAGLINES[timeOfDay] ?? 'Let\'s go.';

  return (
    <View style={st.container}>
      {/* ── LEFT: Text stack ── */}
      <View style={st.nameBlock}>
        <Text style={st.tagline}>{tagline}</Text>
        <Text style={st.name} numberOfLines={1}>{firstName}</Text>
      </View>

      {/* ── RIGHT: Chat icon ── */}
      <View style={st.right}>
        <TouchableOpacity
          style={st.iconBtn}
          onPress={() => {
            Haptics.selectionAsync();
            router.push(ClientRoute.myMessages as any);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-outline" size={22} color={CoachColors.textSecondary} />
          {unreadCount > 0 ? (
             <View style={[st.dot, { backgroundColor: CoachColors.accent }]} />
          ) : (
             <View style={[st.dot, { backgroundColor: CoachColors.accent }]} /> // In the screenshot, there is a green/lime dot even without "unread" specifically. We will just always show it for now to match the screenshot or make it unread.
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: CoachColors.bg,
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  tagline: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.accent,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  name: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 38,
    color: CoachColors.textPrimary,
    letterSpacing: -1.5,
    lineHeight: 42.5,
    textTransform: 'uppercase',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CoachColors.accent,
  },
});
