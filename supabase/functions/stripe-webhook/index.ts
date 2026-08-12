// supabase/functions/stripe-webhook/index.ts
// Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
// Set secrets: supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET')!, {
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')!
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  // Create a Supabase admin client
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    switch (event.type) {
      // ---- Payment Intent Events ----
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        console.log(`PaymentIntent succeeded: ${pi.id}`)

        // Update payment record
        await supabaseAdmin
          .from('payments')
          .update({ status: 'succeeded', updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', pi.id)

        // Upgrade client status from trial to active
        const clientId = pi.metadata?.fitlink_client_id
        const planId = pi.metadata?.fitlink_plan_id
        const trainerId = pi.metadata?.fitlink_trainer_id

        if (clientId && planId && trainerId) {

          await supabaseAdmin
            .from('clients')
            .update({
              status: 'active',
              plan_id: planId,
            })
            .eq('id', clientId)

          // Create or update subscription record
          await supabaseAdmin
            .from('client_subscriptions')
            .upsert({
              client_id: clientId,
              plan_id: planId,
              trainer_id: trainerId,
              stripe_customer_id: pi.customer as string,
              status: 'active',
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'client_id,plan_id' })

          // ── AUTOFLOW: background task — assign workout + welcome msg + notify coach ──
          // EdgeRuntime.waitUntil() keeps the worker alive after the Response returns.
          // Plain fetch().catch() would be silently killed by the Deno runtime.
          const autoflowTask = async () => {
            try {
              const autoflowUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/client-autoflow`
              const res = await fetch(autoflowUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({ clientId, trainerId, planId }),
              })
              console.log('[webhook] autoflow response:', res.status)
            } catch (err) {
              // Must catch inside waitUntil — errors are silent to the webhook caller
              console.error('[webhook] autoflow invoke failed:', err)
            }
          }
          EdgeRuntime.waitUntil(autoflowTask())
        }
        break


      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        console.log(`PaymentIntent failed: ${pi.id}`)

        await supabaseAdmin
          .from('payments')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', pi.id)
        break
      }

      // ---- Invoice Events (recurring subscription payments) ----
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = invoice.subscription as string
        console.log(`Invoice paid for subscription: ${subId}`)

        if (subId) {
          // Update subscription period from the invoice's subscription data
          const sub = await stripe.subscriptions.retrieve(subId)
          await supabaseAdmin
            .from('client_subscriptions')
            .update({
              status: 'active',
              current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subId)

          // Ensure client stays active
          const { data: subRecord } = await supabaseAdmin
            .from('client_subscriptions')
            .select('client_id')
            .eq('stripe_subscription_id', subId)
            .single()

          if (subRecord?.client_id) {
            await supabaseAdmin
              .from('clients')
              .update({ status: 'active' })
              .eq('id', subRecord.client_id)
          }

          // Also check if this is an On-Demand Pass subscription
          const { data: classSubRecord } = await supabaseAdmin
            .from('class_subscriptions')
            .select('client_id')
            .eq('stripe_subscription_id', subId)
            .single()

          if (classSubRecord?.client_id) {
            await supabaseAdmin
              .from('class_subscriptions')
              .update({
                status: 'active',
                current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
                current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('stripe_subscription_id', subId)
          }

          // Record the recurring payment
          if (invoice.payment_intent) {
            await supabaseAdmin.from('payments').upsert({
              stripe_payment_intent_id: invoice.payment_intent as string,
              client_id: subRecord?.client_id,
              amount: invoice.amount_paid,
              currency: invoice.currency,
              status: 'succeeded',
            }, { onConflict: 'stripe_payment_intent_id' })
          }
        }
        break
      }

      // ---- Subscription Lifecycle Events ----
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        console.log(`Subscription updated: ${sub.id}`)

        await supabaseAdmin
          .from('client_subscriptions')
          .update({
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        console.log(`Subscription canceled: ${sub.id}`)

        await supabaseAdmin
          .from('client_subscriptions')
          .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        // Also check if this was an On-Demand Pass
        await supabaseAdmin
          .from('class_subscriptions')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        // Optionally mark client as inactive
        const { data: subRecord } = await supabaseAdmin
          .from('client_subscriptions')
          .select('client_id')
          .eq('stripe_subscription_id', sub.id)
          .single()

        if (subRecord?.client_id) {
          await supabaseAdmin
            .from('clients')
            .update({ status: 'inactive' })
            .eq('id', subRecord.client_id)
        }
        break
      }

      // ---- Connect Account Events ----
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        console.log(`Account updated: ${account.id}`)

        // Update trainer's Stripe status
        await supabaseAdmin
          .from('trainers')
          .update({
            stripe_onboarding_complete: account.details_submitted ?? false,
            stripe_charges_enabled: account.charges_enabled ?? false,
          })
          .eq('stripe_account_id', account.id)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`)
    return new Response(
      JSON.stringify({ error: 'Webhook handler failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
