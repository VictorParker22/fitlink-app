-- FitLink Migration v6: Real Notifications

-- 1. Create notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('message', 'score', 'water', 'workout', 'nutrition', 'file')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trainers can manage their own notifications" ON notifications
  FOR ALL USING (auth.uid() = trainer_id);

-- Optional: Seed script (Replace YOUR_TRAINER_ID with an actual trainer UUID if running manually)
-- INSERT INTO notifications (trainer_id, type, title, description, metadata, is_read, created_at)
-- VALUES
--   ('YOUR_TRAINER_ID', 'message', 'Unread AI Chatbot Messages', 'Messages from sandow.ai!', '{"messageCount": 8}'::jsonb, false, NOW()),
--   ('YOUR_TRAINER_ID', 'score', 'Score Increased!', 'Sandow Score is now', '{"scoreGained": 8, "currentScore": 87}'::jsonb, false, NOW() - interval '2 hours'),
--   ('YOUR_TRAINER_ID', 'water', 'Drink More Water!', 'You need to drink', '{"waterProgress": 0.6, "waterRemaining": "1500ml"}'::jsonb, false, NOW() - interval '5 hours'),
--   ('YOUR_TRAINER_ID', 'workout', 'Workout Complete!', 'Upper Body Set Completed.', '{}'::jsonb, true, NOW() - interval '1 day'),
--   ('YOUR_TRAINER_ID', 'nutrition', 'Nutrition Update', 'Take 87g of protein!', '{"nutritionProgress": 30}'::jsonb, true, NOW() - interval '1 day'),
--   ('YOUR_TRAINER_ID', 'file', 'Fitness Data Ready!', 'Here is fitness data for November.', '{"fileName": "Fitness_data_Nov.rar"}'::jsonb, true, NOW() - interval '2 days');
