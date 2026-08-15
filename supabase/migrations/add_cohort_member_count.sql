-- Cohort member count — the one number an athlete cannot count for themselves.
--
-- Athletes can only SELECT their own row in client_plan_enrollments (correctly:
-- see fix_enrollment_client_rls.sql). That means a cohort's size can never be
-- derived client-side — an athlete asking "how many of us are there?" gets 1,
-- their own row, forever. Without this, every athlete-facing surface would
-- either hide the count or invent one.
--
-- So this runs as SECURITY DEFINER to see past RLS, and returns ONLY an
-- integer. No names, no client ids, no dates, no PII of any kind leaves the
-- function — the caller learns the size of a group they are looking at and
-- nothing about who is in it. That is why it is safe to expose to every
-- authenticated user.
--
-- search_path is pinned to public: a SECURITY DEFINER function inherits the
-- caller's search_path otherwise, which lets a caller shadow `clients` /
-- `client_plan_enrollments` with their own objects and run them as the owner.
--
-- Counted statuses: 'active' and 'completed' — both are people who took a seat.
-- 'paused' is deliberately excluded so a paused athlete does not hold a seat
-- against the capacity the coach set.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION cohort_member_count(p_plan_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM client_plan_enrollments e
  WHERE e.plan_id = p_plan_id
    AND e.status IN ('active', 'completed');
$$;

COMMENT ON FUNCTION cohort_member_count(uuid) IS
  'Number of active/completed enrollments on a plan. SECURITY DEFINER because athletes can only read their own enrollment row; returns an integer only, never PII.';

GRANT EXECUTE ON FUNCTION cohort_member_count(uuid) TO authenticated;
