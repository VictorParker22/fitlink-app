import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireCaller, requireTrainerSelf, AuthError, authErrorResponse } from '../_shared/auth.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET')!, {
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { trainerId, email, name, returnUrl, refreshUrl } = await req.json()

    if (!trainerId) {
      return new Response(
        JSON.stringify({ error: 'Missing trainerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // The caller must BE this coach. Without this, any holder of the anon
    // key — which ships in the app binary — could create a Connect account
    // they control against a coach who has none yet, and every future payout
    // for that coach's athletes would land in the attacker's bank account.
    const caller = await requireCaller(req)
    requireTrainerSelf(caller, trainerId)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check if trainer already has a Stripe account
    const { data: trainer } = await supabaseAdmin
      .from('trainers')
      .select('stripe_account_id')
      .eq('id', trainerId)
      .single()

    let accountId = trainer?.stripe_account_id

    if (!accountId) {
      // Create a new Stripe Connect Express account
      const account = await stripe.accounts.create({
        type: 'express',
        email: email || undefined,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          fitlink_trainer_id: trainerId,
        },
        business_profile: {
          name: name || 'FitLink Coach',
          product_description: 'Fitness coaching services',
          mcc: '7941', // Sports Clubs/Fields
        },
      })

      accountId = account.id

      // Save the account ID to the trainer record
      await supabaseAdmin
        .from('trainers')
        .update({
          stripe_account_id: accountId,
          stripe_onboarding_complete: false,
          stripe_charges_enabled: false,
        })
        .eq('id', trainerId)
    }

    // Create an account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-redirect?url=${encodeURIComponent(refreshUrl || 'fitlink://stripe-refresh')}`,
      return_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-redirect?url=${encodeURIComponent(returnUrl || 'fitlink://stripe-return')}`,
      type: 'account_onboarding',
    })

    return new Response(
      JSON.stringify({
        url: accountLink.url,
        accountId: accountId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders)
    console.error('Error creating connect account:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
