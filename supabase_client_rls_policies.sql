-- RLS Policies for Client Portal Access
-- Clients need to read their own data (matched by auth_user_id)

-- Allow clients to read their own client row
CREATE POLICY "Clients can read own row"
  ON clients FOR SELECT
  USING (auth_user_id = auth.uid());

-- Allow clients to read their trainer's profile
CREATE POLICY "Clients can read their trainer"
  ON trainers FOR SELECT
  USING (
    id IN (SELECT trainer_id FROM clients WHERE auth_user_id = auth.uid())
  );

-- Allow clients to read their own sessions
CREATE POLICY "Clients can read own sessions"
  ON sessions FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
  );

-- Allow clients to read their own workouts
CREATE POLICY "Clients can read own workouts"
  ON client_workouts FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
  );

-- Allow clients to update their own workouts (mark complete/skipped)
CREATE POLICY "Clients can update own workouts"
  ON client_workouts FOR UPDATE
  USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
  );

-- Allow clients to read their own diet plans
CREATE POLICY "Clients can read own diets"
  ON client_diets FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
  );

-- Allow clients to read their own progress logs
CREATE POLICY "Clients can read own progress"
  ON client_progress FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
  );

-- Allow clients to read their conversations
CREATE POLICY "Clients can read own conversations"
  ON conversations FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
  );

-- Allow clients to read messages in their conversations
CREATE POLICY "Clients can read own messages"
  ON messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
    )
  );

-- Allow clients to send messages in their conversations
CREATE POLICY "Clients can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
    )
  );

-- Allow clients to read workout templates (referenced by client_workouts)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'workouts') THEN
    EXECUTE 'CREATE POLICY "Clients can read assigned workouts" ON workouts FOR SELECT USING (
      id IN (SELECT workout_id FROM client_workouts WHERE client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()))
    )';
  END IF;
END $$;

-- Allow clients to read exercises
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'exercises') THEN
    EXECUTE 'CREATE POLICY "Clients can read exercises" ON exercises FOR SELECT USING (true)';
  END IF;
END $$;

-- Allow clients to read workout_exercises
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'workout_exercises') THEN
    EXECUTE 'CREATE POLICY "Clients can read workout exercises" ON workout_exercises FOR SELECT USING (true)';
  END IF;
END $$;

-- Allow clients to read diet plans and meals
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'diet_plans') THEN
    EXECUTE 'CREATE POLICY "Clients can read diet plans" ON diet_plans FOR SELECT USING (
      id IN (SELECT diet_plan_id FROM client_diets WHERE client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()))
    )';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'diet_plan_meals') THEN
    EXECUTE 'CREATE POLICY "Clients can read diet plan meals" ON diet_plan_meals FOR SELECT USING (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'meals') THEN
    EXECUTE 'CREATE POLICY "Clients can read meals" ON meals FOR SELECT USING (true)';
  END IF;
END $$;
