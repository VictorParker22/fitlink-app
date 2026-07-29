import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image as RNImage } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { proxyGifUrl } from '../../../lib/exercisedb';
import { FontFamily, Radius, Spacing } from '../../../constants/theme';

interface ExerciseMediaDemoProps {
  imageUrl?: string;
  videoUrl?: string;
  exerciseName?: string;
  onPlayVideo?: (url: string, name?: string) => void;
}

const ExerciseVideoPlayer = ({ url }: { url: string }) => {
  const player = useVideoPlayer(url, p => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView 
      player={player} 
      style={styles.inlineVideo} 
      nativeControls={false}
      contentFit="cover"
    />
  );
};

export default function ExerciseMediaDemo({
  imageUrl,
  videoUrl,
  exerciseName,
  onPlayVideo,
}: ExerciseMediaDemoProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (videoUrl) {
    const isExternal = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') || videoUrl.includes('instagram.com') || videoUrl.includes('tiktok.com');
    
    if (isExternal && onPlayVideo) {
      return (
        <View style={{ marginBottom: Spacing.xl }}>
          <TouchableOpacity 
            style={styles.watchVideoBtn} 
            onPress={() => onPlayVideo(videoUrl, exerciseName)}
          >
            <Ionicons name="play-circle" size={18} color="#FFFFFF" />
            <Text style={styles.watchVideoText}>Watch Demo Video</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    return <ExerciseVideoPlayer url={videoUrl} />;
  }
  
  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <View style={styles.gifWrapper}>
        <RNImage 
          source={{ uri: proxyGifUrl(imageUrl) || '' }} 
          style={styles.gifImage} 
          resizeMode="cover"
          onError={() => setFailedUrl(imageUrl)}
        />
        <View style={styles.gifOverlay}>
          <Text style={styles.gifOverlayText}>ExerciseDB Demo</Text>
        </View>
      </View>
    );
  }
  
  return null;
}

const styles = StyleSheet.create({
  inlineVideo: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: Spacing.xl,
  },
  watchVideoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#1C1C1E',
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  watchVideoText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  gifWrapper: {
    width: '100%',
    height: 200,
    marginBottom: Spacing.xl,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000000',
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  gifOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  gifOverlayText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
});
