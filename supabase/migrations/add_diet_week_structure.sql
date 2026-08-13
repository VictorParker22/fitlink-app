-- Meal plan week structure + swap lists (create-diet 3-step builder).
--
-- week_structure JSONB shape:
-- {
--   "mealsPerDay": 4,
--   "slotLabels": ["Breakfast", "Lunch", "Around training", "Dinner"],
--   "trainingDays": ["mon", "wed", "fri"],            -- days that get the training-day variant
--   "restVariant": {                                   -- the rest-day version of the day
--     "mealList": [
--       { "meal_id": "...", "name": "...", "calories": 520, "protein": 42,
--         "carbs": 55, "fat": 14, "meal_time": "lunch", "servings": 1,
--         "slotLabel": "Lunch" }
--     ]
--   },
--   "freeMeal": { "enabled": true, "day": "sun" } | null
-- }
--
-- swaps JSONB shape (keyed by the training-day meal's order_index in diet_plan_meals):
-- {
--   "0": { "allowedMealIds": ["uuid", "uuid"], "allowOwnLog": false },
--   "2": { "allowedMealIds": [], "allowOwnLog": true }
-- }

ALTER TABLE diet_plans
  ADD COLUMN IF NOT EXISTS week_structure JSONB,
  ADD COLUMN IF NOT EXISTS swaps JSONB;
