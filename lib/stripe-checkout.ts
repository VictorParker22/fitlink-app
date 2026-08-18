/**
 * BASE module — the web-safe useStripe(), for the same reason as
 * stripe-provider.ts: the real package cannot be imported outside native.
 * `.native.ts` carries the real hook.
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
