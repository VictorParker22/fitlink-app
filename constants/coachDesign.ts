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
  // WCAG AA: the faintest tier must still clear 4.5:1 as body text on both
  // `bg` and `surface`. #6C7266 measured 3.80:1 / 3.51:1 — a real failure at
  // the 11-13px sizes it is used at. Lightened along the same hue to #7D8477
  // (4.87:1 on bg, 4.50:1 on surface) — the minimum that passes.
  textFaint: '#7D8477',

  // Nudged up from #E05C5C so danger text on `dangerSoft` inside a `surface`
  // card clears 4.5:1 (was 4.12:1). Visually near-identical.
  danger: '#EB6161',
  // Deliberately still keyed to the old #E05C5C: keeping this tint darker is
  // what buys `danger` its 4.51:1 on top of it. Do not re-derive from `danger`.
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
