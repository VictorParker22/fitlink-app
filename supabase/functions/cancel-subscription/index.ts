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
    // cancel every paying athlete's subscription in a loop.
    const caller = await requireCaller(req)
    await requireClientAccess(caller, clientId)

    // Create a Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify the client exists
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

    // Find active subscription in our DB
    const { data: subscription } = await supabaseAdmin
      .from('client_subscriptions')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .single()

    // Cancel in Stripe if we have a real subscription ID
    if (subscription?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        })
        console.log(`Stripe subscription ${subscription.stripe_subscription_id} set to cancel at period end`)
      } catch (stripeErr: any) {
        console.error('Stripe cancellation error:', stripeErr.message)
        // Continue with local cancellation even if Stripe fails
      }
    }

    // Update subscription record in our DB
    if (subscription) {
      await supabaseAdmin
        .from('client_subscriptions')
        .update({
          cancel_at_period_end: true,
          status: subscription.stripe_subscription_id ? 'active' : 'canceled', // Keep active if Stripe will handle the actual cancel at period end
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id)
    }

    // Update the client status
    await supabaseAdmin
      .from('clients')
      .update({
        status: subscription?.stripe_subscription_id ? 'canceling' : 'canceled',
      })
      .eq('id', clientId)

    return new Response(
      JSON.stringify({
        success: true,
        cancelAtPeriodEnd: !!subscription?.stripe_subscription_id,
        periodEnd: subscription?.current_period_end || null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    // Auth failures are a 401/403 answer, not a server fault.
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'cancel-subscription' })
    console.error('Error canceling subscription:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
