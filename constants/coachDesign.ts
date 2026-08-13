/**
 * FitLink Coach Dashboard Redesign — shared tokens.
 *
 * The redesign (claude.ai/design project "Fitlink Coach Dashboard Redesign")
 * is a fixed dark palette with a single lime accent — it does not participate
 * in the light/dark ThemeContext toggle, which remains in place for the
 * athlete-facing (client-tabs) screens. Coach screens (app/(tabs)/**, and the
 * coach flows under app/) import from here directly instead of useTheme().
 */

export const CoachColors = {
  bg: '#101210',
  surface: '#181B17',
  surfaceRaised: 'rgba(24,27,23,0.9)',
  border: '#33382F',
  borderMuted: '#262A24',

  accent: '#C6F24E',
  accentSoft: 'rgba(198,242,78,0.14)',
  accentSofter: 'rgba(198,242,78,0.07)',

  textPrimary: '#EDEFE8',
  textSecondary: '#9BA095',
  textMuted: '#8A8F85',
  textFaint: '#6C7266',

  danger: '#E05C5C',
  dangerSoft: 'rgba(224,92,92,0.14)',
  warning: '#E0B84E',
  warningSoft: 'rgba(224,184,78,0.14)',

  onAccent: '#101210',
};

export const CoachFonts = {
  headingBold: 'SpaceGrotesk_700Bold',
  headingSemiBold: 'SpaceGrotesk_600SemiBold',
  body: 'Epilogue-Regular',
  bodyMedium: 'Epilogue-Medium',
  bodySemiBold: 'Epilogue-SemiBold',
  bodyBold: 'Epilogue-Bold',
  mono: 'JetBrainsMono_500Medium',
};
