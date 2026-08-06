const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('lottie');

/**
 * Custom resolver to handle packages that Metro can't bundle:
 *
 * 1. @layers/core-wasm — Rust/WASM core. Metro can't bundle WebAssembly or
 *    Node.js built-ins (`url`). We shim it with a no-op; the native module
 *    registered by the @layers/expo Expo plugin handles all actual work at runtime.
 *
 * 2. `url` (Node built-in) — required transitively by @layers/core-wasm.
 *    Resolved to the same no-op shim so Metro stops throwing on it.
 */
const wasmShim = path.resolve(__dirname, 'shims/layers-core-wasm-shim.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === '@layers/core-wasm' ||
    moduleName.startsWith('@layers/core-wasm/')
  ) {
    return { type: 'sourceFile', filePath: wasmShim };
  }
  // Node.js built-in `url` — only shim when imported by @layers internals
  // (safe because RN doesn't use Node's url module anywhere)
  if (moduleName === 'url') {
    return { type: 'sourceFile', filePath: wasmShim };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
