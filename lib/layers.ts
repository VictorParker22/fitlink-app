/**
 * lib/layers.ts
 *
 * Layers Events SDK — pure fetch implementation.
 *
 * The official @layers/expo / @layers/react-native packages ship a Rust/WASM
 * core (@layers/core-wasm) that is incompatible with React Native's Hermes
 * engine and Metro bundler (WASM binaries + Node.js built-ins aren't supported).
 *
 * This implementation replicates the SDK's behaviour by calling the Layers
 * Events REST API directly:
 *   POST https://in.layers.com/events       — event batch
 *   POST https://in.layers.com/users/properties — user identify
 *
 * Features:
 *   - Auto-batches events (flush every 30 s or 20 events — matching SDK defaults)
 *   - Queues events offline and flushes on reconnect
 *   - Attaches anonymous ID (UUID) persisted in AsyncStorage
 *   - Identifies authenticated users
 *   - Debug logging when enableDebug is true
 */

import { Platform, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL         = 'https://in.layers.com';
const MAX_BATCH_SIZE   = 20;
const FLUSH_INTERVAL   = 30_000; // 30 s
const ANON_ID_KEY      = '@layers/anonymous_id';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LayersConfig {
  appId: string;
  enableDebug?: boolean;
  baseUrl?: string;
}

interface LayersEvent {
  event:        string;
  properties:   Record<string, unknown>;
  userId?:      string;
  anonymousId:  string;
  appId:        string;
  timestamp:    string;
  platform:     string;
  sdkVersion:   string;
}

// ─── Tiny UUID (no external deps) ─────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Client ───────────────────────────────────────────────────────────────────

class LayersClient {
  private readonly config:   LayersConfig;
  private readonly baseUrl:  string;
  private queue:             LayersEvent[] = [];
  private anonymousId:       string        = uuid(); // replaced after AsyncStorage loads
  private userId:            string | undefined;
  private userProperties:    Record<string, unknown> = {};
  private flushTimer:        ReturnType<typeof setInterval> | null = null;
  private initialized        = false;

  constructor(config: LayersConfig) {
    this.config  = config;
    this.baseUrl = (config.baseUrl ?? BASE_URL).replace(/\/$/, '');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Rehydrate or create anonymous ID
    AsyncStorage.getItem(ANON_ID_KEY).then(stored => {
      if (stored) {
        this.anonymousId = stored;
      } else {
        AsyncStorage.setItem(ANON_ID_KEY, this.anonymousId).catch(Boolean);
      }
    }).catch(Boolean);

    // Periodic flush
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL);

    // Flush when app goes to background
    AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        this.flush();
      }
    });

    if (this.config.enableDebug) {
      console.log('[Layers] Initialized — appId:', this.config.appId);
    }
  }

  /** Track a custom event */
  track(event: string, properties: Record<string, unknown> = {}): void {
    const payload: LayersEvent = {
      event,
      properties,
      userId:      this.userId,
      anonymousId: this.anonymousId,
      appId:       this.config.appId,
      timestamp:   new Date().toISOString(),
      platform:    Platform.OS,
      sdkVersion:  '3.2.4-fetch',
    };

    this.queue.push(payload);

    if (this.config.enableDebug) {
      console.log('[Layers] Queued event:', event, properties);
    }

    if (this.queue.length >= MAX_BATCH_SIZE) {
      this.flush();
    }
  }

  /** Associate subsequent events with an authenticated user */
  identify(userId: string, properties: Record<string, unknown> = {}): void {
    this.userId         = userId;
    this.userProperties = { ...this.userProperties, ...properties };

    if (this.config.enableDebug) {
      console.log('[Layers] Identify:', userId, properties);
    }

    // Send user properties to Layers
    this.sendUserProperties(userId, properties).catch(Boolean);

    // Also emit an identify event into the batch
    this.track('identify', { userId, ...properties });
  }

  /** Clear identity (e.g. on sign-out) */
  reset(): void {
    this.userId         = undefined;
    this.userProperties = {};
    this.anonymousId    = uuid();
    AsyncStorage.setItem(ANON_ID_KEY, this.anonymousId).catch(Boolean);

    if (this.config.enableDebug) {
      console.log('[Layers] Identity reset');
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);
    const url   = `${this.baseUrl}/events`;

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          // Layers REST API uses Bearer token auth — the appId IS the token
          'Authorization': `Bearer ${this.config.appId}`,
          ...(this.config.enableDebug ? { 'X-Debug-Token': '1' } : {}),
        },
        body: JSON.stringify({ events: batch }),
      });

      if (this.config.enableDebug) {
        console.log(`[Layers] Flushed ${batch.length} events →`, res.status);
      }

      if (!res.ok) {
        if (res.status >= 500) {
          // 5xx = transient server error → re-queue to retry next flush
          this.queue.unshift(...batch);
          if (this.config.enableDebug) {
            console.warn('[Layers] Server error, re-queued for retry:', res.status);
          }
        } else {
          // 4xx = permanent client error (bad payload, wrong auth, etc.)
          // DO NOT re-queue — it will keep failing forever
          if (this.config.enableDebug) {
            const body = await res.text().catch(() => '(unreadable)');
            console.warn(`[Layers] Flush rejected ${res.status} — dropped ${batch.length} events. Response:`, body);
          }
        }
      }
    } catch (e) {
      // Network error / offline — re-queue to retry when connection returns
      this.queue.unshift(...batch);
      if (this.config.enableDebug) {
        console.warn('[Layers] Flush error (offline?), re-queued:', e);
      }
    }
  }

  private async sendUserProperties(
    userId:     string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/users/properties`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.config.appId}`,
        },
        body: JSON.stringify({ userId, anonymousId: this.anonymousId, properties }),
      });
      if (!res.ok && this.config.enableDebug) {
        const body = await res.text().catch(() => '(unreadable)');
        console.warn('[Layers] sendUserProperties failed:', res.status, body);
      }
    } catch (e) {
      if (this.config.enableDebug) {
        console.warn('[Layers] sendUserProperties error:', e);
      }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const layers = new LayersClient({
  appId:       'app_17a207a1ef88166e',
  enableDebug: __DEV__,
});
