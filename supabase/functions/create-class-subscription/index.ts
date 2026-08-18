// supabase/functions/create-class-subscription/index.ts
// Deploy with: supabase functions deploy create-class-subscription
// Set secrets: supabase secrets set STRIPE_SECRET=sk_test_...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireCaller, requireClientAccess, AuthError, authErrorResponse } from '../_shared/auth.ts'

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
    const { clientId } = await req.json()

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: clientId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // The caller must BE this athlete, or be their coach. Without this,
    // any holder of the anon key — which ships in the app binary — could
    // sign a stranger up for the $19.99/mo On-Demand Pass on their saved card.
    const caller = await requireCaller(req)
    await requireClientAccess(caller, clientId)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Validate clientId and fetch email from auth.users (if needed, or clients table)
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, email, name, stripe_customer_id')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if client already has an active class_subscriptions record
    const { data: existingSub } = await supabaseAdmin
      .from('class_subscriptions')
      .select('status')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle()

    if (existingSub) {
      return new Response(
        JSON.stringify({ error: 'Already subscribed to On-Demand Pass' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create or retrieve Stripe Customer
    let stripeCustomerId = client.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: client.email || undefined,
        name: client.name || undefined,
        metadata: {
          fitlink_client_id: clientId,
        },
      })
      stripeCustomerId = customer.id

      await supabaseAdmin
        .from('clients')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', clientId)
    }

    // Find or create Stripe Product & Price for On-Demand Pass
    // First check if we have it by searching products
    const products = await stripe.products.search({
      query: `metadata['fitlink_type']:'on_demand_pass'`,
      limit: 1,
    })

    let stripeProductId = products.data[0]?.id
    let stripePriceId: string | undefined

    if (!stripeProductId) {
      const product = await stripe.products.create({
        name: 'FitLink On-Demand Pass',
        description: 'Unlimited access to all on-demand fitness classes',
        metadata: {
          fitlink_type: 'on_demand_pass',
        },
      })
      stripeProductId = product.id

      const price = await stripe.prices.create({
        product: stripeProductId,
        unit_amount: 1999, // $19.99
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: {
          fitlink_type: 'on_demand_pass',
        },
      })
      stripePriceId = price.id
    } else {
      // Find the price for the existing product
      const prices = await stripe.prices.list({
        product: stripeProductId,
        active: true,
        limit: 1,
      })
      if (prices.data.length > 0) {
        stripePriceId = prices.data[0].id
      } else {
        const price = await stripe.prices.create({
          product: stripeProductId,
          unit_amount: 1999, // $19.99
          currency: 'usd',
          recurring: { interval: 'month' },
          metadata: {
            fitlink_type: 'on_demand_pass',
          },
        })
        stripePriceId = price.id
      }
    }

    // Create a Stripe Subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        fitlink_type: 'on_demand_pass',
        fitlink_client_id: clientId,
      },
    })

    const invoice = subscription.latest_invoice as Stripe.Invoice
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent

    // Insert/upsert into class_subscriptions table
    await supabaseAdmin
      .from('class_subscriptions')
      .upsert({
        client_id: clientId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscription.id,
        status: subscription.status, // 'incomplete'
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'client_id' })

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        customerId: stripeCustomerId,
        subscriptionId: subscription.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders)
    console.error('Error creating class subscription:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
