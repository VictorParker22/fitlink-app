/**
 * mealColor.ts — one sampled photo colour → a guaranteed-readable card palette.
 *
 * The Food tab's recipe cards are monochromatic: the whole card is shades of a
 * single hue lifted from the dish photo. A photo can be anything, though — a
 * near-black steak, a blown-out white yoghurt, a neon sports drink — so the raw
 * sample is never trusted. It is normalised into a soft-pastel band, then the
 * result is CHECKED with real WCAG 2.1 maths and corrected until it passes.
 *
 * Guarantees held by `mealPalette`:
 *   • `ink` on `bg`        ≥ 4.5:1  (the oversized title)
 *   • `inkSoft` on `bg`    ≥ 4.5:1  (the meta line — small text, so it is held
 *                                    to the same bar rather than the 3:1 that
 *                                    large text would allow)
 *   • `buttonInk` on `buttonBg` ≥ 4.5:1  (the arrow glyph)
 *   • `swapBg` composites white over `bg`, so it is strictly LIGHTER than `bg`
 *     and `ink` on it is therefore strictly better than `ink` on `bg`.
 * If any of those cannot be reached, the whole palette is discarded and the
 * app's normal dark surface is returned instead (`tinted: false`).
 */

import { CoachColors } from '../constants/coachDesign';

export interface MealPalette {
  /** Card fill — one soft, pale shade of the sampled hue. */
  bg: string;
  /** Title colour — the same hue, dark. */
  ink: string;
  /** Meta line — the same hue, dark, lower emphasis. */
  inkSoft: string;
  /** Circular arrow button fill — the same hue, darker still. */
  buttonBg: string;
  /** Arrow glyph on `buttonBg`. */
  buttonInk: string;
  /** Circular swap button fill — translucent white over the card. */
  swapBg: string;
  /** False when this is the neutral fallback rather than a photo tint. */
  tinted: boolean;
}

// ─── The honest default ───────────────────────────────────────────────────────
// No photo, extraction failed, or no palette could clear 4.5:1. This is the
// app's ordinary card system, so it reads as deliberate, not broken.

export const FALLBACK_PALETTE: MealPalette = {
  bg: CoachColors.surface,
  ink: CoachColors.textPrimary,
  inkSoft: CoachColors.textSecondary,
  buttonBg: CoachColors.accent,
  buttonInk: CoachColors.onAccent,
  swapBg: 'rgba(237,239,232,0.10)',
  tinted: false,
};

// ─── Colour conversion ────────────────────────────────────────────────────────

export interface RGB { r: number; g: number; b: number } // 0-255

/**
 * Parse `#RGB`, `#RRGGBB` or `#AARRGGBB`. The 8-digit form is what Android's
 * palette API hands back (alpha FIRST — not the CSS `#RRGGBBAA` order), so the
 * leading pair is dropped rather than read as blue.
 */
export function hexToRgb(hex: string | null | undefined): RGB | null {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(h)) return null;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  else if (h.length === 8) h = h.slice(2); // AARRGGBB → RRGGBB
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const to255 = (n: number) => Math.round(clamp01(n) * 255);

export function rgbToHex({ r, g, b }: RGB): string {
  const p = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

export interface HSL { h: number; s: number; l: number } // h 0-360, s/l 0-1

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = h * 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * clamp01(l) - 1)) * clamp01(s);
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = clamp01(l) - c / 2;
  let r = 0, g = 0, b = 0;
  if (hh < 60) { r = c; g = x; }
  else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; }
  else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: to255(r + m), g: to255(g + m), b: to255(b + m) };
}

const hslToHex = (h: number, s: number, l: number) => rgbToHex(hslToRgb({ h, s, l }));

// ─── WCAG 2.1 contrast ────────────────────────────────────────────────────────

/** Relative luminance, WCAG 2.1 §relativeluminancedef. */
export function relativeLuminance(rgb: RGB): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Contrast ratio between two opaque colours, 1 → 21. Returns 0 when either
 * colour cannot be parsed, so an unparseable pair can never be mistaken for a
 * pass. Both hex strings and already-parsed RGB are accepted.
 */
export function contrastRatio(a: string | RGB, b: string | RGB): number {
  const rgbA = typeof a === 'string' ? hexToRgb(a) : a;
  const rgbB = typeof b === 'string' ? hexToRgb(b) : b;
  if (!rgbA || !rgbB) return 0;
  const lA = relativeLuminance(rgbA);
  const lB = relativeLuminance(rgbB);
  const light = Math.max(lA, lB);
  const dark = Math.min(lA, lB);
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG AA for body text. */
export const AA_TEXT = 4.5;

// ─── Normalisation band ───────────────────────────────────────────────────────
// The reference cards are pale and calm. A garish or muddy sample is pulled
// into this band before anything else happens, so the card is always a soft
// pastel regardless of what the photo actually looked like.

const BG_L = 0.87;          // card fill lightness
const BG_S_MIN = 0.16;      // never fully grey — an achromatic photo still tints
const BG_S_MAX = 0.50;      // never garish

const INK_S_MIN = 0.28;
const INK_S_MAX = 0.62;
const INK_L_START = 0.26;
const INK_SOFT_L_START = 0.42;

const BUTTON_L_START = 0.34;
const BUTTON_INK_S = 0.24;
const BUTTON_INK_L = 0.95;

const STEP = 0.02;

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/** Walk lightness DOWN from `startL` until the colour clears `target` on `on`. */
function darkenUntilPasses(h: number, s: number, startL: number, on: string, target = AA_TEXT): string | null {
  for (let l = startL; l >= -1e-9; l -= STEP) {
    const hex = hslToHex(h, s, Math.max(0, l));
    if (contrastRatio(hex, on) >= target) return hex;
  }
  return null;
}

/** Walk lightness UP from `startL` until the colour clears `target` on `on`. */
function lightenUntilPasses(h: number, s: number, startL: number, on: string, target = AA_TEXT): string | null {
  for (let l = startL; l <= 1 + 1e-9; l += STEP) {
    const hex = hslToHex(h, s, Math.min(1, l));
    if (contrastRatio(hex, on) >= target) return hex;
  }
  return null;
}

const cache = new Map<string, MealPalette>();

/**
 * Build a card palette from a colour sampled out of the dish photo.
 * Pass null (or anything unparseable) to get the neutral fallback.
 */
export function mealPalette(sampled: string | null | undefined): MealPalette {
  if (!sampled) return FALLBACK_PALETTE;
  const key = sampled.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const rgb = hexToRgb(sampled);
  if (!rgb) return FALLBACK_PALETTE;

  const { h, s } = rgbToHsl(rgb);

  // 1. Card fill: the sampled hue, saturation clamped into the pastel band,
  //    lightness pinned to the band regardless of how dark the photo was.
  const bgS = clamp(s, BG_S_MIN, BG_S_MAX);
  const bg = hslToHex(h, bgS, BG_L);

  // 2. Ink: same hue, richer, dark — then verified and darkened until it passes.
  const inkS = clamp(s, INK_S_MIN, INK_S_MAX);
  const ink = darkenUntilPasses(h, inkS, INK_L_START, bg);
  if (!ink) return FALLBACK_PALETTE;

  // 3. Meta line: the same treatment, starting lighter. If it has to be driven
  //    all the way down to `ink` to pass, it simply becomes `ink`.
  const inkSoftCandidate = darkenUntilPasses(h, inkS * 0.85, INK_SOFT_L_START, bg);
  const inkSoft = inkSoftCandidate ?? ink;

  // 4. Arrow button: mid-dark fill with a near-white glyph of the same hue.
  const buttonInk = hslToHex(h, BUTTON_INK_S, BUTTON_INK_L);
  const buttonBg = darkenUntilPasses(h, inkS, BUTTON_L_START, buttonInk);
  if (!buttonBg) {
    // Extremely unlikely (near-white on a mid tone), but rather than ship an
    // unreadable glyph, try lifting the glyph instead before giving up.
    const lifted = lightenUntilPasses(h, BUTTON_INK_S, BUTTON_INK_L, hslToHex(h, inkS, BUTTON_L_START));
    if (!lifted) return FALLBACK_PALETTE;
    const palette: MealPalette = {
      bg, ink, inkSoft,
      buttonBg: hslToHex(h, inkS, BUTTON_L_START),
      buttonInk: lifted,
      swapBg: 'rgba(255,255,255,0.55)',
      tinted: true,
    };
    cache.set(key, palette);
    return palette;
  }

  const palette: MealPalette = {
    bg,
    ink,
    inkSoft,
    buttonBg,
    buttonInk,
    // White at 55% over a pale card is lighter than the card, so dark `ink`
    // sitting on it is always at least as readable as `ink` on `bg`.
    swapBg: 'rgba(255,255,255,0.55)',
    tinted: true,
  };
  cache.set(key, palette);
  return palette;
}
