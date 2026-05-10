import { View, StyleSheet, type ViewStyle, type PropsWithChildren } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Radius, Spacing } from '../constants/theme';

interface CardProps extends PropsWithChildren {
  style?: ViewStyle;
  noPadding?: boolean;
}

export default function Card({ children, style, noPadding }: CardProps) {
  const { colors } = useTheme();

  return (
    <View style={[
      { backgroundColor: colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.base },
      noPadding && { padding: 0 },
      style,
    ]}>
      {children}
    </View>
  );
}
