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
export const MISSING_SCHEMA_CODES = ['42P01', '42703'];

/** True when the error is only a not-yet-run migration, not a failed write. */
export function isMissingSchemaError(error: { code?: string } | null | undefined): boolean {
  return !!error?.code && MISSING_SCHEMA_CODES.includes(error.code);
}
