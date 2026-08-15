-- ============================================================
-- On-Demand Classes — Platform Subscriptions & Revenue Shares
-- FitLink On-Demand Pass ($19.99/mo) + monthly coach payouts
-- ============================================================

-- Client subscriptions to the FitLink On-Demand Pass
CREATE TABLE IF NOT EXISTS class_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  price_cents INTEGER NOT NULL DEFAULT 1999,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE class_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients manage own class subscription" ON class_subscriptions
  FOR ALL USING (auth.uid() = client_id);

CREATE INDEX idx_class_subs_client ON class_subscriptions(client_id);
CREATE INDEX idx_class_subs_status ON class_subscriptions(status);

-- Monthly revenue share records per coach
CREATE TABLE IF NOT EXISTS class_revenue_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES trainers(id),
  month TEXT NOT NULL,
  total_watch_minutes INTEGER NOT NULL,
  platform_total_minutes INTEGER NOT NULL,
  share_percentage DECIMAL(5,4) NOT NULL,
  gross_pool_cents INTEGER NOT NULL,
  payout_cents INTEGER NOT NULL,
  stripe_transfer_id TEXT,
  status TEXT DEFAULT 'pending',
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (trainer_id, month)
);

ALTER TABLE class_revenue_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers read own revenue shares" ON class_revenue_shares
  FOR SELECT USING (auth.uid() = trainer_id);

CREATE INDEX idx_revenue_shares_trainer ON class_revenue_shares(trainer_id, month DESC);

-- ============================================================
-- Helper RPC: Get watch minutes per coach for a given month
-- Used by the revenue calculation cron job
-- ============================================================
CREATE OR REPLACE FUNCTION get_coach_watch_minutes(target_month TEXT)
RETURNS TABLE (trainer_id UUID, minutes BIGINT) AS $$
BEGIN
  RETURN QUERY
    SELECT
      cc.trainer_id,
      COALESCE(SUM(cc.watch_minutes), 0)::BIGINT AS minutes
    FROM class_completions cc
    WHERE to_char(cc.completed_at, 'YYYY-MM') = target_month
    GROUP BY cc.trainer_id
    ORDER BY minutes DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
