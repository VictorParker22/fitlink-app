/**
 * motion — the one timing scale (roast 2026-09-04, section 4).
 *
 * Before this file the app carried over a hundred distinct durations and six
 * easing families. Four durations, two easings and one spring cover every
 * case; the exception (the onboarding monogram draw, 1100 ms) is named so it
 * stays an exception. Reduce Motion: use `reduced` for everything.
 *
 *   instant  120  selection state, chip fill, toggle
 *   quick    200  crossfade, one row revealing, the Reduce Motion fallback
 *   screen   320  step change, sheet rise, card enter
 *   moment   600  celebration, arrival reveal
 */
import { Easing } from 'react-native-reanimated';

export const Motion = {
  instant: 120,
  quick: 200,
  screen: 320,
  moment: 600,
  monogram: 1100,
  /** With Reduce Motion on, anything that still needs a transition crossfades this fast. */
  reduced: 200,
} as const;

export const Ease = {
  /** Anything entering. */
  out: Easing.out(Easing.cubic),
  /** Anything moving between two resting places. */
  inOut: Easing.inOut(Easing.quad),
} as const;

/** Sheets, drags, anything the finger controls. */
export const SpringGesture = { damping: 18, stiffness: 180, mass: 1 } as const;

/**
 * Haptic vocabulary (roast section 4). Import the moment, not the engine, so
 * a screen cannot invent a new feeling.
 *
 *   select     selection      chip, row, tab, segment
 *   start      impact medium  session started
 *   done       success        set completed, workout finished, purchase
 *   record     success (once) personal record
 *   destroy    impact heavy   the destructive confirm button only
 *   fail       error          an error the user must act on
 *   none       scroll, tab press, expand, collapse, refresh
 */
export type HapticMoment = 'select' | 'start' | 'done' | 'record' | 'destroy' | 'fail';
