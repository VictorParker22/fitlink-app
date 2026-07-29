import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Avatar from '../../../components/Avatar';
import { FontFamily, FontSize, Radius } from '../../../constants/theme';
import { ClientRoute } from '../../../types/routes';

interface CoachPulseProps {
  trainer: any;
  latestMessage?: string;
  isOnline?: boolean;
}

export default function CoachPulse({ trainer, latestMessage, isOnline = true }: CoachPulseProps) {
  const router = useRouter();

  if (!trainer) {
    return (
      <TouchableOpacity
        style={st.noCoachCard}
        activeOpacity={0.85}
        onPress={() => router.push(ClientRoute.workouts as any)}
      >
        <View style={st.noCoachIconBox}>
          <Ionicons name="sparkles-outline" size={20} color="#4D94FF" />
        </View>
        <View style={st.textCol}>
          <Text style={st.sectionTag}>COACHING NETWORK</Text>
          <Text style={st.noCoachTitle}>PAIR WITH A DEDICATED COACH</Text>
          <Text style={st.noCoachSubtitle}>Custom workout programming, real-time feedback & diet plans.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
      </TouchableOpacity>
    );
  }

  const messageText = latestMessage || "I've reviewed your latest session logs! Form look crisp. Keep pushing.";

  return (
    <TouchableOpacity
      style={st.card}
      activeOpacity={0.9}
      onPress={() => router.push(ClientRoute.myMessages as any)}
    >
      <View style={st.cardInner}>
        <View style={st.topTagRow}>
          <Text style={st.sectionTag}>COACH PRESENCE // DIRECT LINE</Text>
          <View style={st.onlineBadge}>
            <View style={[st.statusDot, { backgroundColor: isOnline ? '#22C55E' : '#71717A' }]} />
            <Text style={st.onlineText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
        </View>

        <View style={st.mainContentRow}>
          <View style={st.avatarWrapper}>
            <Avatar imageUrl={trainer.avatar_url} name={trainer.name || 'Coach'} size="md" />
          </View>

          <View style={st.infoCol}>
            <Text style={st.coachName}>COACH {(trainer.name || 'VICTOR').toUpperCase()}</Text>
            
            <View style={st.speechBox}>
              <Text style={st.messageSnippet} numberOfLines={2}>
                "{messageText}"
              </Text>
            </View>
          </View>

          <View style={st.chatActionBtn}>
            <Ionicons name="chatbubble-outline" size={18} color="#4D94FF" />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    overflow: 'hidden',
  },
  cardInner: {
    padding: 16,
  },
  topTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlineText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
  },
  mainContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 22,
    padding: 2,
  },
  infoCol: {
    flex: 1,
  },
  coachName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  speechBox: {
    backgroundColor: '#141418',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#22222A',
  },
  messageSnippet: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  chatActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0C1420',
    borderWidth: 1,
    borderColor: '#4D94FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCoachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    gap: 14,
  },
  noCoachIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0C1420',
    borderWidth: 1,
    borderColor: '#4D94FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  noCoachTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 2,
  },
  noCoachSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 16,
  },
});
