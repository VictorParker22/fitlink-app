-- ============================================================
-- Atomic pass republish.
--
-- WHY: publishing an edited track was two independent steps — update
-- plans.track, then loop every enrolled athlete updating their frozen
-- track_snapshot. A failure partway (network drop, one rejected row)
-- left the plan on the new track while some athletes stayed on the old
-- one, with no record of who. The screen now reports partial failure
-- honestly, but honest-about-broken is not the same as correct.
--
-- The per-athlete snapshot maths (protected weeks: nobody's current or
-- past week may change under them) stays in TypeScript, where it is
-- tested and shared with the blast-radius preview the coach approves.
-- This function takes the ALREADY-COMPUTED snapshots and applies them
-- with the plan update in a single transaction — all athletes move, or
-- none do and the plan is untouched.
--
-- p_snapshots shape: [{ "id": "<enrollment uuid>", "track_snapshot": [...] }, ...]
--
-- Re-runnable.
-- ============================================================

CREATE OR REPLACE FUNCTION publish_plan_track(
  p_plan_id   uuid,
  p_track     jsonb,
  p_snapshots jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner   uuid;
  v_updated integer := 0;
  v_row     integer;
  v_snap    jsonb;
BEGIN
  -- Only the owning coach may publish. SECURITY DEFINER bypasses RLS, so
  -- this check is the access control.
  SELECT trainer_id INTO v_owner FROM plans WHERE id = p_plan_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Plan % not found', p_plan_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Not your plan' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(p_track) <> 'array' THEN
    RAISE EXCEPTION 'track must be a JSON array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE plans SET track = p_track WHERE id = p_plan_id;

  FOR v_snap IN SELECT * FROM jsonb_array_elements(COALESCE(p_snapshots, '[]'::jsonb))
  LOOP
    IF jsonb_typeof(v_snap->'track_snapshot') <> 'array' THEN
      RAISE EXCEPTION 'track_snapshot for enrollment % must be an array', v_snap->>'id'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Scoped to this plan so a caller cannot rewrite an enrollment that
    -- belongs to somebody else's pass.
    UPDATE client_plan_enrollments
    SET track_snapshot = v_snap->'track_snapshot',
        updated_at     = now()
    WHERE id = (v_snap->>'id')::uuid
      AND plan_id = p_plan_id;

    GET DIAGNOSTICS v_row = ROW_COUNT;
    v_updated := v_updated + v_row;
  END LOOP;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION publish_plan_track(uuid, jsonb, jsonb) IS
  'Applies a pass track update and every enrolled athlete''s recomputed snapshot in one transaction. Snapshot maths stays client-side (lib/passWeeks + protected weeks); this guarantees all-or-nothing. Returns the number of enrollments moved.';

GRANT EXECUTE ON FUNCTION publish_plan_track(uuid, jsonb, jsonb) TO authenticated;
