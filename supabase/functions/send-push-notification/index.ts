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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Firebase Cloud Function URL for Android FCM delivery
const FIREBASE_PUSH_URL = 'https://sendpush-dzajkrvoua-ue.a.run.app';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
    const { pushToken, title, body, data } = await req.json()

    if (!pushToken || !title || !body) {
      return json({ error: 'Missing required fields: pushToken, title, or body' }, 400);
    }

    // ── Authorization ────────────────────────────────────────────────
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const isServiceRole = !!SERVICE_ROLE_KEY && bearer === SERVICE_ROLE_KEY;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (!isServiceRole) {
      // A real user, not the anon key. getUser() is what distinguishes
      // "signed by this project" from "is somebody".
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: userData } = await userClient.auth.getUser();
      const caller = userData?.user;
      if (!caller) return json({ error: 'Unauthorized' }, 401);

      // Who owns this token? Look in both directions.
      const [{ data: clientOwner }, { data: trainerOwner }] = await Promise.all([
        admin.from('clients').select('id, trainer_id, auth_user_id')
          .eq('expo_push_token', pushToken).maybeSingle(),
        admin.from('trainers').select('id')
          .eq('expo_push_token', pushToken).maybeSingle(),
      ]);

      if (!clientOwner && !trainerOwner) {
        // Unknown token: refuse rather than forward. This is what stopped
        // the relay being pointed at arbitrary strings, including non-Expo
        // tokens that were passed straight through to Firebase.
        return json({ error: 'Unknown recipient' }, 403);
      }

      let allowed = false;
      if (trainerOwner) {
        // Pushing a coach: the caller must be that coach, or one of their athletes.
        if (trainerOwner.id === caller.id) allowed = true;
        else {
          const { data: rel } = await admin.from('clients').select('id')
            .eq('auth_user_id', caller.id).eq('trainer_id', trainerOwner.id).maybeSingle();
          allowed = !!rel;
        }
      }
      if (!allowed && clientOwner) {
        // Pushing an athlete: the caller must be that athlete, or their coach.
        allowed = clientOwner.auth_user_id === caller.id || clientOwner.trainer_id === caller.id;
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

    // Tokens are credentials for reaching a device — never log them.
    return json(result, 200);
  } catch (err: any) {
    console.error('send-push-notification failed:', err?.message)
    return json({ error: 'Push failed' }, 500);
  }
})
