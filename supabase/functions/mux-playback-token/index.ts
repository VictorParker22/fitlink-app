// mux-playback-token — a signed playback URL for one live class, for one
// viewer who is allowed to watch it (threat model A8).
//
// Playback ids used to be public: whoever held one could watch, and roster
// athletes and invitees all held it. Streams are now created with a signed
// playback policy; this function is the only place a token is minted for a
// signed-in viewer (guests on fitlink.coach/live/CODE get theirs from
// invite-info, where the code is the credential).
//
// POST { liveClassId } → { playbackId, token, url, expiresAt }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { guardRate } from '../_shared/rateLimit.ts'
import { internalError } from '../_shared/http.ts'
import { signPlaybackToken } from '../_shared/muxToken.ts'

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
    const rl = await guardRate(caller.admin, caller.id, { bucket: 'playback-token', limit: 120, windowSeconds: 3600, paid: false }, corsHeaders)
    if (rl) return rl

    const body = await req.json().catch(() => ({}))
    const liveClassId = typeof body?.liveClassId === 'string' ? body.liveClassId : ''
    if (!/^[0-9a-f-]{36}$/i.test(liveClassId)) return json({ error: 'liveClassId required' }, 400)

    const admin = caller.admin
    const { data: lc } = await admin
      .from('live_classes')
      .select('id, trainer_id, status, mux_playback_id')
      .eq('id', liveClassId)
      .maybeSingle()
    if (!lc) return json({ error: 'not_found' }, 404)

    // The same right-to-watch as live_classes_select: owner, roster athlete,
    // or holder of a live invite seat.
    let allowed = lc.trainer_id === caller.id
    if (!allowed) {
      const { data: roster } = await admin.from('clients').select('id')
        .eq('auth_user_id', caller.id).eq('trainer_id', lc.trainer_id).limit(1)
      allowed = !!roster?.length
    }
    if (!allowed) {
      const { data: seat } = await admin.from('live_class_access').select('live_class_id')
        .eq('live_class_id', lc.id).eq('user_id', caller.id).limit(1)
      allowed = !!seat?.length
    }
    if (!allowed) return json({ error: 'not_allowed' }, 403)
    if (!lc.mux_playback_id) return json({ error: 'no_playback' }, 409)

    const { token, expiresAt } = await signPlaybackToken(admin, lc.mux_playback_id)
    return json({
      playbackId: lc.mux_playback_id,
      token,
      url: `https://stream.mux.com/${lc.mux_playback_id}.m3u8?token=${token}`,
      expiresAt,
    })
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'mux-playback-token' })
    return internalError('mux-playback-token', err, corsHeaders)
  }
})
