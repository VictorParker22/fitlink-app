import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0";
import { requireServiceRole, AuthError, authErrorResponse } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // There was no signature or shared secret — the function trusted
    // payload.type === 'DELETE' and payload.table === 'messages' as
    // self-asserted JSON, then derived a storage path from the caller's own
    // attachment_url and removed it. Anyone could wipe anyone's chat
    // attachments. DB webhooks call this with the service role.
    requireServiceRole(req)

    const payload = await req.json();
    console.log('Webhook payload received:', payload);

    // Ensure this is a DELETE event from the messages table
    if (payload.type === 'DELETE' && payload.table === 'messages') {
      const oldRecord = payload.old_record;

      if (oldRecord && oldRecord.attachment_url) {
        const url = oldRecord.attachment_url;
        // The URL typically looks like: https://[project-ref].supabase.co/storage/v1/object/public/chat-attachments/filename.jpg
        // Extract everything after 'chat-attachments/'
        const parts = url.split('chat-attachments/');
        if (parts.length === 2) {
          const filename = parts[1];
          console.log(`Deleting file: ${filename} from chat-attachments bucket`);

          const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          );

          const { data, error } = await supabaseAdmin
            .storage
            .from('chat-attachments')
            .remove([filename]);

          if (error) {
            console.error('Storage deletion error:', error);
            throw error;
          }

          console.log('Successfully deleted file:', filename);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
