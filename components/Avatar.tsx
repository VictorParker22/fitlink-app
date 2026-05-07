import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, FontFamily, FontSize } from '../constants/theme';
import { getAvatarColor } from '../constants/theme';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = {
  sm: { container: 32, font: 11 },
  md: { container: 40, font: 12 },
  lg: { container: 52, font: 17 },
  xl: { container: 72, font: 24 },
};

export default function Avatar({ name, size = 'md' }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const { container, font } = SIZES[size];
  const bgColor = getAvatarColor(name);

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
  text: {
    fontFamily: FontFamily.bodyBold,
    color: Colors.white,
  },
});
