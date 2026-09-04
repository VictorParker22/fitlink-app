/**
 * dob — date-of-birth parsing/formatting, pulled out of the onboarding
 * screens so it can be unit tested as a pure function.
 *
 * Used by app/(auth)/account.tsx and client-signup.tsx.
 */

export const MIN_AGE = 16;

/** Keeps a birth-date field to digits and dashes as YYYY-MM-DD. */
export function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  return [y, m, d].filter(Boolean).join('-');
}

export type ParseDobResult = { ok: true; iso: string } | { ok: false; message: string };

export function parseDob(value: string): ParseDobResult {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return { ok: false, message: 'Enter your date of birth as YYYY-MM-DD' };
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  const valid = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  if (!valid || y < 1900) return { ok: false, message: 'That date does not look right' };
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  if (age < MIN_AGE) return { ok: false, message: `You need to be ${MIN_AGE} or older to use FitLink` };
  return { ok: true, iso: value.trim() };
}
