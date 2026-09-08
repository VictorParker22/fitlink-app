// ============================================================
// muxTokenCore.ts — the pure half of signed Mux playback: PEM parsing, the
// PKCS#1 → PKCS#8 wrap WebCrypto needs, base64url and RS256 JWT signing.
// No Deno, no network, no imports, so tests/muxToken.test.ts can prove the
// wrapper against a real RSA key before a phone ever asks for a token.
// ============================================================

export function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let v = n;
  while (v > 0) { bytes.unshift(v & 0xff); v = Math.floor(v / 256); }
  return [0x80 | bytes.length, ...bytes];
}

/** Mux hands back a PKCS#1 RSA key; WebCrypto imports PKCS#8. Wrap it. */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = [0x02, 0x01, 0x00];
  const algId = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...derLength(pkcs1.length), ...Array.from(pkcs1)];
  const body = [...version, ...algId, ...octet];
  return new Uint8Array([0x30, ...derLength(body.length), ...body]);
}

export function b64url(input: Uint8Array | string): string {
  let bin: string;
  if (typeof input === 'string') bin = unescape(encodeURIComponent(input));
  else { bin = ''; for (let i = 0; i < input.length; i++) bin += String.fromCharCode(input[i]); }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCS#8 DER for any RSA private-key PEM Mux (or a test) can produce. */
export function privateKeyPemToPkcs8(pem: string): Uint8Array {
  const der = pemToDer(pem);
  return /BEGIN RSA PRIVATE KEY/.test(pem) ? pkcs1ToPkcs8(der) : der;
}

export async function importRs256PrivateKey(subtle: SubtleCrypto, pem: string): Promise<CryptoKey> {
  const der = privateKeyPemToPkcs8(pem);
  // A fresh ArrayBuffer: TypeScript's BufferSource does not accept a
  // Uint8Array over a shared/resizable buffer, and Deno's does not care.
  const buf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
  return subtle.importKey('pkcs8', buf, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** Mux playback JWT: sub = playback id, aud 'v', kid = signing key id. */
export async function signMuxPlaybackJwt(
  subtle: SubtleCrypto,
  key: CryptoKey,
  keyId: string,
  playbackId: string,
  expSeconds: number,
): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId }));
  const payload = b64url(JSON.stringify({ sub: playbackId, aud: 'v', exp: expSeconds, kid: keyId }));
  const signingInput = `${header}.${payload}`;
  const input = new TextEncoder().encode(signingInput);
  const inputBuf = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  const sig = new Uint8Array(await subtle.sign('RSASSA-PKCS1-v1_5', key, inputBuf));
  return `${signingInput}.${b64url(sig)}`;
}
