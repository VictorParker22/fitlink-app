import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Radius, FontFamily, FontSize } from '../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  full?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  full = false,
  style,
  textStyle,
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const variantStyles: Record<string, ViewStyle> = {
    primary: { backgroundColor: colors.accent },
    secondary: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
    outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255, 95, 59, 0.3)' },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.redSoft },
  };

  const textColors: Record<string, string> = {
    primary: colors.white,
    secondary: colors.textPrimary,
    outline: colors.accentText,
    ghost: colors.textSecondary,
    danger: colors.red,
  };

  const sizeStyles: Record<string, ViewStyle> = {
    sm: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.sm },
    md: { paddingVertical: 10, paddingHorizontal: 20 },
    lg: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: Radius.lg },
  };

  const textSizes: Record<string, number> = {
    sm: FontSize.xs,
    md: FontSize.base,
    lg: FontSize.md,
  };

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        full && styles.full,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#FFFFFF' : colors.accent}
        />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: textColors[variant], fontSize: textSizes[size] }, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.md,
  },
  full: {
    width: '100%',
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.base,
  },
});
