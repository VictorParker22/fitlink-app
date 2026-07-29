/**
 * Spotify Integration — Authorization Code Flow
 * 
 * Uses Auth Code flow with client secret for token exchange.
 * Scopes are read-only (now playing) so risk is minimal.
 */
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { createURL } from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

// Spotify App credentials
const SPOTIFY_CLIENT_ID = '763200d8ed4248ec8bed9b08032ab121';
const SPOTIFY_CLIENT_SECRET = '187c1c899ed6431588f58f2b7395860e';
const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

// Redirect URI
const REDIRECT_URI = createURL('spotify-callback');

// ── Token Storage ──
const TOKEN_KEY = 'spotify_access_token';
const REFRESH_KEY = 'spotify_refresh_token';
const EXPIRY_KEY = 'spotify_token_expiry';

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

    const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
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

// ── Auth (Authorization Code Flow) ──
export async function loginWithSpotify(): Promise<boolean> {
  try {
    const authUrl =
      `https://accounts.spotify.com/authorize` +
      `?client_id=${SPOTIFY_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SPOTIFY_SCOPES)}` +
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
  }
}

// Helper to extract query param (fallback if URL constructor fails with custom schemes)
function extractParam(url: string, param: string): string | null {
  const match = url.match(new RegExp(`[?&]${param}=([^&]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function exchangeCodeForTokens(code: string): Promise<boolean> {
  try {
    const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
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
