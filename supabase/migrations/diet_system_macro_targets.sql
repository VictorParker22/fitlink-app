-- Add macro targets to diet_plans
ALTER TABLE diet_plans
ADD COLUMN IF NOT EXISTS target_calories integer DEFAULT 2000,
ADD COLUMN IF NOT EXISTS target_protein integer DEFAULT 150,
ADD COLUMN IF NOT EXISTS target_carbs integer DEFAULT 200,
ADD COLUMN IF NOT EXISTS target_fat integer DEFAULT 65;
