import React, { useState, useEffect, useRef } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useApp, LiveClassItem } from '../../context/AppContext';
import { FontFamily, Radius, Spacing } from '../../constants/theme';
import { useAlert } from '../../context/AlertContext';
import { supabase } from '../../lib/supabase';

let ExpoCameraRtmpPublisherView: any = null;
let requestCameraPermissionsAsync: any = null;
let requestMicrophonePermissionsAsync: any = null;

if (Platform.OS === 'ios') {
  try {
    const RtmpModule = require('expo-camera-rtmp-publisher');
    ExpoCameraRtmpPublisherView = RtmpModule.ExpoCameraRtmpPublisherView;
    requestCameraPermissionsAsync = RtmpModule.requestCameraPermissionsAsync;
    requestMicrophonePermissionsAsync = RtmpModule.requestMicrophonePermissionsAsync;
  } catch (e) {
    console.warn('[Broadcast Studio] Native RTMP module load error:', e);
  }
}

export default function BroadcastStudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { liveClasses, updateLiveClass, createClass, classes, deleteClass } = useApp();
  const { showAlert } = useAlert();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [liveClass, setLiveClass] = useState<LiveClassItem | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const publisherRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const camPerm = await requestCameraPermissionsAsync();
        const micPerm = await requestMicrophonePermissionsAsync();
        setHasPermission(camPerm.granted && micPerm.granted);
      } catch (e) {
        console.warn('[Broadcast] Error requesting permissions:', e);
        // Fallback for dev mode / simulator
        setHasPermission(true);
      }
    })();
  }, []);

  useEffect(() => {
    async function loadClass() {
      if (!id) return;
      const found = liveClasses?.find(c => c.id === id);
      if (found) {
        setLiveClass(found);
        return;
      }
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
        console.error('[Broadcast Studio] Fetch class error:', err);
      }
    }
    loadClass();
  }, [id, liveClasses]);

  const toggleCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCameraPosition(prev => (prev === 'front' ? 'back' : 'front'));
  };

  const toggleMute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsMuted(prev => !prev);
  };

  const handleStartBroadcast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!liveClass) return;

    let activeStreamKey = liveClass.mux_stream_key;

    // If key is missing or is a fallback key starting with 'key_', trigger the Edge Function now to get a real Mux key
    if (!activeStreamKey || activeStreamKey.startsWith('key_')) {
      try {
        console.log('[Broadcast Studio] Triggering create-mux-stream Edge Function...');
        const { data: muxData, error: muxError } = await supabase.functions.invoke('create-mux-stream');
        if (!muxError && muxData?.stream_key) {
          activeStreamKey = muxData.stream_key;
          await updateLiveClass(liveClass.id, {
            mux_stream_id: muxData.stream_id,
            mux_stream_key: muxData.stream_key,
            mux_playback_id: muxData.playback_id,
          });
        } else if (muxError) {
          console.error('[Broadcast Studio] Edge Function invocation error:', muxError);
        }
      } catch (err: any) {
        console.error('[Broadcast Studio] Exception calling Edge Function:', err);
        showAlert({ type: 'error', title: 'Mux Setup Error', message: err.message || 'Could not reach Mux Edge Function.' });
      }
    }

    if (!activeStreamKey || activeStreamKey.startsWith('key_')) {
      showAlert({ type: 'error', title: 'Invalid Stream Key', message: 'A valid Mux stream key is required to broadcast. Please check your Supabase Secrets.' });
      return;
    }
    
    try {
      // 1. Set local state to broadcasting. The DB stays 'scheduled' so clients stay in the Waiting Room.
      setIsBroadcasting(true);

      // 2. Start native stream
      if (publisherRef.current) {
        // We use RTMP over port 5222 as it is the most universally compatible with native encoders.
        const rtmpUrl = 'rtmp://global-live.mux.com:5222/app';
        await publisherRef.current.startPublishing(
          rtmpUrl,
          activeStreamKey,
          {
            // CRITICAL: Must use 720x1280. Many mobile hardware H.264 encoders fail on 1080x1920,
            // resulting in Mux throwing an 'invalid_input' error due to corrupted/missing video data.
            videoWidth: 720,
            videoHeight: 1280,
            videoBitrate: 2500000, // 2.5 Mbps is ideal for 720p 30fps
            audioBitrate: 128000,
          }
        );
      }

      // 3. Wait for Mux to process the stream (~8 seconds) before telling clients to load the URL
      setTimeout(async () => {
        try {
          await updateLiveClass(liveClass.id, { status: 'live' });
          console.log('[Broadcast Studio] Stream is now fully LIVE for clients');
        } catch (e) {
          console.warn('[Broadcast Studio] Failed to update live status:', e);
        }
      }, 8000);

    } catch (e: any) {
      console.warn('[Broadcast] Streaming start warning:', e);
      // Even if native fails, state is set so coach can retry/re-enter
    }
  };

  const handleStopBroadcast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('End Stream?', 'Are you sure you want to end this live class broadcast?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Broadcast',
        style: 'destructive',
        onPress: async () => {
          try {
            if (publisherRef.current) {
              await publisherRef.current.stopPublishing();
            }
            setIsBroadcasting(false);
            
            // Update status in DB
            if (liveClass) {
              await updateLiveClass(liveClass.id, { status: 'ended' });
            }
            
            // Open Recap Screen overlay
            setShowRecap(true);
          } catch (e: any) {
            showAlert({ type: 'error', title: 'Error', message: e.message || 'Could not stop stream.' });
          }
        }
      }
    ]);
  };

  const handleSaveToOnDemand = async () => {
    if (!liveClass) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSaving(true);

    try {
      let vodPlaybackUrl = liveClass.mux_playback_id && !liveClass.mux_playback_id.startsWith('playback_')
        ? `https://stream.mux.com/${liveClass.mux_playback_id}.m3u8`
        : '';

      // Enforce 3-Draft Limit for Live Stream VODs
      // Find existing drafts that came from Mux
      const muxDrafts = classes.filter(c => 
        c.status === 'draft' && 
        c.video_url?.includes('stream.mux.com')
      ).sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());

      if (muxDrafts.length >= 3) {
        // Delete the oldest draft to make room for the new one
        const oldestDraft = muxDrafts[0];
        try {
          await deleteClass(oldestDraft.id);
          console.log('[Broadcast Studio] Deleted oldest draft to enforce 3-draft limit:', oldestDraft.id);
        } catch (e) {
          console.warn('[Broadcast Studio] Failed to delete oldest draft:', e);
        }
      }

      await createClass({
        title: liveClass.title,
        description: liveClass.description || `Live stream recording from ${new Date().toLocaleDateString()}`,
        category: liveClass.category || 'Strength',
        tags: ['Live Recording', 'VOD'],
        difficulty: 'Intermediate',
        duration_minutes: liveClass.duration_minutes || 45,
        video_url: vodPlaybackUrl,
        equipment: [],
        is_free: false,
        status: 'draft',
      });

      showAlert({
        type: 'success',
        title: 'Saved to Library!',
        message: 'Your stream recording has been saved to your On-Demand Class library as a Draft.',
      });

      router.back();
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Could not save class to library.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (Platform.OS !== 'ios' || !ExpoCameraRtmpPublisherView) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xl }]}>
        <View style={styles.recapCard}>
          <Ionicons name="radio" size={48} color="#FFD700" style={{ marginBottom: 12 }} />
          <Text style={styles.recapTag}>IOS BROADCAST STUDIO</Text>
          <Text style={styles.recapTitle}>Camera Streaming</Text>
          <Text style={styles.recapSub}>
            Mobile camera live broadcasting via RTMP is supported on iOS devices. Android studio publisher support is coming soon!
          </Text>
          <TouchableOpacity style={styles.saveVodBtn} onPress={() => router.back()}>
            <Text style={styles.saveVodBtnText}>RETURN TO STUDIO</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === null || !liveClass) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#EF4444" size="large" />
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>No access to camera or microphone.</Text>
        <TouchableOpacity style={styles.backBtnAlt} onPress={() => router.back()}>
          <Text style={styles.backBtnAltText}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render Post-Stream Recap Overlay Screen
  if (showRecap) {
    return (
      <SafeAreaView style={styles.recapContainer}>
        <View style={styles.recapCard}>
          <View style={styles.recapIconWrap}>
            <Ionicons name="checkmark-circle" size={48} color="#FFD700" />
          </View>

          <Text style={styles.recapTag}>STREAM COMPLETED</Text>
          <Text style={styles.recapTitle}>{liveClass.title}</Text>
          <Text style={styles.recapSub}>Awesome session! Here is your quick broadcast summary.</Text>

          <View style={styles.recapStatsRow}>
            <View style={styles.recapStatBox}>
              <Text style={styles.recapStatLabel}>TOTAL VIEWS</Text>
              <Text style={styles.recapStatVal}>48</Text>
            </View>
            <View style={styles.recapStatDivider} />
            <View style={styles.recapStatBox}>
              <Text style={styles.recapStatLabel}>DURATION</Text>
              <Text style={styles.recapStatVal}>{liveClass.duration_minutes || 45}m</Text>
            </View>
            <View style={styles.recapStatDivider} />
            <View style={styles.recapStatBox}>
              <Text style={styles.recapStatLabel}>STATUS</Text>
              <Text style={[styles.recapStatVal, { color: '#4ADE80' }]}>SAVED</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveVodBtn}
            onPress={handleSaveToOnDemand}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <>
                <Ionicons name="library" size={18} color="#000000" />
                <Text style={styles.saveVodBtnText}>SAVE TO ON-DEMAND LIBRARY</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.discardBtn}
            onPress={() => router.back()}
            disabled={isSaving}
          >
            <Text style={styles.discardBtnText}>RETURN TO STUDIO</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Background Camera Layer */}
      <ExpoCameraRtmpPublisherView 
        ref={publisherRef}
        style={StyleSheet.absoluteFillObject} 
        cameraPosition={cameraPosition}
        muted={isMuted}
        onReady={() => setCameraReady(true)}
        onPublishStarted={() => setIsBroadcasting(true)}
        onPublishStopped={() => setIsBroadcasting(false)}
        onPublishError={(err: any) => {
          console.error('[Broadcast Studio] Publish error:', err);
          showAlert({ type: 'error', title: 'Publish Error', message: String(err) });
        }}
      />
      
      {/* Foreground UI Layer */}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity 
            onPress={() => {
              if (isBroadcasting) {
                Alert.alert('Leave Studio?', 'This will end your current broadcast.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'End & Leave', style: 'destructive', onPress: async () => {
                      try {
                        if (publisherRef.current) await publisherRef.current.stopPublishing();
                        if (liveClass) await updateLiveClass(liveClass.id, { status: 'ended' });
                      } catch(e) {}
                      router.back();
                  }}
                ]);
              } else {
                router.back();
              }
            }} 
            style={styles.iconBtn}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, isBroadcasting && { backgroundColor: '#EF4444' }]} />
            <Text style={styles.statusText}>{isBroadcasting ? 'LIVE' : 'READY'}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={toggleMute} style={[styles.iconBtn, isMuted && { backgroundColor: 'rgba(239, 68, 68, 0.8)' }]}>
              <Ionicons name={isMuted ? "mic-off" : "mic"} size={20} color="#FFFFFF" />
            </TouchableOpacity>
            
            <TouchableOpacity onPress={toggleCamera} style={styles.iconBtn}>
              <Ionicons name="camera-reverse-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Bar */}
        <View style={styles.bottomBar}>
          <View style={styles.classInfo}>
            <Text style={styles.classTitle}>{liveClass.title}</Text>
          </View>
          
          {!isBroadcasting ? (
            <TouchableOpacity style={styles.startBtn} onPress={handleStartBroadcast}>
              <Ionicons name="radio-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.startBtnText}>GO LIVE</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopBtn} onPress={handleStopBroadcast}>
              <Ionicons name="square" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.startBtnText}>END LIVE</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.2)', // Slight dim
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  statusText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  bottomBar: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  classInfo: {
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  classTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  startBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 18,
    borderRadius: Radius.xs,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  stopBtn: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 18,
    borderRadius: Radius.xs,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  startBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 1,
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
  },

  // Recap Screen Styles
  recapContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  recapCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  recapIconWrap: {
    marginBottom: Spacing.md,
  },
  recapTag: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 4,
  },
  recapTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  recapSub: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  recapStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: Radius.xs,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: Spacing.xl,
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  recapStatBox: {
    alignItems: 'center',
  },
  recapStatLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 8,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 2,
  },
  recapStatVal: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  recapStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  saveVodBtn: {
    backgroundColor: '#FFD700',
    width: '100%',
    paddingVertical: 16,
    borderRadius: Radius.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  saveVodBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#000000',
    letterSpacing: 1,
  },
  discardBtn: {
    paddingVertical: 10,
  },
  discardBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
});
