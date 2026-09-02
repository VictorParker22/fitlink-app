// lib/exercisedb.ts
// ExerciseDB integration — fetches by body part on demand, caches in AsyncStorage
// Uses cursor-based pagination + bodyParts filter

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ExerciseDBItem {
  exerciseId: string;
  name: string;
  bodyParts: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  equipments: string[];
  gifUrl: string;
  instructions: string[];
}

const BASE_URL = 'https://oss.exercisedb.dev/api/v1';
const CACHE_KEY = 'exercisedb_cache_v6'; // Bumped to clear stale data
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Proxy ExerciseDB CDN URLs through images.weserv.nl
 * The CDN blocks non-browser clients, so we proxy through a public image service.
 * n=-1 preserves GIF animation frames.
 */
export function proxyGifUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (url.includes('static.exercisedb.dev')) {
    const stripped = url.replace('https://', '').replace('http://', '');
    return `https://images.weserv.nl/?url=${stripped}&n=-1`;
  }
  return url;
}

/**
 * Returns a static first-frame thumbnail (JPEG) — tiny file size, no animation.
 * Use for small thumbnails so GIF animation resources aren't wasted.
 */
export function proxyGifStill(url: string | undefined | null): string | null {
  if (!url) return null;
  if (url.includes('static.exercisedb.dev')) {
    const stripped = url.replace('https://', '').replace('http://', '');
    return `https://images.weserv.nl/?url=${stripped}&n=1&output=jpg&w=80&h=80&fit=cover`;
  }
  return url;
}

interface CacheEntry {
  exercises: ExerciseDBItem[];
  nextCursor: string | null;
  complete: boolean;
  timestamp: number;
}

interface CacheData {
  [bodyPart: string]: CacheEntry;
}

// ---- Cache helpers ----

async function getCache(): Promise<CacheData> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as CacheData;
    // Expire old entries
    const now = Date.now();
    const filtered: CacheData = {};
    for (const [key, entry] of Object.entries(data)) {
      if (now - entry.timestamp < CACHE_TTL) {
        filtered[key] = entry;
      }
    }
    return filtered;
  } catch {
    return {};
  }
}

async function setCache(data: CacheData): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
}

// ---- API fetcher ----

async function fetchPage(bodyPart: string, cursor: string | null): Promise<{
  exercises: ExerciseDBItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}> {
  let url = `${BASE_URL}/exercises?bodyParts=${encodeURIComponent(bodyPart)}&limit=25`;
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

  console.log('[ExerciseDB] Fetching:', url);
  const r = await fetch(url);
  if (r.status === 429) {
    throw new Error('RATE_LIMITED');
  }
  if (!r.ok) throw new Error(`API error: ${r.status}`);

  const d = await r.json();
  const exercises = d.data || [];
  
  // Debug: log first exercise to verify data integrity
  if (exercises.length > 0) {
    const e = exercises[0];
    console.log(`[ExerciseDB] Got ${exercises.length} exercises. First: "${e.name}" | instructions: ${e.instructions?.length || 0} steps | muscles: ${e.targetMuscles} | equip: ${e.equipments}`);
  } else {
    console.log('[ExerciseDB] Got 0 exercises');
  }

  return {
    exercises,
    nextCursor: null, // Free API has no working pagination
    hasMore: false,
    total: d.meta?.total || 0,
  };
}

// ---- Public API ----

/**
 * Load exercises for a specific body part.
 * The free API returns max 25 per body part with no working pagination.
 */
export async function loadBodyPartExercises(bodyPart: string): Promise<{
  exercises: ExerciseDBItem[];
  complete: boolean;
}> {
  const cache = await getCache();

  if (cache[bodyPart]?.exercises?.length > 0) {
    const cached = cache[bodyPart];
    console.log(`[ExerciseDB] CACHE HIT for "${bodyPart}": ${cached.exercises.length} exercises`);
    return { exercises: cached.exercises, complete: true };
  }

  try {
    const page = await fetchPage(bodyPart, null);
    const entry: CacheEntry = {
      exercises: page.exercises,
      nextCursor: null,
      complete: true, // Free API: 25 is the max we'll get
      timestamp: Date.now(),
    };
    cache[bodyPart] = entry;
    await setCache(cache);
    return { exercises: entry.exercises, complete: true };
  } catch (err: any) {
    if (err.message === 'RATE_LIMITED' && cache[bodyPart]) {
      return { exercises: cache[bodyPart].exercises, complete: true };
    }
    throw err;
  }
}

/**
 * Load ALL exercises across every body part.
 * Fetches all body parts in parallel (~250 exercises total from the free API).
 */
export async function loadAllExercises(): Promise<ExerciseDBItem[]> {
  const bodyParts = ['chest', 'back', 'upper legs', 'lower legs', 'upper arms', 'lower arms', 'shoulders', 'waist', 'cardio', 'neck'];
  
  try {
    const results = await Promise.all(
      bodyParts.map(bp => loadBodyPartExercises(bp).catch(() => ({ exercises: [] as ExerciseDBItem[], complete: true })))
    );
    
    const seen = new Set<string>();
    const all: ExerciseDBItem[] = [];
    for (const result of results) {
      for (const e of result.exercises) {
        if (!seen.has(e.exerciseId)) {
          seen.add(e.exerciseId);
          all.push(e);
        }
      }
    }
    
    console.log(`[ExerciseDB] Loaded ALL: ${all.length} unique exercises across ${bodyParts.length} body parts`);
    return all;
  } catch {
    return [];
  }
}

// ---- Normalize for DB import ----

function capitalize(str: string): string {
  if (!str) return '';
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function mapBodyPartToCategory(bodyPart: string): string {
  const map: Record<string, string> = {
    'back': 'back', 'cardio': 'cardio', 'chest': 'chest',
    'lower arms': 'arms', 'lower legs': 'legs', 'neck': 'shoulders',
    'shoulders': 'shoulders', 'upper arms': 'arms', 'upper legs': 'legs', 'waist': 'core',
  };
  return map[bodyPart?.toLowerCase()] || 'full_body';
}

function mapEquipment(equipment: string): string {
  const map: Record<string, string> = {
    'body weight': 'bodyweight', 'barbell': 'barbell', 'dumbbell': 'dumbbell',
    'cable': 'cable', 'kettlebell': 'kettlebell', 'band': 'bands',
    'resistance band': 'bands', 'leverage machine': 'machine', 'smith machine': 'machine',
    'ez barbell': 'barbell', 'olympic barbell': 'barbell', 'trap bar': 'barbell',
    'assisted': 'machine', 'medicine ball': 'other', 'stability ball': 'other',
    'bosu ball': 'other', 'roller': 'other', 'rope': 'cable',
    'skierg machine': 'machine', 'elliptical machine': 'machine',
    'stationary bike': 'machine', 'stepmill machine': 'machine',
    'upper body ergometer': 'machine', 'wheel roller': 'other',
    'hammer': 'dumbbell', 'tire': 'other', 'sled machine': 'machine',
  };
  const key = equipment?.toLowerCase()?.trim();
  if (!key) return 'bodyweight';
  if (map[key]) return map[key];
  if (key.includes('machine')) return 'machine';
  if (key.includes('barbell')) return 'barbell';
  if (key.includes('dumbbell')) return 'dumbbell';
  if (key.includes('cable')) return 'cable';
  if (key.includes('band')) return 'bands';
  if (key.includes('kettle')) return 'kettlebell';
  return 'other';
}

export function buildInstructionsHtml(instructions: string[]): string {
  if (!instructions || instructions.length === 0) return '';
  const steps = instructions.map((step) => {
    const cleaned = step.replace(/^Step:\d+\s*/i, '');
    return `<li>${cleaned}</li>`;
  }).join('');
  return `<ol>${steps}</ol>`;
}

export function normalizeExerciseDB(item: ExerciseDBItem) {
  const bodyPart = item.bodyParts?.[0] || '';
  const target = item.targetMuscles?.[0] || 'Full Body';
  const equipment = item.equipments?.[0] || 'body weight';
  const html = buildInstructionsHtml(item.instructions);

  if (__DEV__) console.log(`[ExerciseDB normalize] "${item.name}" | raw instructions: ${item.instructions?.length || 0} | html length: ${html.length} | category: ${mapBodyPartToCategory(bodyPart)} | equip: ${mapEquipment(equipment)}`);

  return {
    id: item.exerciseId,
    name: capitalize(item.name),
    category: mapBodyPartToCategory(bodyPart),
    muscle_group: capitalize(target),
    equipment: mapEquipment(equipment),
    image_url: proxyGifUrl(item.gifUrl),
    instructions: html,
    bodyPart: bodyPart,
    secondaryMuscles: item.secondaryMuscles || [],
  };
}
