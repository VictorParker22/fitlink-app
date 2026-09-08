/**
 * fitlink://stripe-refresh — Stripe's "link expired, start again" return.
 * Same landing as stripe-return: the payouts screen mints a fresh link.
 */
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { landingAfterStripe } from '../lib/payoutsState';

export default function StripeRefresh() {
  const { userRole, isAuthenticated } = useAuth();
  return <Redirect href={landingAfterStripe(userRole, isAuthenticated) as any} />;
}
