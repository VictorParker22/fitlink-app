/**
 * Centralized category color map for FitLink.
 * Single source of truth — import this instead of defining colors inline.
 *
 * Usage:
 *   import { CATEGORY_COLORS } from '../../data/categoryColors';
 *   const color = CATEGORY_COLORS[category] || CATEGORY_COLORS._default;
 */

export const CATEGORY_COLORS: Record<string, string> = {
  // Core class categories
  Meditation: '#4DD0C8',
  Strength: '#E8956D',
  Pilates: '#B388FF',
  Running: '#66BB6A',
  Yoga: '#7E57C2',
  HIIT: '#FF7043',
  Cycling: '#42A5F5',
  Dance: '#EC407A',
  Boxing: '#EF5350',
  Recovery: '#26A69A',
  Barre: '#AB47BC',
  Cardio: '#FFA726',
  Stretching: '#4DD0C8',
  Conditioning: '#FF8A65',

  // Strength session sub-categories
  Sculpt: '#CE93D8',
  'Full Body Strength': '#5B7FFF',
  'Full Body': '#66BB6A',
  'Lower Body': '#CE93D8',
  'Upper Body': '#FF8A65',
  'Muscular Endurance': '#42A5F5',
  Hypertrophy: '#FFCA28',
  Core: '#FF6B6B',
  Stability: '#4DB6AC',

  // Fallback
  _default: '#5B7FFF',
};

/** Get category color with fallback */
export const getCategoryColor = (category: string): string =>
  CATEGORY_COLORS[category] || CATEGORY_COLORS._default;
