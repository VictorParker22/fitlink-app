// ============================================================
// contact.ts — normalise a contact the coach typed before it touches a
// query. No imports, so tests/contact.test.ts can load it.
//
// PostgREST's `ilike` takes a LIKE pattern: a typed "%@gmail.com" would
// match every Gmail address and hand back a stranger's name and avatar.
// escapeLike() turns the three pattern characters into literals.
// ============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cased, trimmed email or null. Length-capped at RFC 5321's 254. */
export function asEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s.length > 0 && s.length <= 254 && EMAIL_RE.test(s) ? s : null;
}

/** Digits only, 7–15 of them (E.164 bounds), or null. */
export function asPhoneDigits(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = v.replace(/[^0-9]/g, '');
  return d.length >= 7 && d.length <= 15 ? d : null;
}

/** Make a string safe as a LIKE/ILIKE pattern that must match literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}
