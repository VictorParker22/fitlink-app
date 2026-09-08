/**
 * fitlink://stripe-return — where Stripe sends a coach back after Connect
 * onboarding (supabase/functions/stripe-redirect). The in-app auth session
 * normally swallows this URL before the router sees it; this route exists so
 * that when it does reach the router (external Safari, Android, a cold start)
 * a coach lands on the payouts screen — which re-reads Stripe on focus —
 * instead of an unmatched route (2026-09-08).
 */
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { landingAfterStripe } from '../lib/payoutsState';

export default function StripeReturn() {
  const { userRole, isAuthenticated } = useAuth();
  return <Redirect href={landingAfterStripe(userRole, isAuthenticated) as any} />;
}
