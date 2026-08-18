// supabase/functions/create-org-subscription/index.ts
// Deploy with: supabase functions deploy create-org-subscription
// Requires secret: STRIPE_ORG_SEAT_PRICE (a recurring, per-unit Stripe price id)
//
// ── What this is ────────────────────────────────────────────────────
// A gym buys N seats. It returns a Stripe Checkout URL; NOTHING in our
// database changes here. `organizations.seat_limit` is written in exactly one
// place — apply_org_seats(), called by the webhook once Stripe confirms money
// moved. That separation is the point: this endpoint is reachable by any
// signed-in owner, so if it could set seats it would be a free-seat button.
//
// ── Why Checkout rather than a direct subscription ──────────────────
// The gym pays with a card we have never seen. Checkout collects it on
// Stripe's page, so no card details cross this function, this app, or this
// database — the same reason athlete billing is not built here either.
//
// ── Distinct from athlete subscriptions ─────────────────────────────
// This is FitLink billing the gym. It has no Connect account, no application
// fee and no coach split: the money is ours, not a coach's. It is marked
// `metadata.kind = 'org_seats'` so the webhook can tell it apart from the
// athlete subscriptions that share the same event types — without that marker,
// `customer.subscription.updated` for a gym would be looked up in
// client_subscriptions, match nothing, and silently do nothing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET')!, {
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orgId, seats, returnUrl } = await req.json()

    if (!orgId) return json({ error: 'orgId required' }, 400)

    // Seats must be a whole number in a sane range. Stripe would happily
    // accept 100000 and bill it.
    const n = Number(seats)
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      return json({ error: 'seats must be a whole number between 1 and 500' }, 400)
    }

    const priceId = Deno.env.get('STRIPE_ORG_SEAT_PRICE')
    if (!priceId) {
      // An honest 503 rather than a broken checkout page. Seat billing is not
      // configured until this secret is set.
      console.error('STRIPE_ORG_SEAT_PRICE is not set')
      return json({ error: 'Seat billing is not configured yet' }, 503)
    }

    const caller = await requireCaller(req)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // OWNER ONLY, checked server-side. is_org_member() runs as the caller
    // would see it, but this is the service role, so the membership is read
    // directly and the role is asserted here.
    const { data: membership } = await supabaseAdmin
      .from('organization_members')
      .select('role, status')
      .eq('org_id', orgId)
      .eq('user_id', caller.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!membership || membership.role !== 'owner') {
      return json({ error: 'Only the organization owner can manage billing' }, 403)
    }

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, name, billing_email, stripe_customer_id, stripe_subscription_id, seat_limit')
      .eq('id', orgId)
      .maybeSingle()

    if (!org) return json({ error: 'Organization not found' }, 404)

    // A gym cannot buy fewer seats than it is already using — the coaches in
    // those seats are working right now, and we do not evict them (see
    // enterprise_05). Refusing here is clearer than accepting the payment and
    // then quietly not honouring it.
    const { count: activeCount } = await supabaseAdmin
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active')

    if (typeof activeCount === 'number' && n < activeCount) {
      return json({
        error: `You have ${activeCount} coaches working. Remove a coach before reducing to ${n} seats.`,
      }, 409)
    }

    // ── Already subscribed: change the quantity, no checkout ────────
    // Stripe prorates the difference against the card already on file.
    if (org.stripe_subscription_id) {
      const existing = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
      const item = existing.items.data[0]
      if (!item) return json({ error: 'Subscription has no billable item' }, 500)

      await stripe.subscriptions.update(org.stripe_subscription_id, {
        items: [{ id: item.id, quantity: n }],
        proration_behavior: 'always_invoice',
        metadata: { kind: 'org_seats', org_id: orgId },
      })

      // Deliberately NOT writing seat_limit here. The webhook does it when
      // Stripe confirms — so a failed proration payment cannot leave the gym
      // holding seats it did not pay for.
      return json({ updated: true, seats: n })
    }

    // ── First purchase: Checkout ────────────────────────────────────
    let customerId = org.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        email: org.billing_email || caller.email || undefined,
        metadata: { org_id: orgId },
      })
      customerId = customer.id
    }

    const base = (typeof returnUrl === 'string' && returnUrl.startsWith('https://'))
      ? returnUrl
      : 'https://app.fitlink.coach/org/billing'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: n }],
      // Metadata on BOTH the session and the subscription: the session carries
      // it through checkout.session.completed, the subscription_data copy is
      // what every later customer.subscription.* event will actually carry.
      metadata: { kind: 'org_seats', org_id: orgId, seats: String(n) },
      subscription_data: {
        metadata: { kind: 'org_seats', org_id: orgId },
      },
      success_url: `${base}?status=success`,
      cancel_url: `${base}?status=cancelled`,
    })

    return json({ url: session.url, seats: n })
  } catch (err: any) {
    if (err instanceof AuthError) {
      return authErrorResponse(err, corsHeaders, { req, endpoint: 'create-org-subscription' })
    }
    console.error('create-org-subscription failed:', err?.message)
    return json({ error: 'Could not start seat checkout' }, 500)
  }
})
