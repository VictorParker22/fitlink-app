/**
 * Signed Mux playback: prove the PKCS#1 → PKCS#8 wrap and the RS256 JWT
 * against a real RSA key, with Node's WebCrypto standing in for Deno's.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, verify, webcrypto } from 'crypto';
import { b64url, importRs256PrivateKey, pkcs1ToPkcs8, signMuxPlaybackJwt } from '../supabase/functions/_shared/muxTokenCore';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;

function decodeB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

describe('signed Mux playback', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pkcs1Pem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
  const pkcs8Pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }) as string;

  it('wraps a PKCS#1 key into PKCS#8 that WebCrypto accepts', async () => {
    expect(pkcs1Pem).toMatch(/BEGIN RSA PRIVATE KEY/);
    const wrapped = pkcs1ToPkcs8(Buffer.from(pkcs1Pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64'));
    // Node re-parses the wrapped DER as PKCS#8 and it equals the key Node itself exports.
    const reparsed = createPrivateKey({ key: Buffer.from(wrapped), format: 'der', type: 'pkcs8' });
    expect(reparsed.export({ type: 'pkcs8', format: 'pem' })).toBe(pkcs8Pem);
    await expect(importRs256PrivateKey(subtle, pkcs1Pem)).resolves.toBeDefined();
    await expect(importRs256PrivateKey(subtle, pkcs8Pem)).resolves.toBeDefined();
  });

  it('mints a token Mux would accept: RS256, kid, sub = playback id, aud v, exp', async () => {
    const key = await importRs256PrivateKey(subtle, pkcs1Pem);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signMuxPlaybackJwt(subtle, key, 'key_123', 'pb_abc', exp);
    const [h, p, s] = token.split('.');
    expect(JSON.parse(decodeB64url(h).toString())).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'key_123' });
    expect(JSON.parse(decodeB64url(p).toString())).toEqual({ sub: 'pb_abc', aud: 'v', exp, kid: 'key_123' });
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), publicPem, decodeB64url(s));
    expect(ok).toBe(true);
  });

  it('base64url has no padding or URL-unsafe characters', () => {
    const out = b64url(new Uint8Array([251, 255, 254, 0, 1]));
    expect(out).not.toMatch(/[+/=]/);
  });
});
