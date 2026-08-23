import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { guardRate } from '../_shared/rateLimit.ts'

const MUX_TOKEN_ID = Deno.env.get('MuxAccessToken') ?? '';
const MUX_TOKEN_SECRET = Deno.env.get('MuxSecret') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Billable Mux resource. Two server-side gates a patched client can't
    // skip: (1) live broadcasting is Elite — verify trainers.elite_until
    // (webhook-written); (2) a per-user rate cap so even an Elite coach
    // can't loop the endpoint to spawn unlimited streams.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: trainerRow } = await admin
      .from('trainers')
      .select('elite_until')
      .eq('id', user.id)
      .maybeSingle()
    const eliteUntil = trainerRow?.elite_until ? new Date(trainerRow.elite_until) : null
    if (!eliteUntil || eliteUntil.getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: 'elite_required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 402,
      })
    }
    const limited = await guardRate(admin, user.id, { bucket: 'create-mux-stream', limit: 20, windowSeconds: 3600 }, corsHeaders)
    if (limited) return limited

    // Call Mux API to create a live stream
    const muxResponse = await fetch('https://api.mux.com/video/v1/live-streams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`)}`,
      },
      body: JSON.stringify({
        playback_policy: ['public'],
        new_asset_settings: { playback_policy: ['public'] },
      }),
    })

    if (!muxResponse.ok) {
      const errorText = await muxResponse.text()
      console.error('Mux error:', errorText)
      throw new Error(`Mux API returned ${muxResponse.status}: ${errorText}`)
    }

    const muxData = await muxResponse.json()
    const stream = muxData.data

    return new Response(
      JSON.stringify({
        stream_id: stream.id,
        stream_key: stream.stream_key,
        playback_id: stream.playback_ids[0].id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
