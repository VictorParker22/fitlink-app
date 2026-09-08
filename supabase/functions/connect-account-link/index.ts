import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.3'
import { requireCaller, requireTrainerSelf, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { internalError } from '../_shared/http.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET')!, {
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Stripe's requirement keys, folded into the three lines the payouts screen
// shows ("Your details", "Bank account for payouts", "Identity check").
// Mirrored in lib/payouts.ts (dueFromRequirements) for the client-side test;
// keep the two in step.
function dueFromRequirements(keys: string[]): { details: boolean; bank: boolean; identity: boolean } {
  const due = { details: false, bank: false, identity: false }
  for (const k of keys) {
    if (k === 'external_account') due.bank = true
    else if (/verification|id_number|ssn_last_4/.test(k)) due.identity = true
    else due.details = true
  }
  return due
}

// The one place Stripe's account status is read and written back. Three
// modes, all bound to the signed-in coach:
//   mode 'status'  — refresh the flags, say what Stripe still needs. Never
//                    mints a link, so it is safe to call on every screen focus.
//   (default)      — refresh the flags and return the next link: the Express
//                    dashboard when fully set up, else a fresh onboarding link.
// A coach with no Connect account yet gets a plain not-connected status in
// status mode (it used to be a 404, which the app had to special-case).
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { trainerId, returnUrl, refreshUrl, mode } = await req.json()

    if (!trainerId) return json({ error: 'Missing trainerId' }, 400)

    // The caller must BE this coach. Without this, any holder of the anon
    // key — which ships in the app binary — could mint an Express Dashboard
    // login link for any coach's Stripe account: full access to their
    // earnings and the power to repoint their payout bank account.
    const caller = await requireCaller(req)
    requireTrainerSelf(caller, trainerId)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: trainer } = await supabaseAdmin
      .from('trainers')
      .select('stripe_account_id')
      .eq('id', trainerId)
      .single()

    if (!trainer?.stripe_account_id) {
      if (mode === 'status') {
        return json({
          type: 'status',
          hasAccount: false,
          onboardingComplete: false,
          chargesEnabled: false,
          pendingVerification: false,
          due: { details: true, bank: true, identity: true },
        })
      }
      return json({ error: 'No Stripe account found. Please set up payments first.' }, 404)
    }

    // Check current account status
    const account = await stripe.accounts.retrieve(trainer.stripe_account_id)
    const onboardingComplete = !!account.details_submitted
    const chargesEnabled = !!account.charges_enabled
    const reqs = account.requirements
    const dueKeys = [...(reqs?.currently_due ?? []), ...(reqs?.past_due ?? [])]
    const pendingVerification = !chargesEnabled && dueKeys.length === 0 && (reqs?.pending_verification?.length ?? 0) > 0
    const due = chargesEnabled
      ? { details: false, bank: false, identity: false }
      : dueKeys.length > 0
        ? dueFromRequirements(dueKeys)
        : onboardingComplete
          ? { details: false, bank: false, identity: pendingVerification }
          : { details: true, bank: true, identity: true }

    // Update local status
    await supabaseAdmin
      .from('trainers')
      .update({
        stripe_onboarding_complete: onboardingComplete,
        stripe_charges_enabled: chargesEnabled,
      })
      .eq('id', trainerId)

    const status = { hasAccount: true, onboardingComplete, chargesEnabled, pendingVerification, due }

    if (mode === 'status') return json({ type: 'status', ...status })

    // If already fully set up, return the Express Dashboard login link instead
    if (onboardingComplete && chargesEnabled) {
      const loginLink = await stripe.accounts.createLoginLink(trainer.stripe_account_id)
      return json({ url: loginLink.url, type: 'dashboard', ...status })
    }

    // Otherwise generate a new onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: trainer.stripe_account_id,
      refresh_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-redirect?url=${encodeURIComponent(refreshUrl || 'fitlink://stripe-refresh')}`,
      return_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-redirect?url=${encodeURIComponent(returnUrl || 'fitlink://stripe-return')}`,
      type: 'account_onboarding',
    })

    return json({ url: accountLink.url, type: 'onboarding', ...status })
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'connect-account-link' })
    console.error('Error creating account link:', err)
    return internalError('connect-account-link', err, corsHeaders)
  }
})
