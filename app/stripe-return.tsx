/**
 * fitlink://stripe-return — where Stripe sends a coach back after Connect
 * onboarding (supabase/functions/stripe-redirect). The in-app auth session
 * normally swallows this URL before the router sees it; this route exists so
 * that when it does reach the router (external Safari, a cold start) the app
 * lands somewhere real instead of an unmatched route with the wizard's
 * overlay stranded behind it, which read as a frozen app (2026-09-08).
 */
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function StripeReturn() {
  const { userRole, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Redirect href={'/(auth)/welcome' as any} />;
  return <Redirect href={(userRole === 'client' ? '/(client-tabs)' : '/(tabs)') as any} />;
}
