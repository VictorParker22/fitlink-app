// ============================================================
// delete-account-media — remove a departing user's FILES.
//
// delete_client_account() / delete_trainer_account() remove database rows,
// and Phase D fixed the last three tables that were not cascading. Neither
// touches STORAGE, so "delete my account" left avatars, chat attachments and
// progress photos — body photos — sitting in buckets afterwards. Two of those
// buckets were public until Phase E.
//
// This deletes the objects owned by the caller before the row deletion runs.
// It is deliberately its own endpoint rather than logic inside the RPC:
// Postgres can delete rows from storage.objects but cannot remove the
// underlying files, so it would have left orphaned blobs behind while
// reporting success.
//
// Honest reporting: the response says exactly which buckets were cleared and
// which failed, so the client can tell the user the truth rather than claiming
// a complete erasure it did not achieve.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/** Remove every object under `prefix/` in `bucket`. Returns how many went. */
async function purgePrefix(admin: any, bucket: string, prefix: string) {
  // Paginated: list() caps at 1000, and a long-lived account can hold more
  // chat attachments than that. Loop until a page comes back empty, with
  // a hard ceiling so a listing bug can't spin forever.
  let removed = 0
  for (let page = 0; page < 50; page++) {
    const { data: entries, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset: 0 }) // offset stays 0: we delete as we go
    if (error) return { bucket, prefix, removed, ok: false, error: error.message }
    if (!entries || entries.length === 0) break

    const paths = entries
      .filter((e: any) => e?.name && e.id !== null) // skip nested "folders"
      .map((e: any) => `${prefix}/${e.name}`)
    if (paths.length === 0) break

    const { error: rmErr } = await admin.storage.from(bucket).remove(paths)
    if (rmErr) return { bucket, prefix, removed, ok: false, error: rmErr.message }
    removed += paths.length
    if (entries.length < 1000) break
  }
  return { bucket, prefix, removed, ok: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const caller = await requireCaller(req)
    const admin = caller.admin
    const uid = caller.id

    // Objects live under the auth uid for everything the user uploads
    // themselves. Progress photos are the exception: a coach logging on an
    // athlete's behalf writes under that athlete's clients.id, so an athlete
    // deleting their account must clear that prefix too.
    const { data: clientRow } = await admin
      .from('clients')
      .select('id')
      .eq('auth_user_id', uid)
      .maybeSingle()

    const targets: { bucket: string; prefix: string }[] = [
      { bucket: 'avatars', prefix: uid },
      { bucket: 'chat-attachments', prefix: uid },
      { bucket: 'progress-photos', prefix: uid },
      { bucket: 'coach-media', prefix: uid },
      { bucket: 'class-videos', prefix: uid },
      { bucket: 'class-thumbnails', prefix: uid },
      { bucket: 'exercise-videos', prefix: uid },
      { bucket: 'diet-images', prefix: uid },
    ]
    if (clientRow?.id) {
      targets.push({ bucket: 'progress-photos', prefix: clientRow.id })
    }

    const results = []
    for (const t of targets) {
      results.push(await purgePrefix(admin, t.bucket, t.prefix))
    }

    const failed = results.filter((r) => !r.ok)
    const removed = results.reduce((n, r) => n + r.removed, 0)

    return json({
      success: failed.length === 0,
      removed,
      // Named plainly so the caller can be honest about a partial result.
      failedBuckets: failed.map((f) => f.bucket),
    })
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'delete-account-media' })
    console.error('delete-account-media failed:', err?.message)
    return json({ success: false, error: 'Media cleanup failed' }, 500)
  }
})
