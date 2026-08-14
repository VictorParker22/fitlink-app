import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Radius } from '../constants/theme';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  imageUrl?: string | null;
  shape?: 'circle' | 'square';
  style?: any;
}

const SIZES = {
  sm: { container: 32, font: 11 },
  md: { container: 40, font: 12 },
  lg: { container: 52, font: 17 },
  xl: { container: 72, font: 24 },
};

export default function Avatar({ name, size = 'md', imageUrl, shape = 'circle', style }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const { container, font } = SIZES[size];
  const borderRadius = shape === 'square' ? Radius.xs : container / 2;

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        cachePolicy="memory-disk"
        transition={200}
        style={[styles.image, { width: container, height: container, borderRadius, backgroundColor: CoachColors.surface }, style]}
      />
    );
  }

  return (
    <View style={[styles.container, { width: container, height: container, borderRadius }, style]}>
      <Text style={[styles.text, { fontSize: font }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  image: {},
  text: {
    fontFamily: CoachFonts.bodyBold,
    color: CoachColors.accent,
  },
});
