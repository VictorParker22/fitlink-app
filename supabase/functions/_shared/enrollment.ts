// ============================================================
// enrollment — what a paid pass does to an athlete's account.
//
// ONE implementation, used by stripe-webhook (invoice.payment_succeeded /
// payment_intent.succeeded) and by confirm-subscription (the app asking
// right after the card was charged). Before 2026-09-08 these lived only in
// the webhook; when the webhook was rejecting every delivery, nothing else
// could enrol a paying athlete.
//
// - attachClientToPlan: status active, plan_id, trainer_id = the plan's
//   coach (the service role may write it; guard_entitlement_columns refuses
//   everyone else), coach notified when the athlete switched.
// - ensurePlanEnrollment: the season row (client_plan_enrollments) with the
//   track snapshot frozen from the plan; idempotent per athlete + plan.
// - activateStripeSubscription: read one client_subscriptions row's Stripe
//   subscription and, when it is active/trialing, write everything the paid
//   invoice implies: the row's status and period, the payment ledger,
//   the attach, the enrolment. Idempotent.
// ============================================================

import type Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'

// deno-lint-ignore no-explicit-any
type Admin = any

/**
 * A paid pass makes its owner the athlete's coach. clients.trainer_id is
 * guarded for ordinary roles; the service role this function runs as may
 * write it. Idempotent: an athlete already on that coach's roster only gets
 * the plan and status.
 */
export async function attachClientToPlan(admin: ReturnType<typeof createClient>, clientId: string, planId: string) {
  const { data: plan } = await admin.from('plans').select('trainer_id').eq('id', planId).maybeSingle()
  const { data: client } = await admin.from('clients').select('trainer_id, name').eq('id', clientId).maybeSingle()
  if (!plan?.trainer_id) return
  const switching = !!client && client.trainer_id !== plan.trainer_id
  const { error } = await admin.from('clients').update({
    status: 'active',
    plan_id: planId,
    trainer_id: plan.trainer_id,
    requested_trainer_id: null,
    coach_requested_at: null,
    coach_declined_at: null,
    coach_declined_by: null,
    ...(switching ? { coach_accepted_at: new Date().toISOString() } : {}),
  }).eq('id', clientId)
  if (error) console.error('[webhook] attachClientToPlan failed:', error.message)
  if (switching) {
    await admin.from('notifications').insert({
      trainer_id: plan.trainer_id,
      type: 'pass_purchased',
      title: `${client?.name ?? 'An athlete'} bought a pass`,
      description: `${client?.name ?? 'An athlete'} is on your roster now.`,
      metadata: { client_id: clientId, plan_id: planId },
    })
  }
}

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
export async function ensurePlanEnrollment(
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
          description: `${who?.name ?? 'An athlete'} paid for "${plan.name}" after it filled (${count + 1} of ${plan.capacity}). Add a seat or refund them.`,
          metadata: { plan_id: planId, client_id: clientId },
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
 * The season's first diet plan is put on the athlete's Food tab. A track's
 * diet nodes are never assigned row-by-row; without this the Food tab of a
 * paying athlete said "No meal plan yet" (2026-09-08). Idempotent: an
 * existing assignment of that plan is left alone.
 */
export async function ensureTrackDiet(admin: Admin, clientId: string, planId: string): Promise<void> {
  const { data: plan } = await admin.from('plans').select('track').eq('id', planId).maybeSingle()
  const track = Array.isArray(plan?.track) ? [...plan.track].sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0)) : []
  const dietNode = track.find((n: any) => n?.type === 'diet' && typeof n?.id === 'string')
  if (!dietNode) return
  const { data: existing } = await admin.from('client_diets').select('id').eq('client_id', clientId).eq('diet_plan_id', dietNode.id).maybeSingle()
  if (existing) return
  const { error } = await admin.from('client_diets').insert({ client_id: clientId, diet_plan_id: dietNode.id, assigned_date: new Date().toISOString().slice(0, 10), status: 'assigned' })
  if (error) console.error('[enrollment] track diet assignment failed', error.message)
}

export interface SubscriptionRowLike {
  client_id: string
  plan_id: string
  trainer_id?: string | null
  stripe_subscription_id: string
  status?: string | null
}

/**
 * Apply what Stripe says about one subscription. Returns the live status
 * and whether the athlete was (or already is) activated on the plan.
 */
export async function activateStripeSubscription(
  admin: Admin,
  stripe: Stripe,
  row: SubscriptionRowLike,
): Promise<{ status: string; activated: boolean }> {
  let live: Stripe.Subscription
  try {
    live = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ['latest_invoice.payment_intent'] })
  } catch (e) {
    console.error('[enrollment] subscription retrieve failed', row.stripe_subscription_id, (e as any)?.message)
    return { status: 'unknown', activated: false }
  }
  const paid = live.status === 'active' || live.status === 'trialing'
  const now = new Date().toISOString()
  await admin
    .from('client_subscriptions')
    .update({
      status: live.status,
      current_period_start: new Date(live.current_period_start * 1000).toISOString(),
      current_period_end: new Date(live.current_period_end * 1000).toISOString(),
      cancel_at_period_end: !!live.cancel_at_period_end,
      updated_at: now,
    })
    .eq('stripe_subscription_id', row.stripe_subscription_id)
  if (!paid) return { status: live.status, activated: false }

  // The first invoice's payment: the coach's revenue tile reads this ledger.
  const invoice = live.latest_invoice as Stripe.Invoice | null
  const pi = invoice?.payment_intent as Stripe.PaymentIntent | null
  if (pi?.id && invoice && (invoice.status === 'paid' || pi.status === 'succeeded')) {
    await admin.from('payments').upsert({
      stripe_payment_intent_id: pi.id,
      client_id: row.client_id,
      plan_id: row.plan_id,
      trainer_id: row.trainer_id ?? null,
      amount: invoice.amount_paid ?? pi.amount,
      currency: invoice.currency ?? pi.currency ?? 'usd',
      status: 'succeeded',
      updated_at: now,
    }, { onConflict: 'stripe_payment_intent_id' })
  }

  await attachClientToPlan(admin, row.client_id, row.plan_id)
  await ensurePlanEnrollment(admin, row.client_id, row.plan_id)
  await ensureTrackDiet(admin, row.client_id, row.plan_id)
  return { status: live.status, activated: true }
}
