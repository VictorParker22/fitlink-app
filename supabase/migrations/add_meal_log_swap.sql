-- Athlete-side meal swaps (Food tab, design turn 23b).
--
-- When an athlete logs a coach-approved swap instead of the planned meal,
-- the log row records WHICH meal was actually eaten:
--   swapped_meal_id → meals.id of the alternative (null = ate the plan as written)
--
-- Rest-day meals (week_structure.restVariant) have no diet_plan_meals row, so
-- their logs are stored with diet_plan_meal_id = NULL and swapped_meal_id set
-- to the eaten meal's id. Client code writes this column 42703-resiliently:
-- if the column doesn't exist yet, training-day logs fall back to a plain row
-- (counted as the original meal) and rest-day logs stay in-memory only.

ALTER TABLE client_meal_logs
  ADD COLUMN IF NOT EXISTS swapped_meal_id UUID REFERENCES meals(id) ON DELETE SET NULL;
