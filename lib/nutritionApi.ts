/**
 * Nutrition API (USDA FoodData Central)
 * Search any food and get full macro data for free.
 * Docs: https://fdc.nal.usda.gov/api-guide.html
 */

const API_KEY = 'DEMO_KEY'; // Can be upgraded to a free registered key later
const BASE_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

export interface NutritionResult {
  name: string;
  calories: number;
  serving_size_g: number;
  fat_total_g: number;
  fat_saturated_g: number;
  protein_g: number;
  sodium_mg: number;
  potassium_mg: number;
  cholesterol_mg: number;
  carbohydrates_total_g: number;
  fiber_g: number;
  sugar_g: number;
}

/**
 * Helper to extract nutrient value by ID
 */
function getNutrient(food: any, nutrientId: number): number {
  const nutrient = food.foodNutrients?.find((n: any) => n.nutrientId === nutrientId);
  return nutrient ? nutrient.value : 0;
}

/**
 * Search for nutrition data using USDA API.
 */
export async function searchNutrition(query: string): Promise<NutritionResult[]> {
  if (!query.trim()) return [];
  
  try {
    const response = await fetch(`${BASE_URL}?api_key=${API_KEY}&query=${encodeURIComponent(query.trim())}&pageSize=15`);
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      console.warn('[NutritionAPI] Error:', response.status);
      return [];
    }
    
    const data = await response.json();
    if (!data.foods) return [];
    
    return data.foods.map((food: any) => {
      return {
        name: food.description,
        calories: getNutrient(food, 1008), // Energy (kcal)
        serving_size_g: food.servingSize || 100, // Fallback to 100g if not specified
        fat_total_g: getNutrient(food, 1004), // Total lipid (fat)
        fat_saturated_g: getNutrient(food, 1258), // Fatty acids, total saturated
        protein_g: getNutrient(food, 1003), // Protein
        sodium_mg: getNutrient(food, 1093), // Sodium
        potassium_mg: getNutrient(food, 1092), // Potassium
        cholesterol_mg: getNutrient(food, 1253), // Cholesterol
        carbohydrates_total_g: getNutrient(food, 1005), // Carbohydrate, by difference
        fiber_g: getNutrient(food, 1079), // Fiber, total dietary
        sugar_g: getNutrient(food, 2000), // Sugars, total
      };
    });
  } catch (err) {
    console.warn('[NutritionAPI] Network error:', err);
    return [];
  }
}

/**
 * Convert API result to our Meal format for saving to DB.
 */
export function nutritionToMeal(item: NutritionResult) {
  // Capitalize first letter of each word
  const name = item.name
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  
  return {
    name,
    calories: Math.round(item.calories) || 0,
    protein: Math.round(item.protein_g) || 0,
    carbs: Math.round(item.carbohydrates_total_g) || 0,
    fat: Math.round(item.fat_total_g) || 0,
    serving_size_g: Math.round(item.serving_size_g) || 100,
    fiber: Math.round(item.fiber_g) || 0,
    sugar: Math.round(item.sugar_g) || 0,
    sodium_mg: Math.round(item.sodium_mg) || 0,
  };
}
