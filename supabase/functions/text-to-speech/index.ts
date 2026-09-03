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

// Solo mode: one voice per corner character (lib/soloCharacters.ts).
// Premade ElevenLabs voices by default; override per character with
// SOLO_VOICE_<KEY> secrets once custom voices exist.
const SOLO_VOICES: Record<string, string> = {
  reyes: Deno.env.get('SOLO_VOICE_REYES') || 'pNInz6obpgDQGcFmaJgB', // Adam — low, calm
  imani: Deno.env.get('SOLO_VOICE_IMANI') || '21m00Tcm4TlvDq8ikWAM', // Rachel — clear, warm
  dane:  Deno.env.get('SOLO_VOICE_DANE')  || 'TxGEqnHWrfWFTfGW9XjX', // Josh — bright, driven
  sol:   Deno.env.get('SOLO_VOICE_SOL')   || 'EXAVITQu4vr4xnSDxMaL', // Bella — soft, steady
};
// Delivery settings per register: the same line lands differently.
const SOLO_SETTINGS: Record<string, { stability: number; similarity_boost: number; style: number }> = {
  reyes: { stability: 0.7, similarity_boost: 0.75, style: 0.15 },
  imani: { stability: 0.55, similarity_boost: 0.75, style: 0.3 },
  dane:  { stability: 0.35, similarity_boost: 0.8, style: 0.6 },
  sol:   { stability: 0.75, similarity_boost: 0.75, style: 0.2 },
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Was unauthenticated: anyone could burn the ElevenLabs quota and write
    // into the exercise-audio bucket.
    const caller = await requireCaller(req);

    const { exercise_id, text, mode, voice } = await req.json();

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // ── Solo mode: a corner line in the character's voice ──────────────
    if (mode === 'solo') {
      const key = String(voice || '');
      const voiceId = SOLO_VOICES[key];
      if (!voiceId) {
        return new Response(JSON.stringify({ error: 'Unknown voice' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }
      const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
      if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
      const admin = caller.admin;

      const plain = clampText(text, 900).replace(/\s+/g, ' ').trim();
      const path = `${key}/${await sha256Hex(`${voiceId}|${plain}`)}.mp3`;

      // Cache hit: the same line in the same voice is one file forever.
      const { data: signed } = await admin.storage.from('solo-audio').createSignedUrl(path, 600);
      if (signed?.signedUrl) {
        return new Response(JSON.stringify({ audio_url: signed.signedUrl, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
        });
      }

      // Fresh synthesis is the only paid path: rate-limit it.
      const rl = await guardRate(admin, caller.id, { bucket: 'solo-voice', limit: 80, windowSeconds: 3600 }, corsHeaders);
      if (rl) return rl;

      const tts = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({
          text: plain,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { ...(SOLO_SETTINGS[key] ?? SOLO_SETTINGS.reyes), use_speaker_boost: true },
        }),
      });
      if (!tts.ok) {
        console.error('ElevenLabs error (solo):', tts.status, await tts.text());
        throw new Error(`ElevenLabs API error: ${tts.status}`);
      }
      const bytes = new Uint8Array(await tts.arrayBuffer());
      const { error: upErr } = await admin.storage.from('solo-audio').upload(path, bytes, { contentType: 'audio/mpeg', upsert: true });
      if (upErr) { console.error('solo-audio upload:', upErr); throw new Error('Failed to cache audio file'); }
      const { data: fresh, error: signErr } = await admin.storage.from('solo-audio').createSignedUrl(path, 600);
      if (signErr || !fresh?.signedUrl) throw new Error('Failed to sign audio URL');
      return new Response(JSON.stringify({ audio_url: fresh.signedUrl, cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
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
