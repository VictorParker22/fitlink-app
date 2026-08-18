/**
 * Web stand-in for @stripe/stripe-react-native's useStripe().
 *
 * The package cannot be imported on web at all — it reaches into
 * `react-native/Libraries/Utilities/codegenNativeCommands`, which the web
 * bundler refuses outright. So this is a module split, not a runtime branch:
 * the native file re-exports the real hook, this one never loads the package.
 *
 * PaymentSheet is a native UI. The browser equivalent is Stripe.js +
 * Elements, which is a genuinely different integration — not a shim.
 *
 * THIS IS THE HONEST FAILURE, NOT A SILENT ONE. Both functions resolve with
 * a real `{ error }`, which is the shape the caller already handles, so the
 * checkout screen shows a true message instead of a spinner that never ends
 * or a success that never happened. Design turn 28 says parity is a promise —
 * so this is a promise outstanding, and it says so out loud rather than
 * pretending the button is broken.
 */

const UNSUPPORTED = {
  code: 'WebNotSupported',
  message:
    'Card payment needs the FitLink app on your phone. Open this pass there to finish checking out.',
};

export function useStripe() {
  return {
    initPaymentSheet: async (_opts?: unknown) => ({ error: UNSUPPORTED }),
    presentPaymentSheet: async () => ({ error: UNSUPPORTED }),
  };
}
