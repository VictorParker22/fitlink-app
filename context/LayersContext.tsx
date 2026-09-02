/**
 * context/LayersContext.tsx
 *
 * Analytics provider for the Layers Events SDK (fetch-based implementation).
 *
 * Responsibilities:
 *   - Initialize the SDK once at app startup
 *   - Track `app_open` on every cold start
 *   - Forward deep links to the SDK for attribution
 *   - Provide `useLayers()` hook for component-level event tracking
 *
 * Note: iOS App Tracking Transparency (ATT) is no longer needed since we
 * use our own fetch-based client which doesn't collect IDFA.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  type PropsWithChildren,
} from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { layers } from '../lib/layers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LayersContextType {
  /** Track any custom event */
  track: (event: string, properties?: Record<string, unknown>) => void;
  /** Identify an authenticated user with properties */
  identify: (userId: string, properties?: Record<string, unknown>) => void;
  /** Reset identity on sign-out */
  reset: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const LayersContext = createContext<LayersContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function LayersAnalyticsProvider({ children }: PropsWithChildren) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // 1. Boot the SDK
    layers.init();

    // 2. Track cold-start app open
    layers.track('app_open', { platform: Platform.OS });

    // 3. Handle deep link attribution
    const handleURL = (url: string | null) => {
      if (!url) return;
      // Path only. Query strings and fragments carry invite codes, tokens and
      // referral ids — attribution needs the route, not the payload.
      const path = url.split(/[?#]/)[0];
      if (__DEV__) console.log('[Layers] Deep link:', path);
      layers.track('deep_link_open', { url: path });
    };

    // Cold-start URL (app opened from a link while closed)
    Linking.getInitialURL().then(handleURL).catch(Boolean);

    // Warm-start URLs (app already open, link tapped)
    const sub = Linking.addEventListener('url', ({ url }) => handleURL(url));

    return () => sub.remove();
  }, []);

  // ── Stable helpers ──────────────────────────────────────────────────────────

  const track = useCallback(
    (event: string, properties?: Record<string, unknown>) => {
      try {
        layers.track(event, properties);
      } catch (e) {
        if (__DEV__) console.warn('[Layers] track error:', e);
      }
    },
    []
  );

  const identify = useCallback(
    (userId: string, properties?: Record<string, unknown>) => {
      try {
        layers.identify(userId, properties);
      } catch (e) {
        if (__DEV__) console.warn('[Layers] identify error:', e);
      }
    },
    []
  );

  const reset = useCallback(() => {
    try {
      layers.reset();
    } catch (e) {
      if (__DEV__) console.warn('[Layers] reset error:', e);
    }
  }, []);

  return (
    <LayersContext.Provider value={{ track, identify, reset }}>
      {children}
    </LayersContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLayers(): LayersContextType {
  const ctx = useContext(LayersContext);
  if (!ctx) throw new Error('useLayers must be used within LayersAnalyticsProvider');
  return ctx;
}
