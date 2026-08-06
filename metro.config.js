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
  // @layers/core-wasm — Rust/WASM bundle, dead code on native (native module takes over).
  // type:'empty' is the cleanest approach for truly dead dependencies.
  if (
    moduleName === '@layers/core-wasm' ||
    moduleName.startsWith('@layers/core-wasm/')
  ) {
    return { type: 'empty' };
  }

  // Node.js built-in `url` — required by @layers/core-wasm's browser.js which calls
  // url.pathToFileURL(). We return a sourceFile shim (not empty) because the code
  // accesses a property (.pathToFileURL) on the result; an empty module would cause
  // a "cannot read properties of undefined" crash at bundle eval time.
  if (moduleName === 'url') {
    return { type: 'sourceFile', filePath: wasmShim };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
