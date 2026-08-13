import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Representative dish photos for meals, via the `food-image` Edge Function
 * (Spoonacular — key lives server-side as the `spooncalc` secret).
 *
 * The free tier is ~150 points/day, so the discipline here is: each distinct
 * meal name is resolved AT MOST once per device, ever —
 *   1. memory  → 2. AsyncStorage → 3. edge function (max 2 in flight)
 * — and a hit is fire-and-forgotten onto the meal row's own image_url, so
 * every other device gets it from the database for free. Misses are cached
 * too (as '') so a name that matches nothing never spends points again;
 * quota-exhausted days are NOT cached, so those meals retry tomorrow.
 */

const STORE_KEY = 'food_img_cache_v1';

let memory: Record<string, string> | null = null; // name -> url ('' = known miss)
let loading: Promise<Record<string, string>> | null = null;
let quotaExhausted = false;

// Tiny concurrency gate so a 20-meal plan trickles instead of bursting.
let inFlight = 0;
const waiters: (() => void)[] = [];
const acquire = async () => {
  if (inFlight < 2) { inFlight += 1; return; }
  await new Promise<void>(resolve => waiters.push(resolve));
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
      .then(raw => { memory = raw ? JSON.parse(raw) : {}; return memory!; })
      .catch(() => { memory = {}; return memory!; });
  }
  return loading;
}

function persistCache() {
  if (!memory) return;
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(memory)).catch(() => {});
}

const keyFor = (name: string) => name.trim().toLowerCase();

/**
 * Resolve a photo URL for a meal name. Returns null on miss/quota/error.
 * When `persistMealId` is given, a hit is also written to that meal row's
 * image_url (best-effort — RLS may reject it for shared/global meals, which
 * is fine: the device cache still holds it).
 */
export async function getFoodImage(name: string, persistMealId?: string): Promise<string | null> {
  if (!name?.trim()) return null;
  const cache = await loadCache();
  const key = keyFor(name);
  if (key in cache) return cache[key] || null;
  if (quotaExhausted) return null;

  await acquire();
  try {
    // Re-check: another card may have resolved the same name while we waited.
    if (key in cache) return cache[key] || null;
    const { data, error } = await supabase.functions.invoke('food-image', { body: { query: name } });
    if (error) return null;
    if (data?.quotaExhausted) {
      quotaExhausted = true; // back off for this app session; retry next launch
      return null;
    }
    const url: string | null = data?.imageUrl ?? null;
    cache[key] = url ?? '';
    persistCache();
    if (url && persistMealId) {
      supabase.from('meals').update({ image_url: url }).eq('id', persistMealId).then(() => {});
    }
    return url;
  } catch {
    return null;
  } finally {
    release();
  }
}

/**
 * Hook for meal thumbnails: hands back the stored image immediately when the
 * meal already has one, otherwise resolves (and remembers) a Spoonacular
 * photo in the background.
 */
export function useFoodImage(name?: string | null, existingUrl?: string | null, mealId?: string) {
  const [url, setUrl] = useState<string | null>(existingUrl || null);

  useEffect(() => {
    if (existingUrl) { setUrl(existingUrl); return; }
    if (!name?.trim()) { setUrl(null); return; }
    let cancelled = false;
    getFoodImage(name, mealId).then(resolved => {
      if (!cancelled && resolved) setUrl(resolved);
    });
    return () => { cancelled = true; };
  }, [name, existingUrl, mealId]);

  return url;
}
