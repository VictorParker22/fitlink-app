/**
 * shims/layers-core-wasm-shim.js
 *
 * Metro shim for @layers/core-wasm.
 *
 * @layers/react-native uses @layers/core-wasm (a Rust/WASM build) as its JS-side
 * core. Metro cannot bundle WebAssembly or Node.js built-ins (like `url`), so this
 * shim replaces the WASM import entirely.
 *
 * At runtime the @layers/react-native Expo plugin registers a native module
 * (LayersReactNativeModule) on both iOS and Android that handles all actual
 * event processing — the WASM core is only needed if the native module is absent
 * (i.e. web/test environments). Since we are building a native app this shim is safe.
 */
module.exports = {
  // No-op implementations — the native module takes over at runtime
  init: () => {},
  track: () => {},
  identify: () => {},
  reset: () => {},
};
