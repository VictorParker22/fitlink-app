/**
 * FitLink Design System — React Native
 * Light theme inspired by modern SaaS design with soft pastels.
 * Font: Epilogue (Tyler Finck) — geometric, clean, professional.
 */

export const Colors = {
  // Surfaces — light, airy foundation
  bgPrimary: '#FAFBFC',
  bgSecondary: '#F1F3F5',
  bgCard: '#FFFFFF',
  bgElevated: '#F8F9FA',
  bgInput: '#F1F3F5',
  bgHover: '#ECEEF0',
  bgOverlay: 'rgba(0, 0, 0, 0.45)',

  // Accent — warm orange (carried from brand)
  accent: '#FF6B35',
  accentSoft: '#FFF0E8',
  accentHover: '#FF8255',
  accentText: '#E85D2A',

  // Semantic — softer, pastel-friendly
  green: '#22C55E',
  greenSoft: '#DCFCE7',
  blue: '#6C9BF2',
  blueSoft: '#DBEAFE',
  yellow: '#F59E0B',
  yellowSoft: '#FEF3C7',
  red: '#EF4444',
  redSoft: '#FEE2E2',
  purple: '#A78BFA',
  purpleSoft: '#EDE9FE',
  teal: '#14B8A6',
  tealSoft: '#CCFBF1',

  // Pastel card fills (from reference)
  peach: '#FDDCB5',
  lavender: '#C7D4F5',
  mint: '#D5E8A8',
  lilac: '#E0D4F5',

  // Text — dark on light
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Borders — subtle gray
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

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
