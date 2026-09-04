-- The consolidated meals INSERT policy kept TO public because one branch
-- (trainer_id IS NULL AND is_custom = false — the AI "global" meals) holds
-- without a JWT, which meant anon could insert global meals. Global meals
-- are written by the generate-diet edge function with the service role, so
-- signed-in users are the only API callers that ever need this policy.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='meals' AND cmd='INSERT'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.meals TO authenticated', r.policyname);
  END LOOP;
END $$;
