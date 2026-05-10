/**
 * FitLink Design System — React Native
 * Theme-agnostic tokens (spacing, radius, fonts).
 * Color palettes live in context/ThemeContext.tsx.
 * 
 * The `Colors` export is kept as the LIGHT palette for backward compatibility
 * during migration. New code should use `useTheme().colors` instead.
 */

// Re-export color palettes from ThemeContext for convenience
export { LightColors, DarkColors } from '../context/ThemeContext';
export type { ThemeColors } from '../context/ThemeContext';

// Default Colors export = light palette (backward compat)
import { LightColors } from '../context/ThemeContext';
export const Colors = LightColors;

export const Spacing = {
  '2xs': 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
};

export const Radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 26,
  '3xl': 32,
};

export const FontFamily = {
  body: 'Epilogue-Regular',
  bodyMedium: 'Epilogue-Medium',
  bodySemiBold: 'Epilogue-SemiBold',
  bodyBold: 'Epilogue-Bold',
  heading: 'Epilogue-Bold',
  headingSemiBold: 'Epilogue-SemiBold',
  headingExtraBold: 'Epilogue-ExtraBold',
};

// Avatar color palette — warm pastels
const AVATAR_COLORS = [
  '#FF8A65', '#4DB6AC', '#64B5F6', '#AED581',
  '#FFD54F', '#CE93D8', '#80CBC4', '#FFB74D',
  '#9FA8DA', '#81C784', '#F48FB1', '#A1887F',
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
