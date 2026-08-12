-- Migration: create notifications table for coach in-app alerts
-- Used by the client-autoflow edge function to notify coaches of new subscribers.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'general',         -- e.g. 'new_subscriber', 'check_in', 'payment'
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  data JSONB,                                   -- optional structured payload for deep-linking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_trainer_id ON notifications(trainer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(trainer_id, is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Trainers can only see their own notifications
CREATE POLICY "Trainers can manage own notifications" ON notifications
  FOR ALL
  USING (trainer_id = auth.uid());

-- Service role (edge functions) can insert notifications for any trainer
-- This is handled by the SUPABASE_SERVICE_ROLE_KEY bypassing RLS.
