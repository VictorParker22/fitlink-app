-- ============================================================
-- SECURITY FIX — roster cap was INSERT-only, bypassable two ways.
--
-- trg_roster_cap (20260822090000) fires only BEFORE INSERT, so a free
-- coach could exceed 5 active athletes via any UPDATE path:
--   1. The "link existing athlete" action (search-unassigned-clients)
--      does clients.update({trainer_id}) — an UPDATE, never the trigger.
--   2. Insert athletes as status='inactive' (they don't count), then
--      UPDATE them to active in bulk.
-- Both verified reachable against production 2026-08-23.
--
-- Fix: a BEFORE UPDATE trigger that enforces the cap on any transition
-- INTO the counting state (active status + assigned to this coach),
-- and only on that transition — editing an already-active athlete's
-- name must not trip it. Elite and org-seat coaches are exempt, same
-- as the insert path.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_roster_cap_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_elite boolean;
  v_org uuid;
  v_count integer;
  old_counts boolean;
  new_counts boolean;
BEGIN
  -- "Counts toward the active roster for coach NEW.trainer_id"
  old_counts := (COALESCE(OLD.status, 'active') <> 'inactive')
                AND OLD.trainer_id IS NOT DISTINCT FROM NEW.trainer_id
                AND OLD.trainer_id IS NOT NULL;
  new_counts := (COALESCE(NEW.status, 'active') <> 'inactive')
                AND NEW.trainer_id IS NOT NULL;

  -- Only a transition INTO counting needs a check. No new active seat → allow.
  IF NOT new_counts OR old_counts THEN
    RETURN NEW;
  END IF;

  SELECT (t.elite_until IS NOT NULL AND t.elite_until > now()), t.org_id
    INTO v_elite, v_org
    FROM public.trainers t WHERE t.id = NEW.trainer_id;

  IF v_elite OR v_org IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.clients c
   WHERE c.trainer_id = NEW.trainer_id
     AND c.id <> NEW.id
     AND COALESCE(c.status, 'active') <> 'inactive';

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'roster_limit: free plan holds 5 active athletes; Elite is unlimited'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roster_cap_update ON public.clients;
CREATE TRIGGER trg_roster_cap_update
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_roster_cap_update();
