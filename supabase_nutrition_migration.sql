-- FitLink Migration v5: Nutrition & Diet Plans

-- 1. Create meals library table
CREATE TABLE meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  calories INTEGER NOT NULL DEFAULT 0,
  protein INTEGER NOT NULL DEFAULT 0,
  carbs INTEGER NOT NULL DEFAULT 0,
  fat INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Meals are viewable by everyone." ON meals FOR SELECT USING (true);

-- 2. Create diet_plans table
CREATE TABLE diet_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE diet_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trainers can manage their own diet plans" ON diet_plans
  FOR ALL USING (auth.uid() = trainer_id);

-- 3. Create diet_plan_meals table (Junction)
CREATE TABLE diet_plan_meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  diet_plan_id UUID NOT NULL REFERENCES diet_plans(id) ON DELETE CASCADE,
  meal_id UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE diet_plan_meals ENABLE ROW LEVEL SECURITY;
-- Using a subquery to check if the user owns the parent diet_plan
CREATE POLICY "Trainers can manage meals in their diet plans" ON diet_plan_meals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM diet_plans
      WHERE diet_plans.id = diet_plan_meals.diet_plan_id
      AND diet_plans.trainer_id = auth.uid()
    )
  );

-- 4. Create client_diets table (Assignments)
CREATE TABLE client_diets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  diet_plan_id UUID NOT NULL REFERENCES diet_plans(id) ON DELETE CASCADE,
  assigned_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE client_diets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trainers can manage their clients diets" ON client_diets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = client_diets.client_id
      AND clients.trainer_id = auth.uid()
    )
  );

-- Seed basic meals
INSERT INTO meals (name, category, calories, protein, carbs, fat) VALUES
('Oatmeal & Berries', 'Breakfast', 350, 10, 60, 5),
('Scrambled Eggs & Avocado', 'Breakfast', 420, 24, 12, 32),
('Protein Pancake Stack', 'Breakfast', 480, 45, 50, 10),
('Grilled Chicken Salad', 'Lunch', 400, 40, 15, 20),
('Turkey Wrap', 'Lunch', 450, 35, 45, 15),
('Quinoa Bowl with Tofu', 'Lunch', 480, 20, 65, 18),
('Salmon & Sweet Potato', 'Dinner', 550, 45, 40, 22),
('Lean Steak & Broccoli', 'Dinner', 500, 50, 10, 25),
('Chicken Stir Fry', 'Dinner', 450, 35, 55, 12),
('Greek Yogurt & Almonds', 'Snack', 250, 20, 15, 12),
('Protein Shake', 'Snack', 150, 25, 5, 2),
('Apple & Peanut Butter', 'Snack', 220, 8, 25, 12);
