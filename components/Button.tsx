import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native';
import { Colors, Radius, FontFamily, FontSize, Spacing } from '../constants/theme';

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
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}`],
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
          color={variant === 'primary' || variant === 'danger' ? Colors.white : Colors.accent}
        />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`], textStyle]}>
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

  // Variants
  primary: {
    backgroundColor: Colors.accent,
  },
  secondary: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 95, 59, 0.3)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: Colors.redSoft,
  },

  // Sizes
  size_sm: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
  },
  size_md: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  size_lg: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: Radius.lg,
  },

  full: {
    width: '100%',
  },

  disabled: {
    opacity: 0.6,
  },

  // Text
  text: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.base,
  },
  text_primary: {
    color: Colors.white,
  },
  text_secondary: {
    color: Colors.textPrimary,
  },
  text_outline: {
    color: Colors.accentText,
  },
  text_ghost: {
    color: Colors.textSecondary,
  },
  text_danger: {
    color: Colors.red,
  },

  textSize_sm: {
    fontSize: FontSize.xs,
  },
  textSize_md: {
    fontSize: FontSize.base,
  },
  textSize_lg: {
    fontSize: FontSize.md,
  },
});
