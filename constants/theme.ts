/**
 * FitLink Design System — React Native
 * Matches the web version's warm dark theme with coral accent.
 */

export const Colors = {
  // Surfaces
  bgPrimary: '#111114',
  bgSecondary: '#1C1C21',
  bgCard: '#1C1C21',
  bgElevated: '#26262D',
  bgInput: '#1C1C21',
  bgHover: '#2A2A33',
  bgOverlay: 'rgba(0, 0, 0, 0.65)',

  // Accent
  accent: '#FF5F3B',
  accentSoft: 'rgba(255, 95, 59, 0.12)',
  accentHover: '#FF7A5C',
  accentText: '#FF5F3B',

  // Semantic
  green: '#34C759',
  greenSoft: 'rgba(52, 199, 89, 0.12)',
  blue: '#5B8DEF',
  blueSoft: 'rgba(91, 141, 239, 0.12)',
  yellow: '#FFD60A',
  yellowSoft: 'rgba(255, 214, 10, 0.12)',
  red: '#FF453A',
  redSoft: 'rgba(255, 69, 58, 0.12)',
  purple: '#BF5AF2',
  purpleSoft: 'rgba(191, 90, 242, 0.12)',
  teal: '#30D5C8',
  tealSoft: 'rgba(48, 213, 200, 0.12)',

  // Text
  textPrimary: '#FAFAFA',
  textSecondary: '#8E8E93',
  textTertiary: '#636366',
  textInverse: '#111114',

  // Borders
  border: 'rgba(255,255,255, 0.06)',
  borderStrong: 'rgba(255,255,255, 0.1)',

  white: '#FFFFFF',
  black: '#000000',
};

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
  base: 13,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
};

export const FontFamily = {
  body: 'DMSans',
  bodyMedium: 'DMSans-Medium',
  bodySemiBold: 'DMSans-SemiBold',
  bodyBold: 'DMSans-Bold',
  heading: 'PlusJakartaSans-Bold',
  headingSemiBold: 'PlusJakartaSans-SemiBold',
  headingExtraBold: 'PlusJakartaSans-ExtraBold',
};

// Avatar color palette — deterministic by name
const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
