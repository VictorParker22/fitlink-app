-- Cohort programs — the dated variant of a pass (lib/cohort.ts).
--
-- An evergreen pass is athlete-paced: week 1 starts the day they buy. A COHORT
-- starts on a fixed date for everyone, closes enrollment before it begins, and
-- can cap seats — a gym's "4-week signature program, Sep 8 – Sep 29, sign up by
-- Aug 31, 12 spots".
--
-- A plan is a cohort if and only if starts_on is set. Nothing else about the
-- pass model changes, so cohorts reuse the whole season experience.
--
-- Safe to re-run. No RLS changes: plans already carry trainer-write and
-- marketplace-read policies (20260723070000_plans_client_read_policy.sql).

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS starts_on DATE,
  ADD COLUMN IF NOT EXISTS enrollment_closes DATE,
  ADD COLUMN IF NOT EXISTS capacity INTEGER;

COMMENT ON COLUMN plans.starts_on IS
  'Cohort first day. NULL = evergreen pass, athlete-paced from purchase.';
COMMENT ON COLUMN plans.enrollment_closes IS
  'Last day to join a cohort. NULL = open until the day before it starts.';
COMMENT ON COLUMN plans.capacity IS
  'Seat cap for a cohort. NULL = unlimited.';
