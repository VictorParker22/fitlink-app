// supabase/functions/stripe-webhook/index.ts
// Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
// Set secrets: supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET')!, {
  httpClient: Stripe.createFetchHttpClient(),
})

/**
 * Create the athlete's season enrollment for a paid plan.
 *
 * Without this, a paying athlete gets clients.plan_id + a subscription row but
 * NO row in client_plan_enrollments — so track_snapshot never exists and the
 * entire season experience (SeasonHero, SeasonTrack, TrackStrip,
 * SeasonPulseCard, cohort WaitingRoom, DayOneOverlay) stays dark until a coach
 * manually enrolls them from the coach screen. This mirrors exactly what
 * `enrollClientInPlan` in context/AppContext.tsx produces.
 *
 * IDEMPOTENCY: Stripe retries webhooks, and checkout.tsx may also reach here
 * indirectly. A second run must never reset an athlete's progress, so we
 * (a) bail out when a row already exists and (b) insert with
 * `ignoreDuplicates` (ON CONFLICT DO NOTHING) to close the race between two
 * concurrent deliveries. track_position and track_snapshot of an existing row
 * are never touched.
 */
async function ensurePlanEnrollment(
  supabaseAdmin: any,
  clientId: string,
  planId: string,
): Promise<void> {
  // The snapshot must be frozen from the source of truth. Never trust
  // client-supplied or Stripe-metadata-supplied track data.
  const { data: plan, error: planErr } = await supabaseAdmin
    .from('plans')
    .select('id, name, track, starts_on, capacity')
    .eq('id', planId)
    .maybeSingle()

  if (planErr || !plan) {
    console.error(`[webhook][enroll] plan ${planId} not found; enrollment skipped`, planErr?.message)
    return
  }

  const track = Array.isArray(plan.track) ? plan.track : []
  if (track.length === 0) {
    // An empty snapshot renders an empty season — worse than no enrollment,
    // because it looks broken instead of pending. clients.plan_id stays set so
    // the athlete still reads as subscribed and the coach can fix the track.
    console.warn(
      `[webhook][enroll] plan ${planId} ("${plan.name}") has an EMPTY track — ` +
      `no enrollment written for client ${clientId}. The athlete is subscribed ` +
      `but has no season until the coach adds track nodes and enrolls them.`
    )
    return
  }

  // Already enrolled? Leave the row completely alone — a Stripe retry must not
  // rewind track_position or re-freeze the snapshot.
  const { data: existing } = await supabaseAdmin
    .from('client_plan_enrollments')
    .select('id, track_position')
    .eq('client_id', clientId)
    .eq('plan_id', planId)
    .maybeSingle()

  if (existing) {
    console.log(
      `[webhook][enroll] client ${clientId} already enrolled in plan ${planId} ` +
      `(enrollment ${existing.id}, position ${existing.track_position}) — left untouched`
    )
    return
  }

  // COHORTS: the enrollment is still created at purchase time. The waiting room
  // and every pre-start surface depend on the row existing BEFORE starts_on, so
  // we never gate on the start date. We do re-check capacity server-side,
  // because the client-side gate in app/checkout.tsx can be raced or bypassed.
  if (plan.starts_on && plan.capacity && plan.capacity > 0) {
    const { count, error: countErr } = await supabaseAdmin
      .from('client_plan_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', planId)
      .in('status', ['active', 'completed'])

    if (countErr) {
      console.warn(`[webhook][enroll] cohort capacity check failed for plan ${planId}:`, countErr.message)
    } else if (typeof count === 'number' && count >= plan.capacity) {
      // The money was already taken — refusing the seat now would leave a paid
      // athlete with nothing. Enroll them and TELL THE COACH: a log line is
      // not a control. The notification lands in their inbox so they can
      // decide on a refund or an extra seat.
      console.warn(
        `[webhook][enroll] COHORT OVER CAPACITY: plan ${planId} ("${plan.name}") ` +
        `capacity ${plan.capacity}, already ${count} enrolled. Client ${clientId} enrolled anyway.`
      )
      const { data: planOwner } = await supabaseAdmin
        .from('plans').select('trainer_id').eq('id', planId).maybeSingle()
      const { data: who } = await supabaseAdmin
        .from('clients').select('name').eq('id', clientId).maybeSingle()
      if (planOwner?.trainer_id) {
        await supabaseAdmin.from('notifications').insert({
          trainer_id: planOwner.trainer_id,
          type: 'cohort_over_capacity',
          title: 'Cohort is over capacity',
          body: `${who?.name ?? 'An athlete'} paid for "${plan.name}" after it filled (${count + 1} of ${plan.capacity}). Add a seat or refund them.`,
          data: { plan_id: planId, client_id: clientId },
        })
      }
    }
  }

  const { error: insertErr } = await supabaseAdmin
    .from('client_plan_enrollments')
    .upsert({
      client_id: clientId,
      plan_id: planId,
      track_snapshot: track,
      track_position: 0,
      status: 'active',
      started_at: new Date().toISOString(),
      completed_at: null,
      paused_at: null,
      sync_with_plan: false,
    }, { onConflict: 'client_id,plan_id', ignoreDuplicates: true })

  if (insertErr) {
    console.error(`[webhook][enroll] failed to enroll client ${clientId} in plan ${planId}:`, insertErr.message)
    return
  }

  console.log(
    `[webhook][enroll] enrolled client ${clientId} in plan ${planId} ` +
    `("${plan.name}", ${track.length} track nodes${plan.starts_on ? `, cohort starting ${plan.starts_on}` : ''})`
  )
}

/**
 * Seat billing for gyms — the org half of the subscription events.
 *
 * Gyms and athletes generate the SAME Stripe event types. Without a
 * discriminator, `customer.subscription.updated` for a gym would be looked up
 * in `client_subscriptions`, match nothing, and silently succeed — the gym's
 * seats would never change and no error would ever be raised. So every org
 * subscription is stamped `metadata.kind = 'org_seats'` at creation
 * (create-org-subscription), and this runs first when it sees that stamp.
 *
 * SEATS ARE WRITTEN IN ONE PLACE ONLY: apply_org_seats(), here, after Stripe
 * says money moved. Never in the app, never in the checkout endpoint.
 *
 * CANCELLATION DOES NOT EVICT. When a subscription ends we freeze the limit at
 * the gym's CURRENT active headcount rather than dropping it to nothing. Every
 * coach already working keeps working and keeps their athletes; the gym simply
 * cannot activate anyone new. Cutting off a working coach mid-month because a
 * card expired would take the gym's billing problem and hand it to the
 * athletes who showed up for a session that day.
 *
 * Returns true if the event was an org event and has been fully handled.
 */
async function handleOrgSeatEvent(
  supabaseAdmin: any,
  event: Stripe.Event,
): Promise<boolean> {
  const obj = event.data.object as any
  const meta = obj?.metadata ?? {}
  if (meta.kind !== 'org_seats') return false

  const orgId = meta.org_id
  if (!orgId) {
    // Stamped as ours but unusable. Loud, because it means a seat purchase is
    // sitting in Stripe that will never be honoured in the product.
    console.error(`[webhook][org] ${event.type} has kind=org_seats but no org_id`)
    return true
  }

  // How many coaches are actually working right now. Needed for the freeze,
  // and read fresh rather than trusted from metadata.
  const activeCount = async (): Promise<number> => {
    const { count } = await supabaseAdmin
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active')
    return typeof count === 'number' ? count : 0
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      // The subscription itself arrives as its own event carrying the same
      // metadata, and that one has the quantity and period on it. Recording
      // seats from the session too would mean two writers for one fact.
      console.log(`[webhook][org] checkout completed for org ${orgId}`)
      return true
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = obj as Stripe.Subscription
      const item = sub.items?.data?.[0]
      const qty = item?.quantity

      if (typeof qty !== 'number') {
        console.error(`[webhook][org] subscription ${sub.id} has no quantity; seats unchanged`)
        return true
      }

      // past_due / unpaid / incomplete are NOT paid states. Freeze rather than
      // grant: the gym keeps the coaches it has and cannot add more until the
      // card is fixed.
      const paid = sub.status === 'active' || sub.status === 'trialing'
      const seats = paid ? qty : await activeCount()

      const { error } = await supabaseAdmin.rpc('apply_org_seats', {
        p_org_id: orgId,
        p_seats: seats,
        p_status: sub.status,
        p_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
        p_sub_id: sub.id,
        p_price_cents: item?.price?.unit_amount ?? null,
        p_renew_at: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
      })
      if (error) console.error(`[webhook][org] apply_org_seats failed: ${error.message}`)
      else console.log(`[webhook][org] org ${orgId} -> ${seats} seats (${sub.status})`)
      return true
    }

    case 'customer.subscription.deleted': {
      const sub = obj as Stripe.Subscription
      const frozen = await activeCount()
      const { error } = await supabaseAdmin.rpc('apply_org_seats', {
        p_org_id: orgId,
        p_seats: frozen,
        p_status: 'canceled',
        p_customer_id: null,
        p_sub_id: null,
        p_price_cents: null,
        p_renew_at: null,
      })
      if (error) console.error(`[webhook][org] cancel apply_org_seats failed: ${error.message}`)
      else console.log(`[webhook][org] org ${orgId} cancelled, frozen at ${frozen} seats`)
      return true
    }

    default:
      // Invoices and other org-stamped events need no seat change.
      return true
  }
}

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

  // Event-id dedupe. Stripe redelivers; without this a late redelivery of
  // an older customer.subscription.updated overwrote newer state, and the
  // org-seat handler re-applied seats on every retry.
  {
    const { error: dedupeErr } = await supabaseAdmin
      .from('stripe_events')
      .insert({ id: event.id, type: event.type, created: new Date(event.created * 1000).toISOString() })
    if (dedupeErr) {
      if (dedupeErr.code === '23505') {
        console.log(`Duplicate delivery ignored: ${event.id}`)
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Ledger unavailable: process anyway (better a rare double than a
      // dropped payment), but say so in the logs.
      console.warn('stripe_events insert failed:', dedupeErr.message)
    }
  }

  try {
    // Gym seat billing shares Stripe's subscription event types with athlete
    // billing, so it is dispatched FIRST on its metadata stamp. If this were
    // below, an org subscription would fall into the client_subscriptions
    // handlers, match no row, and quietly do nothing.
    if (await handleOrgSeatEvent(supabaseAdmin, event)) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

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

          // One-off PaymentIntents (create-payment-intent) have no Stripe
          // subscription, so there is no real period to record. Never
          // fabricate one: write the row only if none exists, with null
          // period bounds, and never overwrite a row that a real
          // subscription owns.
          const { data: existingRow } = await supabaseAdmin
            .from('client_subscriptions')
            .select('id, stripe_subscription_id')
            .eq('client_id', clientId)
            .eq('plan_id', planId)
            .maybeSingle()

          if (!existingRow) {
            const { error: insErr } = await supabaseAdmin
              .from('client_subscriptions')
              .insert({
                client_id: clientId,
                plan_id: planId,
                trainer_id: trainerId,
                stripe_customer_id: pi.customer as string,
                status: 'active',
                updated_at: new Date().toISOString(),
              })
            if (insErr) console.error('[webhook] client_subscriptions insert failed:', insErr.message)
          } else if (!existingRow.stripe_subscription_id) {
            await supabaseAdmin
              .from('client_subscriptions')
              .update({ status: 'active', stripe_customer_id: pi.customer as string, updated_at: new Date().toISOString() })
              .eq('id', existingRow.id)
          }

          // Create the season enrollment. Awaited (not backgrounded) so a
          // failure surfaces in this delivery's logs and Stripe's retry can
          // repair it — the retry is safe, see ensurePlanEnrollment.
          await ensurePlanEnrollment(supabaseAdmin, clientId, planId)

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
            .select('client_id, plan_id, trainer_id')
            .eq('stripe_subscription_id', subId)
            .single()

          if (subRecord?.client_id) {
            await supabaseAdmin
              .from('clients')
              .update({ status: 'active' })
              .eq('id', subRecord.client_id)
          }

          // Recurring-subscription purchases (app/checkout.tsx → create-subscription)
          // never pass through the payment_intent.succeeded branch above: the
          // PaymentIntent Stripe creates for an invoice does NOT inherit the
          // subscription's metadata, so fitlink_client_id is absent there. This
          // is the ONLY place a subscribing athlete's enrollment can be created.
          // Idempotent per ensurePlanEnrollment, so renewal invoices are no-ops.
          if (subRecord?.client_id && subRecord?.plan_id) {
            await supabaseAdmin
              .from('clients')
              .update({ plan_id: subRecord.plan_id })
              .eq('id', subRecord.client_id)

            await ensurePlanEnrollment(supabaseAdmin, subRecord.client_id, subRecord.plan_id)
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

          // Record the recurring payment. plan_id and trainer_id ride along
          // from client_subscriptions — without them, renewal revenue was
          // invisible to per-pass attribution (Pass performance undercounted
          // every subscription renewal) and to the trainer's own payment RLS.
          if (invoice.payment_intent) {
            await supabaseAdmin.from('payments').upsert({
              stripe_payment_intent_id: invoice.payment_intent as string,
              client_id: subRecord?.client_id,
              plan_id: subRecord?.plan_id ?? null,
              trainer_id: subRecord?.trainer_id ?? null,
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

        // Last-writer-wins protection: skip if our row was updated by a
        // newer Stripe event than this one.
        const { data: cur } = await supabaseAdmin
          .from('client_subscriptions')
          .select('updated_at')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle()
        if (cur?.updated_at && new Date(cur.updated_at).getTime() > event.created * 1000 + 5_000) {
          console.log(`Stale subscription.updated for ${sub.id} ignored`)
          break
        }

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
