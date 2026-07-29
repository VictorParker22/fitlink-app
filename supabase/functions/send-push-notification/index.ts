// supabase/functions/send-push-notification/index.ts
// Deploy with: supabase functions deploy send-push-notification
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Firebase Cloud Function URL for Android FCM delivery
const FIREBASE_PUSH_URL = 'https://sendpush-dzajkrvoua-ue.a.run.app';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pushToken, title, body, data } = await req.json()

    if (!pushToken || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: pushToken, title, or body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let result;
    const isExpoToken = pushToken.startsWith('ExponentPushToken[') || pushToken.startsWith('ExpoPushToken[');

    if (isExpoToken) {
      // ── iOS path: Expo Push API ──
      console.log('Sending via Expo Push API to:', pushToken);
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
          data: data || {},
        }),
      });
      result = await response.json();
    } else {
      // ── Android path: Firebase Cloud Function (uses ADC, no key needed) ──
      // FCM v1 requires all values in the data object to be strings
      const stringifiedData: Record<string, string> = {};
      if (data) {
        Object.entries(data).forEach(([key, val]) => {
          stringifiedData[key] = typeof val === 'string' ? val : JSON.stringify(val);
        });
      }

      console.log('Sending via Firebase Cloud Function to:', pushToken);
      const response = await fetch(FIREBASE_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: pushToken,
          title,
          body,
          data: stringifiedData,
        }),
      });
      const responseText = await response.text();
      console.log('Firebase response:', response.status, responseText);
      try {
        result = JSON.parse(responseText);
      } catch {
        result = { status: response.status, body: responseText };
      }
    }

    console.log('Push result:', JSON.stringify(result));

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('Error sending push notification:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
