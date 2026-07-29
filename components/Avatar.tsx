import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Radius, FontFamily, getAvatarColor } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

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
  const { colors } = useTheme();

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const { container, font } = SIZES[size];
  const bgColor = getAvatarColor(name);
  const borderRadius = shape === 'square' ? Radius.xs : container / 2;

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        cachePolicy="memory-disk"
        transition={200}
        style={[styles.image, { width: container, height: container, borderRadius, backgroundColor: colors.bgSecondary }, style]}
      />
    );
  }

  return (
    <View style={[styles.container, { width: container, height: container, backgroundColor: bgColor, borderRadius }, style]}>
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
  image: {},
  text: {
    fontFamily: FontFamily.bodyBold,
    color: '#FFFFFF',
  },
});
