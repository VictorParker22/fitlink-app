// Standard react-native-reanimated jest setup: the library ships its own
// mock (no native worklets in the JS test environment) and asks every
// consumer to wire it in via jest's setupFiles. Without this, importing
// constants/motion.ts (which pulls in `Easing` from reanimated) either
// throws or drags in native bindings jsdom cannot satisfy.
require('react-native-reanimated/mock');
