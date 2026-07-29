import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { supabase } from '../../lib/supabase';
import { FontFamily, Radius, Spacing } from '../../constants/theme';
import { LiveClassItem } from '../../context/AppContext';

export default function LivePlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [liveClass, setLiveClass] = useState<LiveClassItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState('');

  useEffect(() => {
    async function fetchClass() {
      try {
        const { data, error } = await supabase
          .from('live_classes')
          .select('*')
          .eq('id', id)
          .single();
          
        if (data && !error) {
          setLiveClass(data);
        }
      } catch (err) {
        console.error('Error fetching live class:', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchClass();

    // Subscribe to realtime status updates for this live class
    const subscription = supabase
      .channel(`live_class_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_classes',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (payload.new) {
            setLiveClass((prev) => (prev ? { ...prev, ...payload.new } : (payload.new as LiveClassItem)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [id]);

  // Polling fallback: In local development, if Supabase Realtime is not yet enabled for the `live_classes` table,
  // the client would be stuck in the waiting room forever or never see the stream end.
  // This checks the DB every 3s while waiting, and every 8s while live.
  useEffect(() => {
    // Stop polling if the stream is officially over
    if (!liveClass || liveClass.status === 'ended' || liveClass.status === 'cancelled') return;

    // Check more frequently while waiting, less frequently while watching
    const intervalMs = liveClass.status === 'live' ? 8000 : 3000;

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase.from('live_classes').select('status').eq('id', id).single();
        if (data && data.status !== liveClass.status) {
          console.log('[Live Player] Polling detected status change:', data.status);
          setLiveClass(prev => prev ? { ...prev, status: data.status } : null);
        }
      } catch (err) {}
    }, intervalMs);

    return () => clearInterval(interval);
  }, [liveClass?.status, id]);

  const playbackUrl = liveClass?.mux_playback_id 
    ? `https://stream.mux.com/${liveClass.mux_playback_id}.m3u8`
    : null;

  const player = useVideoPlayer(playbackUrl, (p) => {
    p.loop = false;
    p.play();
  });

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    // Real chat implementation would push to Supabase realtime
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChatMessage('');
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#EF4444" size="large" />
      </View>
    );
  }

  if (!liveClass) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>Class not found.</Text>
        <TouchableOpacity style={styles.backBtnAlt} onPress={() => router.back()}>
          <Text style={styles.backBtnAltText}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isStreamEnded = liveClass.status === 'ended';
  const isStreamStarting = liveClass.status === 'scheduled' || liveClass.status === 'starting';

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{liveClass.title}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.liveBadge, isStreamEnded && { backgroundColor: '#1C1C1E' }, isStreamStarting && { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.liveBadgeText}>{isStreamEnded ? 'ENDED' : isStreamStarting ? 'STARTING' : 'LIVE'}</Text>
            </View>
            <View style={styles.viewersBadge}>
              <Ionicons name="eye" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.viewersText}>48</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Video Container / Ended Fallback */}
      <View style={styles.videoContainer}>
        {isStreamEnded ? (
          <View style={styles.endedBanner}>
            <Ionicons name="sparkles" size={32} color="#FFD700" style={{ marginBottom: 8 }} />
            <Text style={styles.endedTitle}>BROADCAST HAS CONCLUDED</Text>
            <Text style={styles.endedSub}>Your coach has wrapped up this live class. Thanks for training live!</Text>
            <TouchableOpacity style={styles.backToExploreBtn} onPress={() => router.back()}>
              <Text style={styles.backToExploreText}>EXPLORE MORE CLASSES</Text>
            </TouchableOpacity>
          </View>
        ) : isStreamStarting ? (
          <View style={styles.endedBanner}>
            <ActivityIndicator color="#FFD700" size="large" style={{ marginBottom: 16 }} />
            <Text style={styles.endedTitle}>WAITING FOR COACH</Text>
            <Text style={styles.endedSub}>Your coach is connecting to the stream. Hang tight, the broadcast will begin automatically in just a moment!</Text>
          </View>
        ) : playbackUrl ? (
          <VideoView
            style={styles.videoView}
            player={player}
            allowsFullscreen
            allowsPictureInPicture
            contentFit="contain"
          />
        ) : (
          <View style={styles.placeholderVideo}>
            <ActivityIndicator color="#EF4444" size="small" style={{ marginBottom: 8 }} />
            <Text style={styles.placeholderText}>Coach will be right back...</Text>
          </View>
        )}
      </View>

      {/* Chat Section */}
      <View style={styles.chatContainer}>
        <View style={styles.chatList}>
          <Text style={styles.systemMessage}>Welcome to the live session!</Text>
          {isStreamEnded ? (
            <Text style={[styles.systemMessage, { color: '#FFD700' }]}>
              Broadcast ended by coach.
            </Text>
          ) : null}
        </View>
        
        <View style={[styles.chatInputRow, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <TextInput
            style={styles.chatInput}
            placeholder={isStreamEnded ? "Chat disabled (Stream ended)" : "Say something..."}
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={chatMessage}
            onChangeText={setChatMessage}
            editable={!isStreamEnded}
            selectionColor="#EF4444"
          />
          <TouchableOpacity 
            style={[styles.sendBtn, (!chatMessage.trim() || isStreamEnded) && { opacity: 0.5 }]} 
            onPress={handleSendChat}
            disabled={!chatMessage.trim() || isStreamEnded}
          >
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    zIndex: 10,
  },
  closeBtn: {
    padding: 8,
  },
  headerInfo: {
    marginLeft: 12,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  liveBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  viewersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  viewersText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
  },
  videoContainer: {
    aspectRatio: 16 / 9,
    width: '100%',
    backgroundColor: '#0C0C0E',
  },
  videoView: {
    flex: 1,
  },
  placeholderVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  placeholderText: {
    fontFamily: FontFamily.body,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  endedBanner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: '#0C0C0E',
  },
  endedTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  endedSub: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  backToExploreBtn: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.xs,
  },
  backToExploreText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: '#FFD700',
    letterSpacing: 1,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#0C0C0E',
  },
  chatList: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'flex-end',
  },
  systemMessage: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginBottom: 8,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 20,
  },
  backBtnAlt: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.xs,
  },
  backBtnAltText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
  }
});
