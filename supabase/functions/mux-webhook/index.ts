// supabase/functions/mux-webhook/index.ts
// Deploy with: supabase functions deploy mux-webhook --no-verify-jwt
// Set secrets: supabase secrets set MUX_WEBHOOK_SECRET=your_mux_secret_here

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Utility to verify Mux Signature using Web Crypto API
async function verifyMuxSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return true; // Fail open in dev if secret not configured yet

  try {
    const parts = header.split(',');
    let timestamp = '';
    let signature = '';

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key.trim() === 't') timestamp = value.trim();
      if (key.trim() === 'v1') signature = value.trim();
    }

    if (!timestamp || !signature) return false;

    const payload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const hashArray = Array.from(new Uint8Array(sigBuffer));
    const expectedSig = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return expectedSig === signature;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signatureHeader = req.headers.get('mux-signature');
  const rawBody = await req.text();
  const webhookSecret = Deno.env.get('MUX_WEBHOOK_SECRET');

  if (webhookSecret) {
    const isValid = await verifyMuxSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.error('Invalid Mux Webhook Signature');
      return new Response('Invalid Signature', { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventType = payload.type;
  const data = payload.data;
  console.log(`[Mux Webhook] Event received: ${eventType}`, data?.id);

  // Initialize Supabase Admin Client
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    if (!data?.id) {
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const streamId = data.id;

    switch (eventType) {
      case 'video.live_stream.connected':
      case 'video.live_stream.active': {
        console.log(`[Mux Webhook] Stream ${streamId} active. Updating status to 'live'`);
        await supabaseAdmin
          .from('live_classes')
          .update({ status: 'live', updated_at: new Date().toISOString() })
          .eq('mux_stream_id', streamId);
        break;
      }

      case 'video.live_stream.disconnected': {
        console.log(`[Mux Webhook] Stream ${streamId} disconnected. Updating status to 'ended'`);
        await supabaseAdmin
          .from('live_classes')
          .update({ status: 'ended', updated_at: new Date().toISOString() })
          .eq('mux_stream_id', streamId);
        break;
      }
      case 'video.live_stream.idle': {
        console.log(`[Mux Webhook] Stream ${streamId} is idle (waiting for connection or just created).`);
        break;
      }

      case 'video.asset.static_renditions.ready': {
        const assetId = data.id;
        console.log(`[Mux Webhook] MP4 renditions ready for asset ${assetId}`);
        
        // 1. Find the processing class
        const { data: processingClass, error: findError } = await supabaseAdmin
          .from('classes')
          .select('id, trainer_id, title')
          .eq('video_url', `processing:${assetId}`)
          .single();
          
        if (findError || !processingClass) {
          console.log(`[Mux Webhook] No processing class found for asset ${assetId}`);
          break;
        }

        // 2. Stream the MP4 from Mux to Supabase Storage
        const assetPlaybackId = data.playback_ids?.find((p: any) => p.policy === 'public')?.id;
        if (!assetPlaybackId) throw new Error("Asset has no public playback ID");

        const mp4Url = `https://stream.mux.com/${assetPlaybackId}/high.mp4`;
        console.log(`[Mux Webhook] Streaming MP4 from ${mp4Url} to Supabase...`);
        const mp4Response = await fetch(mp4Url);
        if (!mp4Response.ok) throw new Error("Failed to download MP4 from Mux");

        const filePath = `${processingClass.trainer_id}/${processingClass.id}.mp4`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin
          .storage
          .from('videos')
          .upload(filePath, mp4Response.body as any, {
            contentType: 'video/mp4',
            upsert: true,
            duplex: 'half'
          });

        if (uploadError) {
          console.error("[Mux Webhook] Upload Error:", uploadError);
          throw new Error("Failed to upload MP4 to Supabase Storage");
        }

        const { data: publicUrlData } = supabaseAdmin.storage.from('videos').getPublicUrl(filePath);
        const finalVideoUrl = publicUrlData.publicUrl;

        // 3. Update the DB with the new Supabase URL and set status to published
        await supabaseAdmin.from('classes').update({
          video_url: finalVideoUrl,
          status: 'published',
          updated_at: new Date().toISOString()
        }).eq('id', processingClass.id);

        console.log(`[Mux Webhook] Class ${processingClass.id} published successfully with Supabase URL`);

        // 4. Delete the Mux Asset to stop billing
        const MUX_TOKEN_ID = Deno.env.get('MuxAccessToken') ?? '';
        const MUX_TOKEN_SECRET = Deno.env.get('MuxSecret') ?? '';
        const muxAuthHeader = `Basic ${btoa(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`)}`;
        
        if (MUX_TOKEN_ID && MUX_TOKEN_SECRET) {
          fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
              method: 'DELETE',
              headers: { Authorization: muxAuthHeader }
          }).catch(e => console.error("Failed to delete Mux Asset", e));
          
          if (data.live_stream_id) {
             fetch(`https://api.mux.com/video/v1/live-streams/${data.live_stream_id}`, {
                 method: 'DELETE',
                 headers: { Authorization: muxAuthHeader }
             }).catch(e => console.error("Failed to delete Mux Live Stream", e));
          }
        }
        
        // 5. Send push notification to coach
        try {
          // Fire and forget notification
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              userId: processingClass.trainer_id,
              title: 'Class Published! 🎉',
              body: `Your On-Demand Class "${processingClass.title}" has finished processing and is now live!`,
              data: { route: '/(tabs)/programs' }
            })
          });
        } catch (e) {
          console.error("[Mux Webhook] Failed to send push notification:", e);
        }
        
        break;
      }

      default:
        console.log(`[Mux Webhook] Unhandled event type: ${eventType}`);
        break;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error(`[Mux Webhook] Error processing event: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
