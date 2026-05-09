import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, Radius, FontFamily } from '../constants/theme';
import { getAvatarColor } from '../constants/theme';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  imageUrl?: string | null;
}

const SIZES = {
  sm: { container: 32, font: 11 },
  md: { container: 40, font: 12 },
  lg: { container: 52, font: 17 },
  xl: { container: 72, font: 24 },
};

export default function Avatar({ name, size = 'md', imageUrl }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const { container, font } = SIZES[size];
  const bgColor = getAvatarColor(name);

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.image, { width: container, height: container, borderRadius: container / 2 }]}
      />
    );
  }

  return (
    <View style={[styles.container, { width: container, height: container, backgroundColor: bgColor }]}>
      <Text style={[styles.text, { fontSize: font }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    backgroundColor: Colors.bgSecondary,
  },
  text: {
    fontFamily: FontFamily.bodyBold,
    color: Colors.white,
  },
});
