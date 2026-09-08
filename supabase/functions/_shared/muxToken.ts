// ============================================================
// muxToken.ts — signed Mux playback (threat model A8).
//
// Live streams are created with playback_policy 'signed', so the playback
// id alone plays nothing: every viewer needs a short-lived RS256 JWT minted
// here after the caller's right to watch has been checked. The signing key
// is created once through Mux's API and kept in Supabase Vault behind the
// service-only wrappers store_platform_secret / get_platform_secret; it is
// never an environment variable and never leaves the server. The crypto
// itself lives in muxTokenCore.ts, which jest proves against a real key.
// ============================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.105.3';
import { importRs256PrivateKey, signMuxPlaybackJwt } from './muxTokenCore.ts';

const SECRET_NAME = 'mux_signing_key';
const MUX_TOKEN_ID = Deno.env.get('MuxAccessToken') ?? '';
const MUX_TOKEN_SECRET = Deno.env.get('MuxSecret') ?? '';

interface SigningKey { id: string; pem: string }
let cached: { key: SigningKey; cryptoKey: CryptoKey } | null = null;

/** Create the signing key at Mux once and keep it in Vault. Idempotent. */
async function ensureSigningKey(admin: SupabaseClient): Promise<SigningKey> {
  const { data: existing, error } = await admin.rpc('get_platform_secret', { p_name: SECRET_NAME });
  if (error) throw new Error(`vault read failed: ${error.message}`);
  if (typeof existing === 'string' && existing) {
    const parsed = JSON.parse(existing) as SigningKey;
    if (parsed?.id && parsed?.pem) return parsed;
  }
  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) throw new Error('Mux credentials are not configured');
  const res = await fetch('https://api.mux.com/video/v1/signing-keys', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`)}` },
  });
  if (!res.ok) throw new Error(`Mux signing key creation failed: ${res.status}`);
  const body = await res.json();
  const id: string = body?.data?.id;
  const pem = atob(String(body?.data?.private_key ?? ''));
  if (!id || !pem.includes('PRIVATE KEY')) throw new Error('Mux returned no usable signing key');
  const key: SigningKey = { id, pem };
  const { error: storeErr } = await admin.rpc('store_platform_secret', { p_name: SECRET_NAME, p_value: JSON.stringify(key) });
  if (storeErr) throw new Error(`vault write failed: ${storeErr.message}`);
  console.log('[muxToken] signing key created', id);
  return key;
}

/**
 * A playback token for one playback id. `ttlSeconds` is how long the
 * viewer's link works; the app asks again when it expires.
 */
export async function signPlaybackToken(admin: SupabaseClient, playbackId: string, ttlSeconds = 6 * 3600): Promise<{ token: string; expiresAt: number }> {
  if (!cached) {
    const key = await ensureSigningKey(admin);
    cached = { key, cryptoKey: await importRs256PrivateKey(crypto.subtle, key.pem) };
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await signMuxPlaybackJwt(crypto.subtle, cached.cryptoKey, cached.key.id, playbackId, exp);
  return { token, expiresAt: exp * 1000 };
}
