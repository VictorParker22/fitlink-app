-- Meal card tint (Food tab recipe cards).
--
-- The tinted meal card samples one hue from the dish photo and builds its whole
-- palette from it. Extraction is a native, per-device cost, so it happens ONCE
-- per meal — the first device to render a photo writes the sampled hex back
-- here and every other device (and every other user) reads it for free.
--
-- Nullable on purpose: null simply means "not sampled yet", and the card falls
-- back to the app's normal dark surface until a value lands. Re-runnable.

ALTER TABLE meals
ADD COLUMN IF NOT EXISTS image_color text;

COMMENT ON COLUMN meals.image_color IS
  'Dominant colour sampled from image_url as "#RRGGBB". Written once by the '
  'first client that renders the photo; read by every client thereafter to '
  'tint the meal card. Null = not sampled yet (card uses the neutral fallback). '
  'Derived from image_url — clear it if image_url changes.';
