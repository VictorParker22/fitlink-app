// remove-client — a coach takes an athlete off their roster (threat model A13).
//
// Removing used to be a row DELETE the coach could issue straight from the
// phone, taking the athlete's workouts, logs, check-ins, health snapshots,
// photos and chat down with it — and leaving any Stripe subscription
// billing. Now: cancel the athlete's live subscription to this coach at
// Stripe FIRST (no further charges), then detach_client() in the database,
// which keeps a real athlete's history and deletes only coach-typed
// placeholders that never had an account.
//
// POST { clientId } → { outcome: 'detached' | 'deleted', cancelled: n }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.3'
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { internalError } from '../_shared/http.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET')!, { httpClient: Stripe.createFetchHttpClient() })

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const caller = await requireCaller(req)
    const body = await req.json().catch(() => ({}))
    const clientId = typeof body?.clientId === 'string' ? body.clientId : ''
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) return json({ error: 'clientId required' }, 400)

    const admin = caller.admin
    const { data: client } = await admin.from('clients').select('id, trainer_id').eq('id', clientId).maybeSingle()
    if (!client || client.trainer_id !== caller.id) return json({ error: 'not_your_client' }, 403)

    // Money first. If Stripe cannot be reached the roster is left as it is:
    // a detached athlete who keeps being billed is the worse outcome.
    const { data: subs } = await admin
      .from('client_subscriptions')
      .select('id, stripe_subscription_id, status')
      .eq('client_id', clientId)
      .eq('trainer_id', caller.id)
      .in('status', ['active', 'trialing', 'past_due', 'incomplete'])
    let cancelled = 0
    for (const s of subs ?? []) {
      if (!s.stripe_subscription_id) continue
      try {
        await stripe.subscriptions.cancel(s.stripe_subscription_id)
        cancelled++
      } catch (e: any) {
        if (e?.code === 'resource_missing' || /No such subscription|already been canceled/i.test(e?.message ?? '')) {
          cancelled++
        } else {
          console.error('[remove-client] cancel failed', s.stripe_subscription_id, e?.message)
          return json({ error: 'We could not cancel this athlete\'s subscription with our payment processor. Nothing was changed. Try again in a moment.' }, 502)
        }
      }
      await admin.from('client_subscriptions').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', s.id)
    }

    // The detach runs as the caller (their JWT), so detach_client's own
    // ownership check applies a second time.
    const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: result, error } = await asCaller.rpc('detach_client', { p_client_id: clientId })
    if (error) return json({ error: error.message.includes('not_your_client') ? 'not_your_client' : 'detach_failed' }, 403)
    return json({ ...(result as Record<string, unknown>), cancelled })
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'remove-client' })
    return internalError('remove-client', err, corsHeaders)
  }
})
