import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, query, trainerId, clientId } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Link action: claim a client by setting trainer_id ──
    if (action === 'link' && clientId && trainerId) {
      const { error } = await supabase
        .from('clients')
        .update({ trainer_id: trainerId })
        .eq('id', clientId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ── Claim action: client claims their row by email, stamps auth_user_id + assessment ──
    if (action === 'claim') {
      const { authUserId, email, assessmentData } = body;
      if (!authUserId || !email) {
        return new Response(JSON.stringify({ error: 'authUserId and email required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      // Find client row by auth_user_id first, then by email (bypasses RLS)
      let clientRow = null;
      const { data: byAuth } = await supabase
        .from('clients').select('id').eq('auth_user_id', authUserId).maybeSingle();
      if (byAuth) {
        clientRow = byAuth;
      } else {
        const { data: byEmail } = await supabase
          .from('clients').select('id').eq('email', email).maybeSingle();
        if (byEmail) clientRow = byEmail;
      }

      if (clientRow) {
        const { error: upErr } = await supabase
          .from('clients')
          .update({ auth_user_id: authUserId, assessment_data: assessmentData })
          .eq('id', clientRow.id);
        return new Response(JSON.stringify({ success: !upErr, clientId: clientRow.id, error: upErr?.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: upErr ? 400 : 200,
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'No client row found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404,
      });
    }

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (!trainerId) {
      return new Response(JSON.stringify({ error: 'trainerId required', data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const q = query.trim().toLowerCase();
    const results: any[] = [];
    const seen = new Set<string>();

    // Build exclusion sets: trainer IDs and current client emails/phones
    const { data: allTrainers } = await supabase
      .from('trainers')
      .select('id, email');
    const trainerIds = new Set((allTrainers || []).map(t => t.id));
    const trainerEmails = new Set((allTrainers || []).map(t => t.email?.toLowerCase()).filter(Boolean));

    const { data: myClients } = await supabase
      .from('clients')
      .select('id, email, phone')
      .eq('trainer_id', trainerId);
    const myClientIds = new Set((myClients || []).map(c => c.id));
    const myEmails = new Set((myClients || []).map(c => c.email?.toLowerCase()).filter(Boolean));
    const myPhones = new Set((myClients || []).map(c => c.phone).filter(Boolean));

    // Search clients table — unassigned OR belonging to other trainers
    const { data: foundClients } = await supabase
      .from('clients')
      .select('id, name, email, phone, avatar_url, status, trainer_id')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);

    for (const client of (foundClients || [])) {
      if (seen.has(client.id)) continue;
      if (myClientIds.has(client.id)) continue;
      if (client.trainer_id === trainerId) continue;
      if (client.email && myEmails.has(client.email.toLowerCase())) continue;
      if (client.phone && myPhones.has(client.phone)) continue;
      // Exclude trainers who might also be in clients table
      if (trainerIds.has(client.id)) continue;
      if (client.email && trainerEmails.has(client.email.toLowerCase())) continue;

      seen.add(client.id);
      results.push({
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        avatar_url: client.avatar_url,
        status: client.status,
        hasTrainer: !!client.trainer_id,
      });
    }

    // Search auth.users for client-role users not yet in the clients table
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 50 });
    if (users) {
      for (const user of users) {
        const email = user.email?.toLowerCase() || '';
        const name = (user.user_metadata?.name || '').toLowerCase();
        const role = user.user_metadata?.role || '';

        // ONLY include users with role 'client' — skip trainers and unknown roles
        if (role !== 'client') continue;

        // Must match search query
        if (!email.includes(q) && !name.includes(q)) continue;

        // Skip trainers
        if (trainerIds.has(user.id)) continue;
        if (trainerEmails.has(email)) continue;

        // Skip if already this trainer's client
        if (myEmails.has(email)) continue;

        // Skip if already in results
        if (seen.has(user.id)) continue;
        const alreadyInResults = results.some(r => r.email?.toLowerCase() === email);
        if (alreadyInResults) continue;

        results.push({
          id: `auth_${user.id}`,
          authUserId: user.id,
          name: user.user_metadata?.name || email.split('@')[0],
          email: user.email,
          phone: user.phone || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          status: 'new',
          hasTrainer: false,
          // Pass assessment data so coach sees it immediately when linking
          assessment_data: user.user_metadata?.onboarding_complete ? {
            fitness_goals: user.user_metadata.fitness_goals || [],
            fitness_goal: user.user_metadata.fitness_goal || null,
            training_styles: user.user_metadata.training_styles || [],
            activities: user.user_metadata.activities || [],
            commit_days: user.user_metadata.commit_days || null,
            age: user.user_metadata.age || null,
            gender: user.user_metadata.gender || null,
            weight: user.user_metadata.weight || null,
            height: user.user_metadata.height || null,
          } : null,
        });
      }
    }

    return new Response(JSON.stringify({ data: results.slice(0, 10) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Error searching users:', error);
    return new Response(JSON.stringify({ error: error.message, data: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
