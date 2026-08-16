-- ============================================================
-- Keep classes.take_count / total_watch_minutes / avg_rating in sync
-- from the database, not the client.
--
-- WHY: the athlete's player used to bump these columns itself. That was
-- always fragile and is now impossible — scope_classes_to_coach.sql
-- restricts UPDATE on `classes` to the owning coach, so an athlete's
-- write matches zero rows and silently does nothing. Any coach-facing
-- analytics reading these columns would show zero forever.
--
-- The authoritative record is class_completions. This trigger derives
-- the roll-ups from it, SECURITY DEFINER so it can update a row the
-- athlete cannot, and recomputes rather than blindly incrementing so it
-- is self-healing: a re-run, a deleted completion, or an edited rating
-- all converge on the truth.
--
-- take_count counts completion ROWS (every session, partial or complete
-- — matching the table's own stated purpose), not just finished ones.
--
-- Re-runnable.
-- ============================================================

CREATE OR REPLACE FUNCTION recalc_class_stats(p_class_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE classes c
  SET take_count          = s.takes,
      total_watch_minutes = s.minutes,
      rating_count        = s.ratings,
      avg_rating          = s.avg_rating,
      updated_at          = now()
  FROM (
    SELECT
      COUNT(*)::int                                   AS takes,
      COALESCE(SUM(watch_minutes), 0)::int            AS minutes,
      COUNT(rating)::int                              AS ratings,
      ROUND(AVG(rating)::numeric, 2)                  AS avg_rating
    FROM class_completions
    WHERE class_id = p_class_id
  ) s
  WHERE c.id = p_class_id;
$$;

COMMENT ON FUNCTION recalc_class_stats(uuid) IS
  'Recomputes a class''s engagement roll-ups from class_completions. SECURITY DEFINER because athletes cannot UPDATE classes under the coach-scoped RLS policy.';

CREATE OR REPLACE FUNCTION class_completions_sync_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_class_stats(OLD.class_id);
    RETURN OLD;
  END IF;

  PERFORM recalc_class_stats(NEW.class_id);
  -- A completion that was moved between classes must fix both sides.
  IF TG_OP = 'UPDATE' AND NEW.class_id IS DISTINCT FROM OLD.class_id THEN
    PERFORM recalc_class_stats(OLD.class_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_completions_stats ON class_completions;
CREATE TRIGGER trg_class_completions_stats
  AFTER INSERT OR UPDATE OR DELETE ON class_completions
  FOR EACH ROW EXECUTE FUNCTION class_completions_sync_stats();

-- Backfill every class from the completions that already exist, so the
-- columns are correct the moment this lands (currently all zero, because
-- the client-side writes never succeeded).
UPDATE classes c
SET take_count          = s.takes,
    total_watch_minutes = s.minutes,
    rating_count        = s.ratings,
    avg_rating          = s.avg_rating
FROM (
  SELECT class_id,
         COUNT(*)::int                        AS takes,
         COALESCE(SUM(watch_minutes), 0)::int AS minutes,
         COUNT(rating)::int                   AS ratings,
         ROUND(AVG(rating)::numeric, 2)       AS avg_rating
  FROM class_completions
  GROUP BY class_id
) s
WHERE c.id = s.class_id;
