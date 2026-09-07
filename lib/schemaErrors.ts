/**
 * Postgres error codes that mean "this migration has not run on this database yet"
 * rather than "this write failed".
 *
 *   42P01 — undefined_table
 *   42703 — undefined_column
 *
 * Several screens are deliberately resilient to these so the app keeps working
 * against a database that is a migration or two behind. That tolerance must stay
 * EXPLICIT: swallow these two codes only, and surface everything else. A blanket
 * `catch {}` around a Supabase write hides real data loss, because
 * `.insert()/.update()/.delete()/.upsert()` resolve with `{ error }` — they do
 * not throw — so the catch block never runs and the failure disappears.
 */
export const MISSING_SCHEMA_CODES = ['42P01', '42703', 'PGRST204'];

/**
 * True when the error is only a not-yet-run migration, not a failed write.
 *
 * PGRST204 is PostgREST's own code for a column that is not in its schema
 * cache ("Could not find the 'category' column of 'live_classes' in the
 * schema cache"). It is what an insert or update with a phantom column
 * actually returns, so it counts as "missing column": without it the
 * live-class insert failed 400 on every Go Live and never retried
 * (2026-09-07).
 */
export function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (!!error.code && MISSING_SCHEMA_CODES.includes(error.code)) return true;
  const msg = error.message ?? '';
  return /column .* does not exist/i.test(msg) || /could not find the '.*' column/i.test(msg);
}
