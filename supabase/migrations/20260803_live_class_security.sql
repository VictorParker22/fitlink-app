-- ═══════════════════════════════════════════════════════════════════════════
-- Live Class Security & Chat Architecture Migration
-- Fixes: mux_stream_key exposure, unauthenticated broadcast, no rate limiting,
--        missing persistence, inaccurate stream_offset_ms, viewer count
-- Deploy Order: broadcast/[id].tsx + AppContext FIRST, then this migration,
--               then live-player/[id].tsx
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. live_class_secrets — removes mux_stream_key from client-readable rows
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_class_secrets (
  live_class_id  UUID PRIMARY KEY REFERENCES live_classes(id) ON DELETE CASCADE,
  mux_stream_id  TEXT,
  mux_stream_key TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE live_class_secrets ENABLE ROW LEVEL SECURITY;

-- Only the trainer who owns the class can read or write their stream keys
CREATE POLICY "Trainer owns secrets"
  ON live_class_secrets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM live_classes lc
      WHERE lc.id = live_class_id
        AND lc.trainer_id = auth.uid()
    )
  );

-- Migrate all existing stream credentials into the secrets table
INSERT INTO live_class_secrets (live_class_id, mux_stream_id, mux_stream_key)
SELECT id, mux_stream_id, mux_stream_key
FROM live_classes
WHERE mux_stream_id IS NOT NULL OR mux_stream_key IS NOT NULL
ON CONFLICT DO NOTHING;

-- Null out sensitive columns — clients can no longer read these via SELECT *
UPDATE live_classes SET mux_stream_id = NULL, mux_stream_key = NULL;

-- NOTE: After running this migration, rotate ALL Mux stream keys in the
-- Mux dashboard. The existing keys were readable by every authenticated
-- client since the table was created and must be considered compromised.


-- ───────────────────────────────────────────────────────────────────────────
-- 2. went_live_at + viewer_count columns on live_classes
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS went_live_at TIMESTAMPTZ;
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS viewer_count  INT DEFAULT 0;

-- Auto-set went_live_at the moment status transitions to 'live'
-- Used for accurate stream_offset_ms in chat replay
CREATE OR REPLACE FUNCTION set_went_live_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'live' AND (OLD.status IS DISTINCT FROM 'live') THEN
    NEW.went_live_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_went_live_at ON live_classes;
CREATE TRIGGER trg_set_went_live_at
  BEFORE UPDATE ON live_classes
  FOR EACH ROW EXECUTE FUNCTION set_went_live_at();


-- ───────────────────────────────────────────────────────────────────────────
-- 3. live_class_messages — replaces ephemeral broadcast
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_class_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id    UUID        NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  sender_id        UUID        REFERENCES auth.users(id),
  sender_name      TEXT        NOT NULL,
  content          TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  is_pinned        BOOLEAN     DEFAULT false,
  is_deleted       BOOLEAN     DEFAULT false,
  stream_offset_ms BIGINT,     -- ms from went_live_at, for chat replay sync
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE live_class_messages ENABLE ROW LEVEL SECURITY;

-- Enable postgres_changes realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE live_class_messages;

-- SELECT: scoped to the trainer–client relationship (mirrors live_classes RLS)
-- clients.trainer_id is the relationship column (no separate junction table)
CREATE POLICY "Read messages for accessible classes"
  ON live_class_messages FOR SELECT
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM live_classes lc
      WHERE lc.id = live_class_id
        AND (
          -- Trainer sees their own class messages
          lc.trainer_id = auth.uid()
          OR
          -- Client sees messages for classes from their assigned trainer
          EXISTS (
            SELECT 1 FROM clients c
            WHERE c.auth_user_id = auth.uid()
              AND c.trainer_id = lc.trainer_id
          )
        )
    )
  );

-- INSERT: sender_id must be the authenticated caller (auth.uid())
CREATE POLICY "Insert own messages only"
  ON live_class_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- UPDATE: trainer can soft-delete and pin messages in their own classes
CREATE POLICY "Trainer moderation"
  ON live_class_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM live_classes lc
      WHERE lc.id = live_class_id
        AND lc.trainer_id = auth.uid()
    )
  )
  WITH CHECK (true);

-- Rate limit: 1 message per second per user per class (server-enforced)
-- Client-side 1msg/sec gate is defense-in-depth only — this is the real guard
CREATE OR REPLACE FUNCTION check_message_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM live_class_messages
    WHERE sender_id      = NEW.sender_id
      AND live_class_id  = NEW.live_class_id
      AND created_at     > NOW() - INTERVAL '1 second'
  ) THEN
    RAISE EXCEPTION 'Rate limit exceeded: 1 message per second per user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_rate_limit ON live_class_messages;
CREATE TRIGGER trg_message_rate_limit
  BEFORE INSERT ON live_class_messages
  FOR EACH ROW EXECUTE FUNCTION check_message_rate_limit();


-- ───────────────────────────────────────────────────────────────────────────
-- 4. Viewer count RPCs — auth-gated, crash-safe with cron reconciliation
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_viewer_count(class_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE live_classes SET viewer_count = viewer_count + 1 WHERE id = class_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_viewer_count(class_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE live_classes SET viewer_count = GREATEST(0, viewer_count - 1) WHERE id = class_id;
END;
$$;


-- Reconciliation cron: reset stale viewer counts on ended/cancelled classes
-- Handles the crash case where decrement_viewer_count never fired
-- Requires pg_cron extension to be ENABLED (not just available).
-- To enable: Dashboard → Database → Extensions → search pg_cron → toggle on.
-- To check if enabled: SELECT * FROM pg_extension WHERE extname = 'pg_cron';
-- If unavailable, skip this block and use a scheduled Edge Function instead.
DO $$
BEGIN
  -- pg_extension = actually installed; pg_available_extensions = only installable
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'reconcile-viewer-counts',
      '*/5 * * * *',
      'UPDATE live_classes SET viewer_count = 0 WHERE status IN (''ended'', ''cancelled'') AND viewer_count > 0'
    );
  END IF;
END;
$$;




-- ───────────────────────────────────────────────────────────────────────────
-- 5. Subscription gating on live_classes SELECT
--    Replaces open "anyone can view" policy with trainer-relationship check
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view live classes" ON live_classes;

CREATE POLICY "Clients view accessible live classes"
  ON live_classes FOR SELECT
  USING (
    -- Trainer sees own classes
    trainer_id = auth.uid()
    OR
    -- Client sees classes from their assigned trainer
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.auth_user_id = auth.uid()
        AND c.trainer_id = live_classes.trainer_id
    )
  );
