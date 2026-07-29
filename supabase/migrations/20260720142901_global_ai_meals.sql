
-- Allow authenticated users to insert global AI generated meals
DROP POLICY IF EXISTS "Trainers can insert global AI meals" ON meals;
CREATE POLICY "Trainers can insert global AI meals"
  ON meals FOR INSERT
  WITH CHECK (trainer_id IS NULL AND is_custom = false);
