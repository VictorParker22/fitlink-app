-- ============================================================
-- Phase F — stop handing every coach's private columns to any signed-in user.
--
-- The browse policy was `USING (auth.role() = 'authenticated')` on the whole
-- `trainers` table, and PostgREST honours `?select=*`. So a free athlete
-- signup could `GET /rest/v1/trainers?select=*` and harvest every coach's
-- personal email, phone number, Stripe Connect account id, referral code and
-- expo_push_token in one request.
--
-- Row-level browsing IS the marketplace requirement. COLUMN-level exposure was
-- never intended. Postgres column grants are role-wide, not row-aware, so a
-- coach reading their own private columns rules that out — hence a view.
--
-- `trainers_public` deliberately runs WITHOUT security_invoker, so it reads
-- past the table's RLS and exposes exactly the marketplace columns to anyone.
-- That is the point: it is the public face of the table. Supabase's linter
-- flags this pattern generically; here it is the mechanism, and the column
-- list is the security boundary.
--
-- Re-runnable.
-- ============================================================

CREATE OR REPLACE VIEW public.trainers_public AS
SELECT
  id,
  name,
  bio,
  specialization,
  specializations,
  certifications,
  working_hours,
  avatar_url,
  cover_url,
  onboarding_complete,
  created_at
FROM public.trainers;

-- No email, no phone, no stripe_account_id, no expo_push_token, no
-- referral_code. Anyone may browse coaches; nobody browses their private data.
GRANT SELECT ON public.trainers_public TO anon, authenticated;

-- ── Table policies: own row, or your own coach's row ────────────────
DROP POLICY IF EXISTS "Authenticated users can browse trainers" ON public.trainers;

DROP POLICY IF EXISTS "Trainers read own row" ON public.trainers;
CREATE POLICY "Trainers read own row"
  ON public.trainers FOR SELECT TO authenticated
  USING (id = auth.uid());

-- An athlete legitimately needs their own coach's contact details and push
-- token (they message them). Their coach only — not the whole directory.
DROP POLICY IF EXISTS "Athletes read their own coach" ON public.trainers;
CREATE POLICY "Athletes read their own coach"
  ON public.trainers FOR SELECT TO authenticated
  USING (
    id IN (SELECT c.trainer_id FROM public.clients c WHERE c.auth_user_id = auth.uid())
  );
