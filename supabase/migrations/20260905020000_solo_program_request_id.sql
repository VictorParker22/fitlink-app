-- Idempotency for program rebuilds (roast phase 3): the client sends a
-- request_id with every rebuild/adapt; the builder refuses to run the same
-- id twice, so a retried or double-tapped request cannot write two weeks.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS solo_program_request_id text;
