import { View, StyleSheet } from 'react-native';

interface DividerProps {
  /** Vertical margin above and below the line */
  spacing?: number;
  /** Color of the divider line */
  color?: string;
}

/**
 * Thin hairline divider used between content sections.
 * Replaces the repeated inline pattern across 10+ screens.
 */
export default function Divider({
  spacing = 28,
  color = 'rgba(255,255,255,0.1)',
}: DividerProps) {
  return (
    <View
      style={[s.line, { marginVertical: spacing, backgroundColor: color }]}
      accessible={false}
    />
  );
}

const s = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
  },
});
