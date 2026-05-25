-- ============================================================
-- FitLink Stripe Integration Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add Stripe customer ID to clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- 2. Create payments table to track individual payment events
CREATE TABLE IF NOT EXISTS payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid REFERENCES trainers(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  stripe_payment_intent_id text UNIQUE,
  amount integer NOT NULL, -- Amount in cents
  currency text DEFAULT 'usd',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Create client_subscriptions table for tracking active subscriptions
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  trainer_id uuid REFERENCES trainers(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  status text DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'active', 'past_due', 'canceled', 'trialing', 'unpaid')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. RLS Policies for payments table
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can view their own payments"
  ON payments FOR SELECT
  USING (trainer_id = auth.uid());

CREATE POLICY "Service role can insert payments"
  ON payments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update payments"
  ON payments FOR UPDATE
  USING (true);

-- 5. RLS Policies for client_subscriptions table
ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can view their client subscriptions"
  ON client_subscriptions FOR SELECT
  USING (trainer_id = auth.uid());

CREATE POLICY "Service role can insert client_subscriptions"
  ON client_subscriptions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update client_subscriptions"
  ON client_subscriptions FOR UPDATE
  USING (true);

-- 6. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_trainer_id ON payments(trainer_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_client_subs_client_id ON client_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_subs_stripe_sub ON client_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_clients_stripe_customer ON clients(stripe_customer_id);
