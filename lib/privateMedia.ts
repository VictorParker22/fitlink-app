/**
 * lib/privateMedia.ts — reading objects out of PRIVATE storage buckets.
 *
 * chat-attachments and progress-photos are private (see
 * supabase/migrations/security_phase_e_private_media.sql). A `public: true`
 * bucket is served by the storage CDN WITHOUT consulting RLS, so while those
 * buckets were public, every attachment in every coaching DM — body photos,
 * injury photos, medical documents — was readable by anyone holding the URL,
 * and listable by anyone at all. Policies only ever governed listing and
 * writing, never the CDN read.
 *
 * Private buckets have no permanent URL, so a render has to mint a short-lived
 * signed one. Two things make that practical:
 *
 *  1. Rows already store FULL public URLs (`.../object/public/<bucket>/<path>`)
 *     from before the flip. `storagePathFromUrl` recovers the bucket and path
 *     from those, so no data migration is needed and old rows keep working.
 *  2. Signing is a network round-trip per object, so results are cached in
 *     memory until shortly before they expire. A chat thread re-rendering does
 *     not re-sign on every frame.
 */

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Buckets this module is allowed to sign for. */
export type PrivateBucket = 'chat-attachments' | 'progress-photos';
const PRIVATE_BUCKETS: readonly string[] = ['chat-attachments', 'progress-photos'];

const TTL_SECONDS = 60 * 60;           // 1 hour
const REFRESH_MARGIN_MS = 5 * 60_000;  // re-sign 5 min before expiry

const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Pull `{ bucket, path }` out of a Supabase storage URL, public or signed.
 * Returns null for anything that is not one of our private buckets — an
 * ordinary https URL (an avatar, an ExerciseDB gif) passes through untouched.
 */
export function storagePathFromUrl(
  url: string | null | undefined
): { bucket: PrivateBucket; path: string } | null {
  if (!url || typeof url !== 'string') return null;
  // .../storage/v1/object/public/<bucket>/<path>  (legacy rows)
  // .../storage/v1/object/sign/<bucket>/<path>    (already signed)
  // .../storage/v1/object/<bucket>/<path>
  const m = url.match(/\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/?#]+)\/(.+?)(?:\?|#|$)/);
  if (!m) return null;
  const [, bucket, rawPath] = m;
  if (!PRIVATE_BUCKETS.includes(bucket)) return null;
  let path: string;
  try { path = decodeURIComponent(rawPath); } catch { path = rawPath; }
  return { bucket: bucket as PrivateBucket, path };
}

/**
 * A usable URL for `stored`, signing it when it lives in a private bucket.
 *
 * Returns the original string when it is not private-bucket media, and null
 * only when signing genuinely failed — callers must treat null as "cannot
 * show this", never as a reason to render a broken image.
 */
export async function resolveMediaUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  const ref = storagePathFromUrl(stored);
  if (!ref) return stored; // not ours / not private — hand it back unchanged

  const key = `${ref.bucket}/${ref.path}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return hit.url;

  // Storage calls resolve with { error }; they do not throw.
  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, TTL_SECONDS);

  if (error || !data?.signedUrl) {
    if (__DEV__) console.warn('[privateMedia] Could not sign', key, error?.message);
    return null;
  }
  cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  return data.signedUrl;
}

/** Drop cached signatures — call on sign-out so they cannot outlive the session. */
export function clearMediaUrlCache(): void {
  cache.clear();
}

/**
 * Hook form for render paths.
 *
 * `ready` distinguishes "still signing" from "cannot show it", so a caller can
 * hold a placeholder instead of flashing a broken image and can show an honest
 * failure state rather than an endless spinner.
 */
export function useSignedMediaUrl(stored: string | null | undefined): {
  url: string | null;
  ready: boolean;
  failed: boolean;
} {
  const [url, setUrl] = useState<string | null>(() =>
    stored && !storagePathFromUrl(stored) ? stored : null
  );
  const [ready, setReady] = useState(() => !!stored && !storagePathFromUrl(stored));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!stored) { setUrl(null); setReady(true); setFailed(false); return; }
    const ref = storagePathFromUrl(stored);
    if (!ref) { setUrl(stored); setReady(true); setFailed(false); return; }

    setReady(false);
    setFailed(false);
    resolveMediaUrl(stored).then((resolved) => {
      if (!alive) return;
      setUrl(resolved);
      setFailed(resolved === null);
      setReady(true);
    });
    return () => { alive = false; };
  }, [stored]);

  return { url, ready, failed };
}
