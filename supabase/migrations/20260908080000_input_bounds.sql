-- 2026-09-08 — input bounds at the database. The screens cap what a person
-- can type (maxLength) but the API does not: any signed-in user could insert
-- a megabyte into messages.content, a coach a novel into clients.notes, and
-- every realtime subscriber would receive it. Server-side limits belong on
-- the table, not the phone. NOT VALID keeps existing rows as they are and
-- checks every new write.
--
-- Apply with: npx supabase db query --linked -f supabase/migrations/20260908080000_input_bounds.sql

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('messages',        'content',         4000),
      ('clients',         'name',            120),
      ('clients',         'email',           254),
      ('clients',         'phone',           40),
      ('clients',         'notes',           4000),
      ('trainers',        'name',            120),
      ('trainers',        'email',           254),
      ('trainers',        'phone',           40),
      ('trainers',        'bio',             2000),
      ('trainers',        'specialization',  200),
      ('coach_reports',   'reason',          200),
      ('coach_reports',   'details',         4000),
      ('plans',           'name',            120),
      ('plans',           'description',     4000),
      ('workouts',        'name',            120),
      ('workouts',        'description',     4000),
      ('exercises',       'name',            120),
      ('exercises',       'description',     4000),
      ('exercises',       'instructions',    8000),
      ('meals',           'name',            120),
      ('diet_plans',      'name',            120),
      ('diet_plans',      'description',     4000),
      ('invites',         'invitee_name',    120),
      ('invites',         'invitee_contact', 200),
      ('invites',         'message',         1000),
      ('live_classes',    'title',           120),
      ('live_classes',    'description',     2000),
      ('classes',         'title',           120),
      ('classes',         'description',     4000),
      ('sessions',        'group_name',      120),
      ('sessions',        'notes',           4000),
      ('client_progress', 'notes',           4000),
      ('organizations',   'name',            120),
      ('waitlist_signups','email',           254),
      ('waitlist_signups','source',          64)
    ) AS t(tbl, col, max_len)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.col
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.tbl || '_' || r.col || '_len');
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR char_length(%I) <= %s) NOT VALID',
                     r.tbl, r.tbl || '_' || r.col || '_len', r.col, r.col, r.max_len);
    END IF;
  END LOOP;
END $$;
