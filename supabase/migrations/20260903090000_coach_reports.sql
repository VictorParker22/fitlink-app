-- ============================================================
-- coach_reports — an athlete's way to flag a coach.
--
-- App Store guideline 1.2 (user-generated content) requires a mechanism to
-- report abusive behaviour. Coaches and athletes message each other, so the
-- athlete side needs a report path. Reports are written by the athlete and
-- read ONLY by FitLink staff (service role): no user-facing SELECT, so a
-- coach can never learn who reported them.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coach_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trainer_id       uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  client_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  reason           text NOT NULL CHECK (reason IN (
                     'inappropriate_messages', 'harassment', 'unsafe_programming',
                     'payment_issue', 'impersonation', 'other')),
  details          text,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_reports ENABLE ROW LEVEL SECURITY;

-- Athletes file reports as themselves. Nobody but the service role reads.
DROP POLICY IF EXISTS "Athletes can file a report" ON public.coach_reports;
CREATE POLICY "Athletes can file a report"
  ON public.coach_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_coach_reports_trainer ON public.coach_reports(trainer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_reports_status  ON public.coach_reports(status) WHERE status = 'open';

-- Staff heads-up: a notification row for the founder-owned trainer account
-- is not appropriate (it would name the reporter). Reports are read from
-- the dashboard; the details field is the whole record.
