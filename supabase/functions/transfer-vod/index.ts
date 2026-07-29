import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MUX_TOKEN_ID = Deno.env.get('MuxAccessToken') ?? '';
const MUX_TOKEN_SECRET = Deno.env.get('MuxSecret') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
      SUPABASE_URL,
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

    const body = await req.json();
    const { classId } = body;

    if (!classId) throw new Error("classId is required");

    // Initialize Admin client to bypass RLS for storage uploads
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch the class to get the Mux Playback ID
    const { data: classData, error: classError } = await supabaseAdmin
      .from('classes')
      .select('video_url, trainer_id')
      .eq('id', classId)
      .single();

    if (classError || !classData) throw new Error("Class not found");
    if (classData.trainer_id !== user.id) throw new Error("Not authorized to publish this class");

    const videoUrl = classData.video_url || '';
    if (!videoUrl.includes('stream.mux.com') || !videoUrl.endsWith('.m3u8')) {
      // If it's already a Supabase URL or uploaded file, just mark as published and exit
      await supabaseAdmin.from('classes').update({ status: 'published' }).eq('id', classId);
      return new Response(JSON.stringify({ success: true, message: "Class published without transfer" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const livePlaybackId = videoUrl.split('stream.mux.com/')[1].split('.m3u8')[0];
    const muxAuthHeader = `Basic ${btoa(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`)}`;

    // 2. Resolve Playback ID -> Live Stream ID
    const playbackRes = await fetch(`https://api.mux.com/video/v1/playback-ids/${livePlaybackId}`, {
      headers: { Authorization: muxAuthHeader }
    });
    if (!playbackRes.ok) throw new Error("Failed to fetch Mux Playback ID");
    const playbackData = await playbackRes.json();
    
    if (playbackData.data.object.type !== 'live_stream') {
        throw new Error("Playback ID does not belong to a live stream");
    }
    const liveStreamId = playbackData.data.object.id;

    // 3. Resolve Live Stream ID -> Recent Asset ID
    const streamRes = await fetch(`https://api.mux.com/video/v1/live-streams/${liveStreamId}`, {
      headers: { Authorization: muxAuthHeader }
    });
    if (!streamRes.ok) throw new Error("Failed to fetch Mux Live Stream");
    const streamData = await streamRes.json();
    
    const assetIds = streamData.data.recent_asset_ids;
    if (!assetIds || assetIds.length === 0) {
      throw new Error("Live Stream has no recorded assets yet. Try again later.");
    }
    const assetId = assetIds[0];

    // 4. Trigger MP4 generation on the Asset
    console.log(`[Transfer VOD] Requesting MP4 support for Asset ${assetId}`);
    const mp4Res = await fetch(`https://api.mux.com/video/v1/assets/${assetId}/mp4-support`, {
      method: 'PUT',
      headers: { 
        Authorization: muxAuthHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mp4_support: "standard" })
    });
    
    if (!mp4Res.ok) {
      const errText = await mp4Res.text();
      console.error("Mux MP4 request failed:", errText);
      throw new Error("Failed to request MP4 generation from Mux");
    }

    // 5. Update the DB to processing status and embed assetId in video_url for the webhook
    await supabaseAdmin.from('classes').update({
      video_url: `processing:${assetId}`,
      status: 'processing',
      updated_at: new Date().toISOString()
    }).eq('id', classId);

    return new Response(
      JSON.stringify({
        success: true,
        message: "MP4 generation started successfully",
        status: "processing"
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('[Transfer VOD] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
