-- Diet System Enhancement Migration
-- Adds support for custom meals, meal timing, serving sizes, and diet categories

-- 1. Add trainer_id and is_custom to meals (allows trainers to create custom meals)
ALTER TABLE meals ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS serving_size_g INTEGER DEFAULT 100;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS fiber INTEGER DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS sugar INTEGER DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS sodium_mg INTEGER DEFAULT 0;

-- 2. Add meal_time and servings to diet_plan_meals
ALTER TABLE diet_plan_meals ADD COLUMN IF NOT EXISTS meal_time TEXT DEFAULT 'snack' CHECK (meal_time IN ('breakfast', 'lunch', 'dinner', 'snack'));
ALTER TABLE diet_plan_meals ADD COLUMN IF NOT EXISTS servings REAL DEFAULT 1;

-- 3. Add category to diet_plans
ALTER TABLE diet_plans ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'custom';

-- 4. Update RLS on meals to allow trainers to insert custom meals
-- Allow trainers to insert their own custom meals
DROP POLICY IF EXISTS "Trainers can insert custom meals" ON meals;
CREATE POLICY "Trainers can insert custom meals"
  ON meals FOR INSERT
  WITH CHECK (trainer_id = auth.uid());

-- Allow trainers to update their own custom meals
DROP POLICY IF EXISTS "Trainers can update custom meals" ON meals;
CREATE POLICY "Trainers can update custom meals"
  ON meals FOR UPDATE
  USING (trainer_id = auth.uid());

-- Allow trainers to delete their own custom meals  
DROP POLICY IF EXISTS "Trainers can delete custom meals" ON meals;
CREATE POLICY "Trainers can delete custom meals"
  ON meals FOR DELETE
  USING (trainer_id = auth.uid());
