/**
 * onboardingDesign — tokens for the editorial onboarding (canvas "FitLink
 * Arrival", 2026-09-03). Colours are the app's CoachColors; what is new
 * here is the type: Instrument Serif for the one headline per screen,
 * Manrope for everything else, JetBrains Mono for the step counter.
 *
 * Scope: app/(auth)/welcome, role, intake, coach-intake, account only.
 * The rest of the app stays on Space Grotesk + Epilogue.
 */
import { CoachColors } from './coachDesign';

export const OB = {
  bg: CoachColors.bg,
  surface: CoachColors.surface,
  raised: '#1F2320',
  glass: 'rgba(24,27,23,0.82)',
  line: CoachColors.borderMuted,
  lineStrong: CoachColors.border,
  fg: CoachColors.textPrimary,
  muted: CoachColors.textSecondary,
  faint: CoachColors.textMuted,
  accent: CoachColors.accent,
  accentSoft: CoachColors.accentSoft,
  onAccent: CoachColors.onAccent,
  danger: CoachColors.danger,
} as const;

export const OBFonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  sans: 'Manrope_400Regular',
  sansMedium: 'Manrope_500Medium',
  sansSemiBold: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
  mono: 'JetBrainsMono_500Medium',
} as const;

export const OBRadius = { s: 8, m: 14, l: 22, pill: 999 } as const;
export const OBSpace = { screen: 24, gap: 10 } as const;
export const OBMotion = {
  screen: 320,
  select: 160,
  press: 90,
  monogram: 1100,
  reveal: 600,
  stagger: 60,
  reduced: 200,
} as const;
