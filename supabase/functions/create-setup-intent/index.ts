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
  // Handle CORS preflight
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
    // attach a card to a stranger's Stripe customer and, since the intent is
    // created with usage 'off_session', have it chargeable without them present.
    const caller = await requireCaller(req)
    await requireClientAccess(caller, clientId)

    // Create a Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch the client details
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

      // Save Stripe customer ID back to the client record
      await supabaseAdmin
        .from('clients')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', clientId)
    }

    // Create a SetupIntent to save a card without charging
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session',
      payment_method_types: ['card'],
      metadata: {
        fitlink_client_id: clientId,
      },
    })

    return new Response(
      JSON.stringify({
        clientSecret: setupIntent.client_secret,
        customerId: stripeCustomerId,
        setupIntentId: setupIntent.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders)
    console.error('Error creating setup intent:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
