import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { proxyGifStill } from '../../../lib/exercisedb';
import { Radius } from '../../../constants/theme';

interface ExerciseThumbnailProps {
  imageUrl?: string;
  hasVideo?: boolean;
  size?: number;
  iconColor?: string;
  onPress?: () => void;
}

export default function ExerciseThumbnail({
  imageUrl,
  hasVideo = false,
  size = 44,
  iconColor = '#FF6B35',
  onPress,
}: ExerciseThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const renderContent = () => {
    if (imageUrl && failedUrl !== imageUrl) {
      return (
        <View style={{ width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden' }}>
          <Image
            source={proxyGifStill(imageUrl)}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="disk"
            onError={() => setFailedUrl(imageUrl)}
          />
        </View>
      );
    }
    
    return (
      <View style={[styles.fallback, { backgroundColor: `${iconColor}1A`, borderColor: `${iconColor}33` }]}>
        <Ionicons name="barbell-outline" size={size * 0.45} color={iconColor} />
      </View>
    );
  };

  const Wrapper = onPress ? TouchableOpacity : View;
  
  return (
    <Wrapper 
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.container, { width: size, height: size }]}
    >
      {renderContent()}
      
      {hasVideo && (
        <View style={styles.miniPlayIcon}>
          <Ionicons name="play" size={size * 0.22} color="#FFFFFF" />
        </View>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  fallback: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: '36%',
    height: '36%',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
