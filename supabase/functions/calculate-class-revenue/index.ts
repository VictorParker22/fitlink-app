// supabase/functions/calculate-class-revenue/index.ts
// Deploy with: supabase functions deploy calculate-class-revenue
// Set secrets: supabase secrets set STRIPE_SECRET=sk_test_...

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
    const body = await req.json().catch(() => ({}))
    let { month } = body

    if (!month) {
      // Default to previous month if not provided
      const date = new Date()
      date.setMonth(date.getMonth() - 1)
      const year = date.getFullYear()
      const m = (date.getMonth() + 1).toString().padStart(2, '0')
      month = `${year}-${m}`
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Calculate total active On-Demand Pass subscribers for the month
    // Note: In a real scenario you might look at historical data, but for this exercise we take current active count
    // or records active during that month. Following the prompt's instruction:
    const { count: subscriberCount, error: countError } = await supabaseAdmin
      .from('class_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    if (countError) {
      throw new Error(`Failed to count subscribers: ${countError.message}`)
    }

    const totalSubscribers = subscriberCount || 0

    // 2. Total revenue = subscriber_count * 1999 (cents)
    const totalRevenue = totalSubscribers * 1999

    // 3. Platform cut = 10%
    const platformCut = Math.round(totalRevenue * 0.10)

    // 4. Coach pool = totalRevenue - platformCut
    const coachPool = totalRevenue - platformCut

    const distributions = []

    if (coachPool > 0) {
      // 5. Get per-coach watch minutes using RPC
      const { data: coachMinutes, error: minutesError } = await supabaseAdmin.rpc('get_coach_watch_minutes', {
        target_month: month
      })

      if (minutesError) {
        throw new Error(`Failed to get coach minutes: ${minutesError.message}`)
      }

      if (coachMinutes && coachMinutes.length > 0) {
        // 6. Calculate total minutes across all coaches
        const totalMinutes = coachMinutes.reduce((sum: number, row: any) => sum + Number(row.total_minutes || 0), 0)

        if (totalMinutes > 0) {
          // 7. For each coach calculate share and distribute
          for (const coach of coachMinutes) {
            const minutes = Number(coach.total_minutes || 0)
            if (minutes <= 0) continue

            const sharePercentage = minutes / totalMinutes
            const payoutCents = Math.round(coachPool * sharePercentage)
            
            let transferId = null
            let transferStatus = 'pending'

            const { data: trainerData } = await supabaseAdmin
              .from('trainers')
              .select('stripe_account_id')
              .eq('id', coach.trainer_id)
              .single()

            if (trainerData?.stripe_account_id && payoutCents > 0) {
              try {
                const transfer = await stripe.transfers.create({
                  amount: payoutCents,
                  currency: 'usd',
                  destination: trainerData.stripe_account_id,
                  description: `FitLink On-Demand class revenue share for ${month}`,
                })
                transferId = transfer.id
                transferStatus = 'completed'
              } catch (transferErr: any) {
                console.error(`Transfer failed for trainer ${coach.trainer_id}:`, transferErr)
                transferStatus = 'failed'
              }
            } else {
              transferStatus = 'no_account'
            }

            // Upsert into class_revenue_shares table
            await supabaseAdmin.from('class_revenue_shares').upsert({
              trainer_id: coach.trainer_id,
              month: month,
              watch_minutes: minutes,
              share_percentage: sharePercentage,
              payout_amount: payoutCents,
              stripe_transfer_id: transferId,
              status: transferStatus,
              updated_at: new Date().toISOString()
            }, { onConflict: 'trainer_id,month' })

            distributions.push({
              trainer_id: coach.trainer_id,
              minutes,
              sharePercentage,
              payoutCents,
              transferId,
              status: transferStatus
            })
          }
        }
      }
    }

    // 8. Return summary
    return new Response(
      JSON.stringify({
        month,
        totalSubscribers,
        totalRevenue,
        platformCut,
        coachPool,
        distributions
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('Error calculating class revenue:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
