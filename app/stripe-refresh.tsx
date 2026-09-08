/**
 * fitlink://stripe-refresh — Stripe's "link expired, start again" return.
 * Same landing as stripe-return; the coach re-opens payouts from settings.
 */
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function StripeRefresh() {
  const { userRole, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Redirect href={'/(auth)/welcome' as any} />;
  return <Redirect href={(userRole === 'client' ? '/(client-tabs)' : '/(tabs)') as any} />;
}
