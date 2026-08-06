-- ============================================================
-- FitLink Analytics Views Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. View for Client Growth (Counts clients created per month per trainer)
CREATE OR REPLACE VIEW coach_client_growth AS
SELECT 
    trainer_id,
    DATE_TRUNC('month', created_at) AS month,
    COUNT(*) AS client_count
FROM 
    clients
GROUP BY 
    trainer_id, DATE_TRUNC('month', created_at);

-- 2. View for Session Stats (Counts completed, cancelled, upcoming per trainer)
CREATE OR REPLACE VIEW coach_session_stats AS
SELECT 
    trainer_id,
    status,
    COUNT(*) AS session_count,
    SUM(duration) AS total_minutes
FROM 
    sessions
GROUP BY 
    trainer_id, status;

-- 3. View for Session Types (Counts sessions by type per trainer)
CREATE OR REPLACE VIEW coach_session_types AS
SELECT 
    trainer_id,
    type,
    COUNT(*) AS type_count
FROM 
    sessions
GROUP BY 
    trainer_id, type;

-- 4. View for Revenue (MRR based on active subscriptions)
-- We join plans to get the price, assuming price is in the plans table
CREATE OR REPLACE VIEW coach_revenue_mrr AS
SELECT 
    cs.trainer_id,
    COALESCE(SUM(p.price), 0) AS mrr
FROM 
    client_subscriptions cs
JOIN 
    plans p ON cs.plan_id = p.id
WHERE 
    cs.status = 'active'
GROUP BY 
    cs.trainer_id;

-- Apply Row Level Security to Views
-- Note: Views bypass RLS by default unless created WITH (security_invoker = true) in PG15+
-- Since Supabase uses PG15+, we can do this:
ALTER VIEW coach_client_growth SET (security_invoker = true);
ALTER VIEW coach_session_stats SET (security_invoker = true);
ALTER VIEW coach_session_types SET (security_invoker = true);
ALTER VIEW coach_revenue_mrr SET (security_invoker = true);
