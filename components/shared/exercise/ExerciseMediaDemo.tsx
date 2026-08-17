import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image as RNImage } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { proxyGifUrl } from '../../../lib/exercisedb';
import { Radius, Spacing } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

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
          <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} 
            style={styles.watchVideoBtn} 
            onPress={() => onPlayVideo(videoUrl, exerciseName)}
          >
            <Ionicons name="play-circle" size={20} color={CoachColors.textPrimary} />
            <Text style={styles.watchVideoText}>Watch demo video</Text>
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
          // `contain`, never `cover`. These are demonstrations of a movement:
          // cover was cropping the bar, the feet, or the top of the lift out of
          // frame to fill a 200pt letterbox, which is the one thing a demo
          // cannot afford. Letterbox bars are cheaper than a cropped rep.
          resizeMode="contain"
          onError={() => setFailedUrl(imageUrl)}
        />
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
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    marginBottom: Spacing.xl,
  },
  watchVideoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  watchVideoText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
  },
  gifWrapper: {
    width: '100%',
    // Square rather than a fixed 200pt band: the source GIFs are square, so
    // this is the largest the demo can be with nothing cropped and no wasted
    // letterbox. A fixed height either cropped it or floated it in a gap.
    aspectRatio: 1,
    marginBottom: Spacing.xl,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: CoachColors.bg,
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
});
