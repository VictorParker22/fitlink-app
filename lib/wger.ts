// lib/wger.ts
export interface WgerImage {
  id: number;
  image: string;
  is_main: boolean;
}

export interface WgerTranslation {
  id: number;
  name: string;
  description: string;
  language: number;
}

export interface WgerMuscle {
  id: number;
  name: string;
  name_en: string;
  is_front: boolean;
}

export interface WgerCategory {
  id: number;
  name: string;
}

export interface WgerExerciseInfo {
  id: number;
  uuid: string;
  category: WgerCategory;
  muscles: WgerMuscle[];
  muscles_secondary: WgerMuscle[];
  equipment: { id: number; name: string }[];
  images: WgerImage[];
  translations: WgerTranslation[];
}

export interface WgerResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: WgerExerciseInfo[];
}

/**
 * Fetch a paginated list of exercises from Wger with full details (images, translations in English).
 */
export async function fetchWgerExercises(offset = 0, limit = 20): Promise<WgerResponse> {
  const url = `https://wger.de/api/v2/exerciseinfo/?language=2&limit=${limit}&offset=${offset}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch from Wger API: ${response.statusText}`);
  }

  return response.json();
}
