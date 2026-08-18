/**
 * lib/safeUrl.ts — scheme and host validation for anything we hand to the OS.
 *
 * WHY THIS EXISTS
 * Exercise and class video URLs are user-writable content: `classes.video_url`
 * and `workout_exercises.video_url` are written by coaches (and, before the
 * Phase A policy fixes, by anyone holding the shipped anon key). Every one of
 * those strings previously reached either `Linking.openURL` — which will
 * happily hand `javascript:`, `file:`, `content:`, `intent:` or a custom app
 * scheme to the platform — or expo-video's native media loader, with no
 * validation at all. A planted URL is a phishing tap away from every athlete.
 *
 * The old host test was a substring check:
 *
 *     url.includes('youtube.com')
 *
 * which is true for `https://evil.tld/?ref=youtube.com`, for
 * `https://youtube.com.evil.tld/`, and for `javascript:steal()//youtube.com`.
 * Host decisions must be made on the PARSED hostname, compared exactly.
 *
 * Rules enforced here:
 *   - Parse with `new URL()`. Unparseable → rejected, never "probably fine".
 *   - Only `https:` is allowed for external navigation. Not `http:` (no
 *     transport security on a link we vouch for), not `file:`/`content:`
 *     (local filesystem reads by a native loader), not `javascript:`, not
 *     `fitlink:` or any other app scheme.
 *   - `mailto:` / `tel:` are deliberately NOT lumped in with https. They are a
 *     different trust decision (they compose a message / dial a number), so
 *     they get their own explicit helper that callers must opt into.
 */

import { Linking } from 'react-native';

/**
 * Hosts we recognise as "this is a video page, not a media file" — tapping one
 * should leave the app and open the real client/browser, because feeding a
 * watch page to a native media loader just fails.
 *
 * Exact hostname matches only. No suffix matching, no `includes`: an attacker
 * controls everything to the left of a domain they own.
 */
export const KNOWN_VIDEO_HOSTS: readonly string[] = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'instagram.com',
  'www.instagram.com',
  'tiktok.com',
  'www.tiktok.com',
];

/**
 * Vimeo, kept separate from the list above.
 *
 * `app/class/[id].tsx` has always classified Vimeo links as external. That
 * classification is load-bearing rather than cosmetic: a Vimeo watch page is
 * an HTML document, so dropping it from the list would route it into the
 * inline expo-video player, where it silently fails to play.
 */
export const VIMEO_HOSTS: readonly string[] = [
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
];

/**
 * Parse a URL, or null when the string is not a URL at all. Never throws.
 *
 * Returns the normalised scheme and host alongside the parsed object because
 * React Native's bundled `URL` (Libraries/Blob/URL.js, still shipped in RN
 * 0.81) is NOT the WHATWG implementation: its constructor accepts almost
 * anything without throwing, and `protocol`/`hostname` are regex getters that
 * return `''` when they cannot match. So "it parsed" proves nothing here —
 * every caller must assert on the scheme and host it got back, which is what
 * the exported predicates below do. `new URL()` can still throw (a '#' with no
 * '://' trips it), hence the try/catch.
 */
function parse(url: string | null | undefined): { parsed: URL; protocol: string; hostname: string } | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return {
      parsed,
      protocol: String(parsed.protocol ?? '').toLowerCase(),
      hostname: String(parsed.hostname ?? '').toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * True only for URLs safe to hand to the OS as an external link: parseable,
 * `https:`, and carrying a hostname.
 *
 * The raw-prefix test is deliberate belt-and-braces: it does not depend on any
 * URL implementation at all, so this stays correct if RN's shim is swapped for
 * the spec one (or for a polyfill) underneath us.
 */
export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !/^https:\/\/[^/?#\s]+/i.test(url.trim())) return false;
  const info = parse(url);
  return !!info && info.protocol === 'https:' && info.hostname.length > 0;
}

/**
 * True for URLs safe to hand to a native media loader (expo-video, <Image>).
 * Same rule as external links today — the point is that `file:`, `content:`
 * and `data:` URIs never reach a native loader that will read them off disk.
 */
export function isSafeMediaUrl(url: string | null | undefined): boolean {
  return isSafeExternalUrl(url);
}

/** True when `url` is a safe https URL whose exact hostname is a known video host. */
export function isKnownVideoHost(url: string | null | undefined): boolean {
  if (!isSafeExternalUrl(url)) return false;
  const info = parse(url);
  return !!info && KNOWN_VIDEO_HOSTS.includes(info.hostname);
}

/** True when `url` is a safe https URL whose exact hostname is a Vimeo host. */
export function isVimeoHost(url: string | null | undefined): boolean {
  if (!isSafeExternalUrl(url)) return false;
  const info = parse(url);
  return !!info && VIMEO_HOSTS.includes(info.hostname);
}

/**
 * Open an external link, refusing anything that is not https.
 *
 * Resolves true when the OS accepted the URL, false when we rejected it or the
 * OS could not open it. Callers that show UI on failure should check the
 * result — this never throws and never reports success it did not get.
 */
export async function openExternalUrl(url: string | null | undefined): Promise<boolean> {
  if (!isSafeExternalUrl(url)) {
    if (__DEV__) console.warn('[safeUrl] Blocked non-https external URL:', url);
    return false;
  }
  try {
    await Linking.openURL(url as string);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[safeUrl] Linking.openURL failed:', e);
    return false;
  }
}

/**
 * `mailto:` / `tel:` — deliberately a separate opt-in helper. These are not
 * web navigation; they hand an address or a number to a compose/dial UI, so a
 * caller has to ask for that behaviour explicitly rather than inherit it.
 */
export async function openMailOrTelUrl(url: string | null | undefined): Promise<boolean> {
  const info = parse(url);
  if (!info || (info.protocol !== 'mailto:' && info.protocol !== 'tel:')) {
    if (__DEV__) console.warn('[safeUrl] Blocked non-mailto/tel URL:', url);
    return false;
  }
  try {
    await Linking.openURL(url as string);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[safeUrl] Linking.openURL failed:', e);
    return false;
  }
}
