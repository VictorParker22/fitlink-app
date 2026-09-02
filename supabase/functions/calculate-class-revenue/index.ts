// supabase/functions/calculate-class-revenue/index.ts
// Deploy with: supabase functions deploy calculate-class-revenue
//
// Monthly on-demand class revenue share. Service-role only.
//
// THE POOL IS AN INPUT, NOT A GUESS. On-demand classes are sold through
// RevenueCat (client_premium), so the platform receives NET proceeds after
// the App Store / Play commission. The old version computed
// `count(class_subscriptions) × $19.99 × 90%` from a Stripe table nothing
// writes any more — and, rewired to IAP headcount, it would have paid out
// more than the platform received. The caller now passes
// `netProceedsCents` (from the RevenueCat / App Store Connect payout for
// that month); the coach pool is 90% of that.
//
// LEDGER BEFORE MONEY. class_revenue_shares is written as `pending` before
// stripe.transfers.create, then flipped to `completed`. The previous
// ordering wrote the ledger after the transfer with column names that did
// not exist, so the write always failed and a retry paid everyone again.
// Transfers also carry an idempotency key derived from (trainer, month).
//
// Body: { month?: 'YYYY-MM', netProceedsCents: number, dryRun?: boolean }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceRole, AuthError, authErrorResponse } from '../_shared/auth.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET')!, {
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const COACH_SHARE = 0.90

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    requireServiceRole(req)

    const body = await req.json().catch(() => ({}))
    let { month } = body
    const dryRun = body?.dryRun === true
    const netProceedsCents = Number(body?.netProceedsCents)

    if (!Number.isFinite(netProceedsCents) || netProceedsCents < 0) {
      return json({ error: 'netProceedsCents (integer, post-store-commission) is required' }, 400)
    }

    if (!month) {
      const date = new Date()
      date.setMonth(date.getMonth() - 1)
      month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }
    if (!/^\d{4}-\d{2}$/.test(String(month))) {
      return json({ error: 'month must be YYYY-MM' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const grossPool = Math.round(netProceedsCents)
    const coachPool = Math.floor(grossPool * COACH_SHARE)

    // Per-coach watch minutes. The RPC returns { trainer_id, minutes }.
    const { data: coachMinutes, error: minutesError } = await supabaseAdmin
      .rpc('get_coach_watch_minutes', { target_month: month })
    if (minutesError) throw new Error(`Failed to get coach minutes: ${minutesError.message}`)

    const rows: { trainer_id: string; minutes: number }[] = (coachMinutes ?? [])
      .map((r: any) => ({ trainer_id: r.trainer_id, minutes: Number(r.minutes ?? 0) }))
      .filter((r) => r.minutes > 0)
    const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0)

    const distributions: any[] = []

    if (coachPool > 0 && totalMinutes > 0) {
      for (const coach of rows) {
        const sharePercentage = coach.minutes / totalMinutes
        const payoutCents = Math.floor(coachPool * sharePercentage)

        // Idempotency: the ledger row is the source of truth.
        const { data: prior } = await supabaseAdmin
          .from('class_revenue_shares')
          .select('id, stripe_transfer_id, status')
          .eq('trainer_id', coach.trainer_id)
          .eq('month', month)
          .maybeSingle()

        if (prior?.status === 'completed' && prior?.stripe_transfer_id) {
          distributions.push({ trainer_id: coach.trainer_id, minutes: coach.minutes, payoutCents, status: 'already_paid', transferId: prior.stripe_transfer_id })
          continue
        }

        const { data: trainerData } = await supabaseAdmin
          .from('trainers')
          .select('stripe_account_id')
          .eq('id', coach.trainer_id)
          .maybeSingle()

        const base = {
          trainer_id: coach.trainer_id,
          month,
          total_watch_minutes: coach.minutes,
          platform_total_minutes: totalMinutes,
          share_percentage: Number(sharePercentage.toFixed(4)),
          gross_pool_cents: grossPool,
          payout_cents: payoutCents,
          calculated_at: new Date().toISOString(),
        }

        if (dryRun) {
          distributions.push({ ...base, status: 'dry_run' })
          continue
        }

        if (!trainerData?.stripe_account_id || payoutCents <= 0) {
          const { error } = await supabaseAdmin
            .from('class_revenue_shares')
            .upsert({ ...base, status: 'no_account', stripe_transfer_id: null }, { onConflict: 'trainer_id,month' })
          if (error) throw new Error(`Ledger write failed: ${error.message}`)
          distributions.push({ ...base, status: 'no_account' })
          continue
        }

        // 1. Ledger first, as pending.
        const { error: pendErr } = await supabaseAdmin
          .from('class_revenue_shares')
          .upsert({ ...base, status: 'pending' }, { onConflict: 'trainer_id,month' })
        if (pendErr) throw new Error(`Ledger write failed: ${pendErr.message}`)

        // 2. Money, with an idempotency key so a retry cannot double-pay
        //    even if the ledger flip below is lost.
        let transferId: string | null = null
        let status = 'failed'
        try {
          const transfer = await stripe.transfers.create({
            amount: payoutCents,
            currency: 'usd',
            destination: trainerData.stripe_account_id,
            description: `FitLink on-demand class revenue share for ${month}`,
            metadata: { fitlink_trainer_id: coach.trainer_id, fitlink_month: month },
          }, { idempotencyKey: `class-share:${coach.trainer_id}:${month}` })
          transferId = transfer.id
          status = 'completed'
        } catch (transferErr: any) {
          console.error(`Transfer failed for trainer ${coach.trainer_id}:`, transferErr?.message)
        }

        // 3. Flip the ledger.
        const { error: doneErr } = await supabaseAdmin
          .from('class_revenue_shares')
          .update({ status, stripe_transfer_id: transferId })
          .eq('trainer_id', coach.trainer_id)
          .eq('month', month)
        if (doneErr) console.error(`Ledger flip failed for ${coach.trainer_id} ${month}:`, doneErr.message)

        distributions.push({ ...base, status, transferId })
      }
    }

    return json({ month, dryRun, grossPool, coachPool, totalMinutes, coaches: rows.length, distributions })
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'calculate-class-revenue' })
    console.error('Error calculating class revenue:', err)
    return json({ error: err.message }, 500)
  }
})
