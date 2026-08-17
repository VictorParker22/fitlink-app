/**
 * mealImageColor.ts — where a meal card's tint comes from.
 *
 * Sampling a photo is native work on a downloaded bitmap, so it happens as
 * rarely as possible:
 *
 *   1. `meals.image_color` — already sampled by somebody, anywhere. No work.
 *   2. AsyncStorage, keyed by image URL — this device has seen it before.
 *   3. Native extraction, then the hex is written BACK to `meals.image_color`
 *      so every other device and every other user skips straight to step 1.
 *
 * Nothing here can block or break a render: the hook returns null until a
 * colour exists, and the card draws its neutral fallback in the meantime
 * (never a flash of tint-then-different-tint). A failed extraction is cached
 * as a miss so the same photo is never sampled twice on one device.
 */

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImageColorsResult } from 'react-native-image-colors';
import { supabase } from './supabase';

/**
 * react-native-image-colors resolves its native module AT IMPORT TIME and
 * throws when it is absent — which is exactly the state of any build made
 * before this package landed (and of Expo Go). A static import would take the
 * whole Food tab down with it, so the module is required lazily behind a
 * try/catch and a missing native module simply means "no tint, ever".
 */
type GetColors = (uri: string, config?: Record<string, unknown>) => Promise<ImageColorsResult>;
let getColorsFn: GetColors | null | undefined;

function loadGetColors(): GetColors | null {
  if (getColorsFn !== undefined) return getColorsFn;
  // Probe for the native module BEFORE requiring the package. The package's
  // module factory calls requireNativeModule('ImageColors') at import time and
  // THROWS when the binary predates the rebuild — and Metro red-boxes any
  // error thrown inside a module factory even when the require() caller
  // catches it (the app keeps running, but the dev overlay appears). Probing
  // with requireOptionalNativeModule returns null instead of throwing, so the
  // package factory never runs on an unbuilt binary and nothing red-boxes.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo-modules-core');
    const native = requireOptionalNativeModule?.('ImageColors');
    if (!native) {
      if (__DEV__) console.warn('[MealColor] ImageColors native module absent — rebuild required. Cards use the fallback palette.');
      getColorsFn = null;
      return getColorsFn;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    getColorsFn = require('react-native-image-colors').getColors as GetColors;
  } catch {
    if (__DEV__) console.warn('[MealColor] react-native-image-colors unavailable — rebuild required. Cards use the fallback palette.');
    getColorsFn = null;
  }
  return getColorsFn;
}

const STORE_KEY = 'meal_color_cache_v1';

let memory: Record<string, string> | null = null; // image url -> hex ('' = known miss)
let loading: Promise<Record<string, string>> | null = null;

// Same trickle discipline as foodImages: a 20-meal plan should not decode 20
// bitmaps at once.
let inFlight = 0;
const waiters: (() => void)[] = [];
const acquire = async () => {
  if (inFlight < 2) { inFlight += 1; return; }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inFlight += 1;
};
const release = () => {
  inFlight -= 1;
  waiters.shift()?.();
};

async function loadCache(): Promise<Record<string, string>> {
  if (memory) return memory;
  if (!loading) {
    loading = AsyncStorage.getItem(STORE_KEY)
      .then((raw) => { memory = raw ? JSON.parse(raw) : {}; return memory!; })
      .catch(() => { memory = {}; return memory!; });
  }
  return loading;
}

function persistCache() {
  if (!memory) return;
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(memory)).catch(() => {});
}

const HEX = /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v.trim());

/** The most representative colour each platform offers, in preference order. */
function pickColor(result: ImageColorsResult): string | null {
  const candidates: unknown[] =
    result.platform === 'ios'
      ? [result.primary, result.background, result.secondary, result.detail]
      : result.platform === 'android'
        ? [result.vibrant, result.dominant, result.muted, result.darkVibrant, result.average]
        : [result.vibrant, result.dominant, result.muted, result.darkVibrant];
  for (const c of candidates) if (isHex(c)) return c.trim();
  return null;
}

/** 42703 = column missing (migration not run); PGRST204 = schema cache miss. */
const MISSING_COLUMN = (code?: string) => code === '42703' || code === 'PGRST204';

/**
 * Sample a photo's colour. Returns a `#RRGGBB`-ish hex, or null on any failure.
 * When `persistMealId` is given, a hit is also written to that meal row so the
 * whole user base inherits it — best-effort, and tolerant of the migration not
 * having run yet.
 */
export async function extractMealColor(imageUrl: string, persistMealId?: string | null): Promise<string | null> {
  const getColors = loadGetColors();
  if (!getColors) return null;

  const cache = await loadCache();
  if (imageUrl in cache) return cache[imageUrl] || null;

  await acquire();
  try {
    // Another card may have resolved the same photo while we queued.
    if (imageUrl in cache) return cache[imageUrl] || null;

    const result = await getColors(imageUrl, {
      cache: true,
      key: imageUrl.length > 500 ? imageUrl.slice(0, 500) : imageUrl,
      quality: 'low',
      pixelSpacing: 5,
    });
    const hex = pickColor(result);
    cache[imageUrl] = hex ?? '';
    persistCache();
    if (hex && persistMealId) {
      const { error } = await supabase.from('meals').update({ image_color: hex }).eq('id', persistMealId);
      // Column not deployed, or RLS says this meal is not ours to write: the
      // device cache still holds the colour, so the card is unaffected.
      if (error && __DEV__ && !MISSING_COLUMN(error.code)) {
        console.warn('[MealColor] Could not persist image_color:', error.message);
      }
    }
    return hex;
  } catch {
    // Unreachable image, decode failure, no native module in Expo Go — all the
    // same answer: no tint. Cached as a miss so it is not retried per render.
    const cached = memory;
    if (cached) { cached[imageUrl] = ''; persistCache(); }
    return null;
  } finally {
    release();
  }
}

/**
 * Resolve the tint for a meal card.
 *
 * @param imageUrl  the photo actually being displayed (already resolved by
 *                  `useFoodImage`), or null while none exists
 * @param storedColor `meals.image_color` — used verbatim, no work done
 * @param mealId    the row that a freshly sampled colour is written back to
 */
export function useMealImageColor(
  imageUrl?: string | null,
  storedColor?: string | null,
  mealId?: string | null,
): string | null {
  const [color, setColor] = useState<string | null>(isHex(storedColor) ? storedColor!.trim() : null);

  useEffect(() => {
    if (isHex(storedColor)) { setColor(storedColor!.trim()); return; }
    if (!imageUrl) { setColor(null); return; }
    let cancelled = false;
    extractMealColor(imageUrl, mealId).then((hex) => {
      if (!cancelled && hex) setColor(hex);
    });
    return () => { cancelled = true; };
  }, [imageUrl, storedColor, mealId]);

  return color;
}
