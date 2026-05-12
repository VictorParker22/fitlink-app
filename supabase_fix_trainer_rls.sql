-- Fix: Add missing INSERT policy for trainers on client_workouts
-- The trainer_id column must match auth.uid()

CREATE POLICY "Trainers can assign workouts"
  ON client_workouts FOR INSERT
  WITH CHECK (trainer_id = auth.uid());
