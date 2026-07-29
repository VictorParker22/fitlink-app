import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { trainerId, returnUrl, refreshUrl } = await req.json()

    if (!trainerId) {
      return new Response(
        JSON.stringify({ error: 'Missing trainerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
      return new Response(
        JSON.stringify({ error: 'No Stripe account found. Please set up payments first.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check current account status
    const account = await stripe.accounts.retrieve(trainer.stripe_account_id)

    // Update local status
    await supabaseAdmin
      .from('trainers')
      .update({
        stripe_onboarding_complete: account.details_submitted,
        stripe_charges_enabled: account.charges_enabled,
      })
      .eq('id', trainerId)

    // If already fully set up, return the Express Dashboard login link instead
    if (account.details_submitted && account.charges_enabled) {
      const loginLink = await stripe.accounts.createLoginLink(trainer.stripe_account_id)
      return new Response(
        JSON.stringify({
          url: loginLink.url,
          type: 'dashboard',
          onboardingComplete: true,
          chargesEnabled: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Otherwise generate a new onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: trainer.stripe_account_id,
      refresh_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-redirect?url=${encodeURIComponent(refreshUrl || 'fitlink://stripe-refresh')}`,
      return_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-redirect?url=${encodeURIComponent(returnUrl || 'fitlink://stripe-return')}`,
      type: 'account_onboarding',
    })

    return new Response(
      JSON.stringify({
        url: accountLink.url,
        type: 'onboarding',
        onboardingComplete: account.details_submitted,
        chargesEnabled: account.charges_enabled,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('Error creating account link:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
