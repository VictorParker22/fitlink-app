// supabase/functions/client-autoflow/index.ts
// Invoked by stripe-webhook after payment_intent.succeeded.
// Three steps: assign workout → send welcome message → notify coach.
// Deploy: supabase functions deploy client-autoflow

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceRole, AuthError, authErrorResponse } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Webhook-internal only. The comment said "invoked by stripe-webhook",
    // but nothing enforced it: any anon-key caller could assign workouts,
    // create a conversation, and insert a message attributed to
    // sender_type:'trainer' — forging coach messages and fake "X just
    // subscribed!" notifications at will.
    requireServiceRole(req)

    const { clientId, trainerId, planId } = await req.json()

    if (!clientId || !trainerId || !planId) {
      return new Response(
        JSON.stringify({ error: 'Missing clientId, trainerId, or planId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Fetch required data in parallel ─────────────────────────────────────
    const [planRes, clientRes, trainerRes] = await Promise.all([
      supabase.from('plans')
        .select('name, autoflow_enabled, autoflow_workout_id, autoflow_welcome_message')
        .eq('id', planId)
        .single(),
      supabase.from('clients')
        .select('name, expo_push_token')
        .eq('id', clientId)
        .single(),
      supabase.from('trainers')
        .select('name, expo_push_token')
        .eq('id', trainerId)
        .single(),
    ])

    const plan = planRes.data
    const client = clientRes.data
    const trainer = trainerRes.data

    if (!plan || !client || !trainer) {
      console.error('[autoflow] Missing data:', { plan, client, trainer })
      return new Response(
        JSON.stringify({ error: 'Could not fetch plan/client/trainer' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Early-exit if autoflow is disabled for this plan ─────────────────────
    if (plan.autoflow_enabled === false) {
      console.log('[autoflow] Autoflow disabled for plan', planId)
      return new Response(
        JSON.stringify({ skipped: true, reason: 'autoflow_disabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: Record<string, string> = {}

    // ── STEP 1: Auto-assign workout ──────────────────────────────────────────
    if (plan.autoflow_workout_id) {
      const today = new Date().toISOString().split('T')[0]
      const { error: workoutErr } = await supabase
        .from('client_workouts')
        .insert({
          client_id: clientId,
          workout_id: plan.autoflow_workout_id,
          assigned_date: today,
          status: 'assigned',
        })
      if (workoutErr) {
        console.error('[autoflow] Workout assign failed:', workoutErr)
        results.workout = 'failed'
      } else {
        results.workout = 'assigned'
        console.log('[autoflow] Workout assigned:', plan.autoflow_workout_id)
      }
    } else {
      results.workout = 'skipped_no_workout_configured'
    }

    // ── STEP 2: Send welcome message ─────────────────────────────────────────
    // Ensure conversation exists (trainers ↔ client)
    let conversationId: string | null = null
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('trainer_id', trainerId)
      .eq('client_id', clientId)
      .maybeSingle()

    if (existingConv) {
      conversationId = existingConv.id
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({ trainer_id: trainerId, client_id: clientId, unread_count: 1 })
        .select('id')
        .single()
      if (convErr) {
        console.error('[autoflow] Conversation create failed:', convErr)
      } else {
        conversationId = newConv.id
      }
    }

    const welcomeMessage = plan.autoflow_welcome_message ||
      `Hey ${client.name}! 👋 Welcome to the **${plan.name}** program. I'm ${trainer.name} and I'm pumped to be coaching you. Your first workout has been assigned — let's get to work! 💪`

    if (conversationId) {
      const { error: msgErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_type: 'trainer',
          content: welcomeMessage,
        })

      if (msgErr) {
        console.error('[autoflow] Welcome message insert failed:', msgErr)
        results.message = 'failed'
      } else {
        // Update conversation's last_message preview
        await supabase
          .from('conversations')
          .update({
            last_message: welcomeMessage.slice(0, 100),
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          })
          .eq('id', conversationId)

        results.message = 'sent'
        console.log('[autoflow] Welcome message sent to conversation', conversationId)

        // Push notification to client
        if (client.expo_push_token) {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              pushToken: client.expo_push_token,
              title: `Welcome from Coach ${trainer.name}!`,
              body: welcomeMessage.slice(0, 80),
              data: { url: '/my-messages' },
            },
          }).catch((e: any) => console.log('[autoflow] Push to client failed:', e))
        }
      }
    } else {
      results.message = 'failed_no_conversation'
    }

    // ── STEP 3: Notify coach ─────────────────────────────────────────────────
    const { error: notifErr } = await supabase
      .from('notifications')
      .insert({
        trainer_id: trainerId,
        type: 'score',
        title: `🎉 ${client.name} just subscribed!`,
        description: `They joined your **${plan.name}** plan. Autoflow fired: workout assigned + welcome message sent.`,
        is_read: false,
      })

    if (notifErr) {
      console.error('[autoflow] Coach notification failed:', notifErr)
      results.notification = 'failed'
    } else {
      results.notification = 'sent'

      // Push to coach
      if (trainer.expo_push_token) {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            pushToken: trainer.expo_push_token,
            title: `🎉 New Subscriber!`,
            body: `${client.name} joined ${plan.name}`,
            data: { url: '/notifications' },
          },
        }).catch((e: any) => console.log('[autoflow] Push to trainer failed:', e))
      }
    }

    console.log('[autoflow] Complete for client', clientId, '→ results:', results)
    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'client-autoflow' });
    console.error('[autoflow] Fatal error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
