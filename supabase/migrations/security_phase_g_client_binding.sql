-- ============================================================
-- Phase G — a coach cannot claim an athlete's account.
--
-- Found in the post-fix sweep, not in the original three audits.
--
-- `clients_update` is USING (trainer_id = auth.uid()) with a NULL WITH CHECK,
-- which inherits USING — so a coach may change ANY column on a row they own,
-- INCLUDING auth_user_id. And `clients_insert` is WITH CHECK (trainer_id =
-- auth.uid()), so a coach may create a row carrying any auth_user_id at all.
--
-- Either one lets a coach point a row they control at another person's
-- account. The victim's app resolves its client row by
-- `auth_user_id = auth.uid()`, so from the victim's next launch the attacker
-- is their coach — and the attacker inherits the trainer-side RLS view of
-- that row. It also lets one coach take an athlete who already belongs to
-- another coach.
--
-- RLS alone cannot fix this: a policy cannot see OLD, so it cannot say
-- "auth_user_id may not change". A trigger can.
--
-- What stays legal (the real product flows):
--   · self-claim — the athlete's own uid, used by create_client_and_notify
--     and link_client_to_auth_user
--   · a coach adding an EXISTING FitLink user who has no client row yet,
--     which is exactly what search-unassigned-clients now returns
--   · service-role / trigger context (auth.uid() IS NULL)
--
-- What becomes impossible: binding an account that already belongs to
-- somebody, and silently re-pointing a row at a stranger.
--
-- Re-runnable.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_client_auth_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_changed boolean;
BEGIN
  -- Service role, SQL editor, and auth triggers run with no JWT. They are
  -- already privileged; this guard is about what a signed-in COACH can do.
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.auth_user_id IS NOT NULL;
  ELSE
    v_changed := NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
                 AND NEW.auth_user_id IS NOT NULL;
  END IF;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  -- Claiming yourself is always fine.
  IF NEW.auth_user_id = v_caller THEN
    RETURN NEW;
  END IF;

  -- Otherwise the target account must not already be linked to a client row.
  IF EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.auth_user_id = NEW.auth_user_id
      AND (TG_OP = 'INSERT' OR c.id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'That account already belongs to a coach';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_client_auth_binding_trg ON public.clients;
CREATE TRIGGER guard_client_auth_binding_trg
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_auth_binding();

REVOKE EXECUTE ON FUNCTION public.guard_client_auth_binding() FROM PUBLIC, anon, authenticated;
