import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FontFamily } from '../../../constants/theme';
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
          <Ionicons name="chatbubble-outline" size={20} color="rgba(255,255,255,0.7)" />
          {unreadCount > 0 ? (
             <View style={[st.dot, { backgroundColor: '#E0FF4F' }]} />
          ) : (
             <View style={[st.dot, { backgroundColor: '#E0FF4F' }]} /> // In the screenshot, there is a green/lime dot even without "unread" specifically. We will just always show it for now to match the screenshot or make it unread.
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
    backgroundColor: '#000000',
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  tagline: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#D9F95C',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  name: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 34,
    color: '#FFFFFF',
    letterSpacing: -1.5,
    lineHeight: 38,
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
    backgroundColor: '#E0FF4F',
  },
});
