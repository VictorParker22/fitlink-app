/**
 * lib/layers.ts
 *
 * Singleton Layers Events SDK client.
 * Import `layers` directly to track events from outside React components
 * (e.g. AuthContext, RevenueCatContext).
 *
 * For component-level usage, prefer the useLayers() hook from LayersContext.
 */
import { LayersReactNative } from '@layers/expo';

export const layers = new LayersReactNative({
  appId: 'app_17a207a1ef88166e',
  enableDebug: __DEV__,
});
