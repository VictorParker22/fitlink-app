// supabase/functions/send-push-notification/index.ts
// Deploy with: supabase functions deploy send-push-notification
//
// SECURITY (.agents/SECURITY_FIX_PLAN.md B3). This was an OPEN PUSH RELAY:
// no auth, no ownership check, no rate limit, wildcard CORS, and the
// destination token plus the entire title/body/data payload came from the
// caller. Anyone holding the anon key — which ships inside the app binary —
// could deliver arbitrary notifications to any harvested Expo token, styled
// as coming from FitLink ("Your payment failed, re-enter your card") with a
// deep link attached. Tokens are harvestable: expo_push_token sits on the
// clients and trainers rows the app already reads.
//
// The contract is UNCHANGED (16 call sites still pass pushToken) — what
// changes is that the token must now belong to somebody the caller is
// actually allowed to message. We resolve the token to its owner and
// require a real coach<->athlete relationship in one direction or the other.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.3'
import { guardRate } from '../_shared/rateLimit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Firebase Cloud Function URL for Android FCM delivery
const FIREBASE_PUSH_URL = 'https://sendpush-dzajkrvoua-ue.a.run.app';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Shared with the database trigger that pushes every notification row (Vault: notify_hook_secret).
const HOOK_SECRET = Deno.env.get('NOTIFY_HOOK_SECRET') ?? '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Only in-app paths may ride in data.url. The client also allowlists on
 * arrival, but a push that has already left the building is hard to recall —
 * so it is refused here too rather than trusted at the far end.
 */
function safeDataUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  if (!url.startsWith('/')) return null;   // no schemes, no absolute URLs
  if (url.includes('..')) return null;
  return url;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { title, body, data, toTrainerId, toClientId } = payload
    let pushToken: string | undefined = typeof payload?.pushToken === 'string' ? payload.pushToken : undefined

    if (!title || !body) {
      return json({ error: 'Missing required fields: title or body' }, 400);
    }

    // ── Recipient ────────────────────────────────────────────────────
    // Named recipients (toTrainerId / toClientId) are resolved by id with the
    // service role: the token never crosses the wire and ownership is known
    // without matching on the token. A bare pushToken (older call sites) is
    // matched with limit(1): two accounts on one phone share a token, and
    // maybeSingle() on that pair returned nothing, so every push from a
    // tester's phone was refused as "Unknown recipient" (2026-09-08).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    type TrainerOwner = { id: string } | null;
    type ClientOwner = { id: string; trainer_id: string | null; requested_trainer_id: string | null; auth_user_id: string | null } | null;
    let trainerOwner: TrainerOwner = null;
    let clientOwner: ClientOwner = null;
    if (toTrainerId) {
      const { data: row } = await admin.from('trainers').select('id, expo_push_token').eq('id', toTrainerId).maybeSingle();
      pushToken = row?.expo_push_token ?? undefined;
      trainerOwner = row ? { id: row.id } : null;
    } else if (toClientId) {
      const { data: row } = await admin.from('clients').select('id, trainer_id, requested_trainer_id, auth_user_id, expo_push_token').eq('id', toClientId).maybeSingle();
      pushToken = row?.expo_push_token ?? undefined;
      clientOwner = row ? { id: row.id, trainer_id: row.trainer_id, requested_trainer_id: row.requested_trainer_id, auth_user_id: row.auth_user_id } : null;
    }
    if ((toTrainerId || toClientId) && !pushToken) return json({ ok: true, skipped: 'no-token' })

    if (!pushToken) {
      return json({ error: 'Missing recipient: pushToken, toTrainerId or toClientId' }, 400);
    }

    // ── Authorization ────────────────────────────────────────────────
    // Trusted callers: the service role, and the database's notification
    // trigger (notify_push_on_notification) presenting NOTIFY_HOOK_SECRET in
    // the x-notify-hook header (its bearer is the anon key, for the gateway).
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const isServiceRole = !!SERVICE_ROLE_KEY && bearer === SERVICE_ROLE_KEY;
    const hookHeader = req.headers.get('x-notify-hook') ?? '';
    const isHook = !!HOOK_SECRET && hookHeader.length === HOOK_SECRET.length && hookHeader === HOOK_SECRET;

    if (!isServiceRole && !isHook) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: userData } = await userClient.auth.getUser();
      const caller = userData?.user;
      if (!caller) return json({ error: 'Unauthorized' }, 401);

      const rl = await guardRate(admin, caller.id, { bucket: 'push', limit: 60, windowSeconds: 3600, daily: 300, paid: false }, corsHeaders);
      if (rl) return rl;

      if (!trainerOwner && !clientOwner) {
        const [{ data: c }, { data: t }] = await Promise.all([
          admin.from('clients').select('id, trainer_id, requested_trainer_id, auth_user_id').eq('expo_push_token', pushToken).limit(1),
          admin.from('trainers').select('id').eq('expo_push_token', pushToken).limit(1),
        ]);
        clientOwner = c?.[0] ?? null;
        trainerOwner = t?.[0] ?? null;
      }
      if (!clientOwner && !trainerOwner) {
        return json({ error: 'Unknown recipient' }, 403);
      }

      // A coach may be pushed by themselves, their athletes, and the athletes
      // who have ASKED to train with them (the request itself is the news).
      // An athlete may be pushed by themselves, their coach, and the coach
      // they asked (a decline note, an acceptance).
      let allowed = false;
      if (trainerOwner) {
        if (trainerOwner.id === caller.id) allowed = true;
        else {
          const { data: rel } = await admin.from('clients').select('id')
            .eq('auth_user_id', caller.id)
            .or(`trainer_id.eq.${trainerOwner.id},requested_trainer_id.eq.${trainerOwner.id}`)
            .limit(1);
          allowed = !!rel?.[0];
        }
      }
      if (!allowed && clientOwner) {
        allowed = clientOwner.auth_user_id === caller.id || clientOwner.trainer_id === caller.id || clientOwner.requested_trainer_id === caller.id;
      }
      if (!allowed) return json({ error: 'Not authorized to notify this recipient' }, 403);
    }

    // data.url is attacker-influenceable even from a legitimate caller.
    const cleanData: Record<string, unknown> = { ...(data ?? {}) };
    if ('url' in cleanData) {
      const safe = safeDataUrl(cleanData.url);
      if (safe) cleanData.url = safe; else delete cleanData.url;
    }

    let result;
    const isExpoToken = pushToken.startsWith('ExponentPushToken[') || pushToken.startsWith('ExpoPushToken[');

    if (isExpoToken) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: pushToken,
          title,
          body,
          sound: 'default',
          channelId: 'default',
          data: cleanData,
        }),
      });
      result = await response.json();
    } else {
      // FCM v1 requires all data values to be strings.
      const stringifiedData: Record<string, string> = {};
      Object.entries(cleanData).forEach(([key, val]) => {
        stringifiedData[key] = typeof val === 'string' ? val : JSON.stringify(val);
      });

      const response = await fetch(FIREBASE_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pushToken, title, body, data: stringifiedData }),
      });
      const responseText = await response.text();
      try { result = JSON.parse(responseText); }
      catch { result = { status: response.status, body: responseText }; }
    }

    // Tokens are credentials for reaching a device — never log them. Expo's
    // ticket says why a push did not land (DeviceNotRegistered, credentials):
    // that much is logged, so a silent phone can be diagnosed from the logs.
    const ticket = (result as any)?.data;
    if (ticket && ticket.status === 'error') console.warn('[push] expo ticket error:', ticket.message, ticket.details?.error ?? '');
    else if (result && typeof (result as any).error === 'string') console.warn('[push] delivery error:', (result as any).error);
    return json(result, 200);
  } catch (err: any) {
    console.error('send-push-notification failed:', err?.message)
    return json({ error: 'Push failed' }, 500);
  }
})
