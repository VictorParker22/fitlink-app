import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Avatar from '../../../components/Avatar';
import { FontFamily, FontSize, Radius, Spacing } from '../../../constants/theme';
import { ClientRoute } from '../../../types/routes';

interface GreetingHeaderProps {
  clientName: string;
  avatarUrl?: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  trainerName?: string;
  unreadCount?: number;
}

export default function GreetingHeader({
  clientName,
  avatarUrl,
  timeOfDay,
  unreadCount = 0,
}: GreetingHeaderProps) {
  const router = useRouter();

  const getGreetingText = () => {
    switch (timeOfDay) {
      case 'morning':
        return { title: 'GOOD MORNING', emoji: '☀️' };
      case 'afternoon':
        return { title: 'GOOD AFTERNOON', emoji: '⚡' };
      case 'evening':
        return { title: 'GOOD EVENING', emoji: '🌙' };
      default:
        return { title: 'REST & RECOVER', emoji: '😴' };
    }
  };

  const greeting = getGreetingText();

  return (
    <View style={st.container}>
      <View style={st.topTagRow}>
        <Text style={st.portalTag}>CLIENT PORTAL // FITLINK LUXE</Text>
      </View>

      <View style={st.mainRow}>
        <View style={st.leftRow}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(ClientRoute.myProfile as any)}>
            <View style={st.avatarBorder}>
              <Avatar imageUrl={avatarUrl} name={clientName} size="lg" />
            </View>
          </TouchableOpacity>
          
          <View style={st.textCol}>
            <View style={st.greetingRow}>
              <Text style={st.greetingText}>{greeting.title}</Text>
              <Text style={st.emoji}>{greeting.emoji}</Text>
            </View>
            <Text style={st.nameText} numberOfLines={1}>{clientName || 'ATHLETE'}</Text>
          </View>
        </View>

        <View style={st.rightActions}>
          <TouchableOpacity
            style={st.iconBtn}
            activeOpacity={0.8}
            onPress={() => router.push(ClientRoute.myMessages as any)}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#FFFFFF" />
            {unreadCount > 0 && <View style={st.unreadBadge} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={st.iconBtn}
            activeOpacity={0.8}
            onPress={() => router.push(ClientRoute.myProfile as any)}
          >
            <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: '#000000',
  },
  topTagRow: {
    marginBottom: 8,
  },
  portalTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  avatarBorder: {
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 28,
    padding: 2,
  },
  textCol: {
    justifyContent: 'center',
    flex: 1,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  greetingText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#6C9BF2',
    letterSpacing: 1.5,
  },
  emoji: {
    fontSize: 11,
  },
  nameText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
});
