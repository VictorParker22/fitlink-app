/**
 * BASE module — deliberately the WEB-SAFE implementation.
 *
 * Metro prefers `.native.ts` on iOS/Android, so native still gets the real
 * StripeProvider. The base is what any other resolution path lands on
 * (SSR passes, tooling, a bundler that does not apply `.web.*`), and
 * @stripe/stripe-react-native cannot be imported there AT ALL — it reaches
 * into react-native internals the web bundler rejects outright, which fails
 * the whole build rather than degrading.
 *
 * So the base fails SAFE: a miss yields a passthrough, not a broken bundle.
 * The previous arrangement had the base re-export the native package, which
 * meant every non-native resolution path detonated.
 */
import React from 'react';

export function StripeProvider({ children }: { children: React.ReactNode; [key: string]: any }) {
  return React.createElement(React.Fragment, null, children);
}
