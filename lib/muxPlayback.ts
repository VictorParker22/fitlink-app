/**
 * lib/muxPlayback.ts — signed live playback (threat model A8).
 *
 * Live streams are created with a signed playback policy, so the playback
 * id in `live_classes` plays nothing on its own. A viewer who may watch
 * (owner, roster athlete, invite seat) asks `mux-playback-token` for a URL
 * that carries a short-lived token; the server checks the right to watch
 * before signing. Tokens are cached per class until shortly before expiry.
 */
import { supabase } from './supabase';

interface Signed { url: string; expiresAt: number }
const cache = new Map<string, Signed>();

export async function fetchSignedPlaybackUrl(liveClassId: string): Promise<string | null> {
  const hit = cache.get(liveClassId);
  if (hit && hit.expiresAt - Date.now() > 5 * 60 * 1000) return hit.url;
  const { data, error } = await supabase.functions.invoke('mux-playback-token', { body: { liveClassId } });
  if (error || !data?.url) return null;
  const signed = { url: String(data.url), expiresAt: Number(data.expiresAt) || Date.now() + 60 * 60 * 1000 };
  cache.set(liveClassId, signed);
  return signed.url;
}
