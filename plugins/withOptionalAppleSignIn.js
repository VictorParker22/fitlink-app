// expo-apple-authentication's autolinked config plugin adds the
// com.apple.developer.applesignin entitlement unconditionally. Until the
// provisioning profile carries that capability (an interactive `eas build`
// regenerates it), a build with the entitlement fails at signing — build 26
// and 27. This plugin runs after the autolinked ones and removes the
// entitlement whenever app.json says ios.usesAppleSignIn is false, so the
// module can stay installed and the button stays behind its flag.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withOptionalAppleSignIn(config) {
  return withEntitlementsPlist(config, (c) => {
    if (!c.ios || c.ios.usesAppleSignIn !== true) {
      delete c.modResults['com.apple.developer.applesignin'];
    }
    return c;
  });
};
