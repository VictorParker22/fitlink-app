// Web fallback — StripeProvider is a passthrough on web
// @stripe/stripe-react-native is native-only and cannot be imported on web
import React from 'react';

export function StripeProvider({ children }: { children: React.ReactNode; [key: string]: any }) {
  return <>{children}</>;
}
