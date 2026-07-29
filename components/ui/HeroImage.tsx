import { View, StyleSheet, Dimensions, ColorValue } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_W = Dimensions.get('window').width;

const DEFAULT_COLORS: [ColorValue, ColorValue, ...ColorValue[]] = ['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.85)', '#000'];
const DEFAULT_LOCATIONS: [number, number, ...number[]] = [0, 0.25, 0.75, 1];

interface HeroImageProps {
  /** URL of the hero image */
  uri: string;
  /** Height of the hero section (default 300) */
  height?: number;
  /** Gradient colors for the overlay (default: dark vignette) */
  gradientColors?: [ColorValue, ColorValue, ...ColorValue[]];
  /** Gradient positions */
  gradientLocations?: [number, number, ...number[]];
  /** Content to render inside the hero (typically navigation buttons) */
  children?: React.ReactNode;
}

/**
 * Full-width hero image with gradient overlay and safe-area children.
 * Used in programs, program-detail, strength-session, class-detail, collection-detail.
 */
export default function HeroImage({
  uri,
  height = 300,
  gradientColors,
  gradientLocations,
  children,
}: HeroImageProps) {
  return (
    <View style={[s.hero, { height }]} accessible={false}>
      <Image
        source={{ uri }}
        style={s.image}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
      />
      <LinearGradient
        colors={gradientColors || DEFAULT_COLORS}
        locations={gradientLocations || DEFAULT_LOCATIONS}
        style={StyleSheet.absoluteFill}
      />
      {children && (
        <SafeAreaView style={s.overlay} edges={['top']}>
          {children}
        </SafeAreaView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  hero: {
    width: SCREEN_W,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
