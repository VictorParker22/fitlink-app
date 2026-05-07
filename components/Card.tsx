import { View, StyleSheet, type ViewStyle, type PropsWithChildren } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

interface CardProps extends PropsWithChildren {
  style?: ViewStyle;
  noPadding?: boolean;
}

export default function Card({ children, style, noPadding }: CardProps) {
  return (
    <View style={[styles.card, noPadding && styles.noPadding, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  noPadding: {
    padding: 0,
  },
});
