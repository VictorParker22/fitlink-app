/**
 * Spotify Integration — Authorization Code + PKCE
 *
 * PKCE (no client secret) is the correct OAuth flow for a distributed
 * mobile app — a client secret embedded in a shipped app binary can always
 * be extracted by decompiling it, so Spotify (like most providers) supports
 * PKCE specifically so public clients never need one. Scopes are read-only
 * (now playing) so risk is minimal either way.
 */
import * as WebBrowser from 'expo-web-browser';
// Platform-aware wrapper: expo-secure-store has NO web implementation and
// throws on first call. See ./secureStore.ts.
import * as SecureStore from './secureStore';
import * as Crypto from 'expo-crypto';
import { encode as base64Encode } from 'base64-arraybuffer';
import { createURL } from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

// Spotify App credentials — the client ID is public by design (it's sent in
// the authorize URL); PKCE means no client secret is needed at all.
const SPOTIFY_CLIENT_ID = '763200d8ed4248ec8bed9b08032ab121';
const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

// Redirect URI
const REDIRECT_URI = createURL('spotify-callback');

// ── Token Storage ──
const TOKEN_KEY = 'spotify_access_token';
const REFRESH_KEY = 'spotify_refresh_token';
const EXPIRY_KEY = 'spotify_token_expiry';

// Holds the PKCE code_verifier for the duration of one login attempt —
// generated in loginWithSpotify(), consumed in exchangeCodeForTokens().
let pendingCodeVerifier: string | null = null;

// ── PKCE helpers ──
function base64UrlEncode(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(64);
  return base64UrlEncode(base64Encode(bytes.buffer as ArrayBuffer));
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digestBase64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return base64UrlEncode(digestBase64);
}

export async function getStoredToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const expiry = await SecureStore.getItemAsync(EXPIRY_KEY);

    if (token && expiry) {
      if (Date.now() < parseInt(expiry, 10)) {
        return token;
      }
      // Expired — try refresh
      return await refreshAccessToken();
    }
    return null;
  } catch {
    return null;
  }
}

async function storeTokens(accessToken: string, refreshToken: string | null, expiresIn: number) {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  if (refreshToken) {
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  }
  await SecureStore.setItemAsync(EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refreshToken) return null;

    // PKCE public clients refresh with just client_id in the body — no
    // Authorization header / secret needed.
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}` +
        `&client_id=${SPOTIFY_CLIENT_ID}`,
    });

    const data = await response.json();
    if (data.access_token) {
      await storeTokens(data.access_token, data.refresh_token || refreshToken, data.expires_in || 3600);
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Auth (Authorization Code + PKCE) ──
export async function loginWithSpotify(): Promise<boolean> {
  try {
    const verifier = await generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    pendingCodeVerifier = verifier;

    const authUrl =
      `https://accounts.spotify.com/authorize` +
      `?client_id=${SPOTIFY_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SPOTIFY_SCOPES)}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${challenge}` +
      `&show_dialog=true`;

    if (__DEV__) console.log('[Spotify] Redirect URI:', REDIRECT_URI);
    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
    if (__DEV__) console.log('[Spotify] Auth result type:', result.type, 'url' in result ? result.url : '');

    if (result.type === 'success' && result.url) {
      // Parse the code from the URL query params
      const code = extractParam(result.url, 'code');
      if (__DEV__) console.log('[Spotify] Extracted code:', code ? code.substring(0, 20) + '...' : 'NONE');

      if (code) {
        return await exchangeCodeForTokens(code);
      }
    }
    return false;
  } catch (e) {
    if (__DEV__) console.log('[Spotify] Login error:', e);
    return false;
  } finally {
    pendingCodeVerifier = null;
  }
}

// Helper to extract query param (fallback if URL constructor fails with custom schemes)
function extractParam(url: string, param: string): string | null {
  const match = url.match(new RegExp(`[?&]${param}=([^&]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function exchangeCodeForTokens(code: string): Promise<boolean> {
  try {
    const verifier = pendingCodeVerifier;
    if (!verifier) {
      if (__DEV__) console.log('[Spotify] Token exchange failed: missing code_verifier');
      return false;
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        `grant_type=authorization_code&code=${encodeURIComponent(code)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&client_id=${SPOTIFY_CLIENT_ID}` +
        `&code_verifier=${encodeURIComponent(verifier)}`,
    });

    const data = await response.json();
    if (data.access_token) {
      await storeTokens(data.access_token, data.refresh_token, data.expires_in || 3600);
      return true;
    }
    if (__DEV__) console.log('[Spotify] Token exchange failed:', data);
    return false;
  } catch (e) {
    if (__DEV__) console.log('[Spotify] Token exchange error:', e);
    return false;
  }
}

// ── Now Playing API ──
export interface NowPlayingTrack {
  isPlaying: boolean;
  trackName: string;
  artistName: string;
  albumArt: string;
  progressMs: number;
  durationMs: number;
}

export async function getNowPlaying(): Promise<NowPlayingTrack | null> {
  const token = await getStoredToken();
  if (!token) return null;

  try {
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 204) return null; // Nothing playing
    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.item) return null;

    return {
      isPlaying: data.is_playing,
      trackName: data.item.name,
      artistName: data.item.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
      albumArt: data.item.album?.images?.[0]?.url || '',
      progressMs: data.progress_ms || 0,
      durationMs: data.item.duration_ms || 0,
    };
  } catch {
    return null;
  }
}

// ── Playback Controls ──
async function spotifyCommand(method: 'PUT' | 'POST', endpoint: string): Promise<boolean> {
  const token = await getStoredToken();
  if (__DEV__) console.log(`[Spotify] Command: ${endpoint}, hasToken: ${!!token}`);
  if (!token) return false;
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (__DEV__) console.log(`[Spotify] ${endpoint} response: ${res.status}`);
    if (res.status === 404 || res.status === 403) {
      // No active device — open Spotify app so user gets a device
      if (__DEV__) console.log('[Spotify] No active device, opening Spotify app');
      const { Linking } = require('react-native');
      Linking.openURL('spotify://').catch(() =>
        Linking.openURL('https://open.spotify.com')
      );
      return false;
    }
    return res.ok || res.status === 204;
  } catch (e) {
    if (__DEV__) console.log('[Spotify] Command error:', e);
    return false;
  }
}

export const spotifyPlay = () => spotifyCommand('PUT', 'play');
export const spotifyPause = () => spotifyCommand('PUT', 'pause');
export const spotifyNext = () => spotifyCommand('POST', 'next');
export const spotifyPrevious = () => spotifyCommand('POST', 'previous');

// ── Debug: check token status ──
export async function debugSpotifyStatus() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const expiry = await SecureStore.getItemAsync(EXPIRY_KEY);
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  console.log('[Spotify Debug]', {
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 20) + '...' : null,
    hasRefresh: !!refresh,
    expiry: expiry ? new Date(parseInt(expiry, 10)).toISOString() : null,
    isExpired: expiry ? Date.now() > parseInt(expiry, 10) : null,
  });
}

// ── Disconnect ──
export async function disconnectSpotify() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(EXPIRY_KEY);
}
