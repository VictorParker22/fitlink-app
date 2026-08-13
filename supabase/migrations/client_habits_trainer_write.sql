-- ─────────────────────────────────────────────────────────────────────────────
-- client_habits: trainer write access
-- client_habits.sql only granted trainers SELECT ("trainers_read_client_habits").
-- The coach-side habit sheet (app/(tabs)/clients.tsx) needs trainers to be able
-- to insert/update their own clients' daily habit rows.
-- Pattern follows client_checkins.sql ("trainers_reply_to_checkins"):
-- clients.trainer_id = auth.uid().
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "trainers_insert_client_habits"
  ON public.client_habits FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE trainer_id = auth.uid()
    )
  );

CREATE POLICY "trainers_update_client_habits"
  ON public.client_habits FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE trainer_id = auth.uid()
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE trainer_id = auth.uid()
    )
  );
