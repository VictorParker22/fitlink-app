import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native';
import { Radius } from '../constants/theme';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  full?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
}

const variantStyles: Record<string, ViewStyle> = {
  primary: { backgroundColor: CoachColors.accent },
  secondary: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: CoachColors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: CoachColors.dangerSoft },
};

const textColors: Record<string, string> = {
  primary: CoachColors.onAccent,
  secondary: CoachColors.textPrimary,
  outline: CoachColors.textPrimary,
  ghost: CoachColors.textSecondary,
  danger: CoachColors.danger,
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  full = false,
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const sizeStyles: Record<string, ViewStyle> = {
    sm: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.sm },
    md: { paddingVertical: 10, paddingHorizontal: 20 },
    lg: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: Radius.lg },
  };

  const textSizes: Record<string, number> = {
    sm: 13,
    md: 17,
    lg: 18,
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
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? CoachColors.onAccent : variant === 'danger' ? CoachColors.danger : CoachColors.accent}
        />
      ) : (
        <>
          {icon && iconPosition !== 'right' && icon}
          <Text style={[styles.text, { color: textColors[variant], fontSize: textSizes[size] }, textStyle]}>
            {title}
          </Text>
          {icon && iconPosition === 'right' && icon}
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
    fontFamily: CoachFonts.bodySemiBold,
  },
});
