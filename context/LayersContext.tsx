/**
 * context/LayersContext.tsx
 *
 * Wraps the Layers Events SDK for the whole app.
 *
 * Responsibilities:
 *   - Initialize the SDK once at app startup
 *   - Track `app_open` on every cold start
 *   - Request iOS App Tracking Transparency (ATT) after first navigation
 *   - Forward deep links to the SDK for attribution
 *   - Provide `useLayers()` hook for component-level event tracking
 *
 * Usage:
 *   import { useLayers } from '../context/LayersContext';
 *   const { track, identify } = useLayers();
 *   track('workout_started', { workout_id: '...' });
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
import { LayersProvider } from '@layers/expo';
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

    // 3. iOS — request App Tracking Transparency permission
    //    We do this after a short delay so it doesn't interrupt splash exit.
    if (Platform.OS === 'ios') {
      const requestATT = async () => {
        try {
          const { requestTrackingPermissionsAsync, getTrackingPermissionsAsync } =
            await import('expo-tracking-transparency');
          const { status } = await getTrackingPermissionsAsync();
          if (status === 'undetermined') {
            // Small delay so the ATT dialog appears after the UI has settled
            await new Promise(resolve => setTimeout(resolve, 500));
            const { status: granted } = await requestTrackingPermissionsAsync();
            if (__DEV__) console.log('[Layers] ATT status:', granted);
          }
        } catch (e) {
          if (__DEV__) console.warn('[Layers] ATT request error:', e);
        }
      };
      requestATT();
    }

    // 4. Handle deep link attribution
    //    The SDK auto-tracks sessions; we forward the URL for attribution.
    const handleURL = (url: string | null) => {
      if (!url) return;
      if (__DEV__) console.log('[Layers] Deep link:', url);
      // Forward to SDK attribution pipeline if the SDK exposes a method
      // e.g. layers.handleDeepLink?.(url);
      layers.track('deep_link_open', { url });
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
      // Reset identity (e.g., on sign-out) — SDK method name may vary
      (layers as any).reset?.();
    } catch (e) {
      if (__DEV__) console.warn('[Layers] reset error:', e);
    }
  }, []);

  return (
    <LayersContext.Provider value={{ track, identify, reset }}>
      {/* LayersProvider from @layers/expo enables the useLayers() SDK hook */}
      <LayersProvider client={layers}>{children}</LayersProvider>
    </LayersContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLayers(): LayersContextType {
  const ctx = useContext(LayersContext);
  if (!ctx) throw new Error('useLayers must be used within LayersAnalyticsProvider');
  return ctx;
}
