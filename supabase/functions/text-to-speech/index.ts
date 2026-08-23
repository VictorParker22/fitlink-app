import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { guardRate, clampText } from '../_shared/rateLimit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ElevenLabs voice ID - "Rachel" (calm, clear female coach voice)
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Was unauthenticated: anyone could burn the ElevenLabs quota and write
    // into the exercise-audio bucket.
    const caller = await requireCaller(req);

    const { exercise_id, text } = await req.json();

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (!exercise_id) {
      return new Response(JSON.stringify({ error: 'exercise_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // exercise_id went straight into the object key with upsert:true, so an
    // unauthenticated caller could OVERWRITE any existing exercise audio with
    // speech of their choosing — and the path was never checked for slashes
    // or traversal. Accept only a plain uuid/slug.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(exercise_id))) {
      return new Response(JSON.stringify({ error: 'Invalid exercise_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const audioPath = `${exercise_id}.mp3`;

    // Check if audio already exists in storage (cache hit)
    const { data: existingFile } = await supabase.storage
      .from('exercise-audio')
      .createSignedUrl(audioPath, 60);

    if (existingFile?.signedUrl) {
      // Return the public URL instead
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/exercise-audio/${audioPath}`;
      return new Response(JSON.stringify({ audio_url: publicUrl, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Only the fresh-synthesis path costs an ElevenLabs call — a cache hit
    // above returned already. Rate-limit + clamp only here so cached audio
    // stays free and unthrottled.
    const rl = await guardRate(caller.admin, caller.id, { bucket: 'text-to-speech', limit: 100, windowSeconds: 3600 }, corsHeaders);
    if (rl) return rl;

    // Strip HTML tags for clean speech
    const plainText = clampText(text, 1200).replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

    if (!plainText) {
      return new Response(JSON.stringify({ error: 'No speakable text after stripping HTML' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Call ElevenLabs TTS API
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: plainText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error('ElevenLabs error:', ttsResponse.status, errText);
      throw new Error(`ElevenLabs API error: ${ttsResponse.status}`);
    }

    // Get the audio as a buffer
    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioUint8 = new Uint8Array(audioBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('exercise-audio')
      .upload(audioPath, audioUint8, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error('Failed to cache audio file');
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/exercise-audio/${audioPath}`;

    return new Response(JSON.stringify({ audio_url: publicUrl, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders, { req, endpoint: 'text-to-speech' });
    console.error('TTS Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
