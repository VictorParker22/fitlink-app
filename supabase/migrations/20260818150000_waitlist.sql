-- ============================================================
-- The waitlist — the landing site's first real conversion path.
--
-- The site's only CTA was a mailto:, and the honest audit said what any
-- visitor already knew: nobody emails a stranger's inbox to "get launch
-- news". The principled objection to a form was that no backend existed
-- behind it — a form that eats addresses and drops them is worse than no
-- form. So this is the backend.
--
-- SHAPE: a write-only mailbox. anon may INSERT under tight CHECKs and may
-- never SELECT, UPDATE or DELETE — the public can put a letter in the slot
-- and cannot open the box, read anyone else's letter, or take one out. The
-- service role (and the ops dashboard through it) is the only reader.
--
-- Duplicates are handled by the unique index rather than a pre-check: a
-- pre-check would need SELECT, and SELECT is exactly what anon must not
-- have. The site treats a unique-violation error as success ("you're
-- already on the list") — idempotent from the visitor's point of view.
--
-- Re-runnable.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  -- Who they are, from the form's own toggle. Free text constrained by
  -- CHECK rather than an enum: adding 'press' or 'investor' later should
  -- not need a migration.
  role       text NOT NULL DEFAULT 'coach'
             CHECK (role IN ('coach', 'athlete', 'gym')),
  -- Which page converted them. Analytics-lite, no tracker needed.
  source     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per address, case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_uniq
  ON public.waitlist_signups (lower(email));

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- The one policy. INSERT only, and only rows that look like an email and
-- cannot be abused as free-text storage. No SELECT policy exists, so even
-- the inserter cannot read the table back.
DROP POLICY IF EXISTS "Anyone may join the waitlist" ON public.waitlist_signups;
CREATE POLICY "Anyone may join the waitlist"
  ON public.waitlist_signups FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    AND char_length(email) <= 254
    AND (source IS NULL OR char_length(source) <= 64)
  );

-- The signup count is shown nowhere until it is a number worth showing —
-- and when it is, it will be read by the ops dashboard via service role,
-- never by the public site.
