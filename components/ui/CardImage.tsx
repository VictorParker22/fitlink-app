/**
 * CardImage — the one way imagery sits inside a card (DESIGN.md § Imagery).
 *
 * expo-image fill + the sanctioned scrim so text laid over it always reads.
 * Two scrims: 'gradient' (transparent → bg toward the bottom text edge) and
 * 'veil' (flat wash for full-card labels). Radius/clip belong to the PARENT
 * card — this fills whatever rounded container it's placed in.
 *
 *   <View style={{ borderRadius: 16, borderCurve: 'continuous', overflow: 'hidden' }}>
 *     <CardImage source={require('.../card-new-workout.jpg')} />
 *     <Text>…label…</Text>
 *   </View>
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

// CoachColors.bg (#101210) with alpha — the only sanctioned raw colors for
// scrims (DESIGN.md § Imagery).
const BG_CLEAR = 'rgba(16,18,16,0)';
const BG_DEEP = 'rgba(16,18,16,0.88)';
const BG_VEIL = 'rgba(16,18,16,0.55)';

interface CardImageProps {
  source: ImageSource | number;
  /** 'gradient' fades toward the bottom text edge; 'veil' is a flat wash. */
  scrim?: 'gradient' | 'veil' | 'none';
  /** Stable identity for list recycling (FlashList/FlatList). */
  recyclingKey?: string;
  /** Extra darkening on top of the scrim, 0–1, for unusually bright shots. */
  extraShade?: number;
}

export default function CardImage({ source, scrim = 'gradient', recyclingKey, extraShade = 0 }: CardImageProps) {
  return (
    <>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={180}
        recyclingKey={recyclingKey}
        accessible={false}
      />
      {scrim === 'gradient' && (
        <LinearGradient
          colors={[BG_CLEAR, BG_DEEP]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      {scrim === 'veil' && (
        <LinearGradient
          colors={[BG_VEIL, BG_VEIL]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      {extraShade > 0 && (
        <LinearGradient
          colors={[`rgba(16,18,16,${extraShade})`, `rgba(16,18,16,${extraShade})`]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
    </>
  );
}
