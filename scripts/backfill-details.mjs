/**
 * Backfill description, difficulty, and secondary muscles from ExerciseDB RapidAPI.
 * Updates existing exercises in Supabase.
 * 
 * Run: node scripts/backfill-details.mjs <email> <password>
 * 
 * Prerequisites: Run this SQL in Supabase Dashboard first:
 *   ALTER TABLE exercises 
 *     ADD COLUMN IF NOT EXISTS description TEXT,
 *     ADD COLUMN IF NOT EXISTS difficulty TEXT,
 *     ADD COLUMN IF NOT EXISTS secondary_muscles TEXT[];
 */

const RAPIDAPI_KEY = 'ec2dd19261msh1d388f0d834e1e0p192a37jsn8c0eb628f4a0';
const RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com';
const SUPABASE_URL = 'https://qcmtaskhyhwzyoegtfpw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IxZ1QUlo0for6NcOQvf-xw_D0-vmrXL';

function capitalize(str) {
  if (!str) return '';
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function login() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('❌ Usage: node scripts/backfill-details.mjs <email> <password>');
    process.exit(1);
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) { console.error('❌ Login failed'); process.exit(1); }
  const auth = await res.json();
  console.log(`🔐 Logged in as ${auth.user.email}\n`);
  return { userId: auth.user.id, token: auth.access_token };
}

// Fetch all exercises from RapidAPI
async function fetchAllFromRapidAPI() {
  const exercises = [];
  let offset = 0;
  const limit = 10;
  let hasMore = true;
  let requestCount = 0;

  console.log('📋 Fetching exercise details from RapidAPI...\n');

  while (hasMore) {
    const res = await fetch(`https://${RAPIDAPI_HOST}/exercises?limit=${limit}&offset=${offset}`, {
      headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY },
    });
    requestCount++;

    if (res.status === 429) {
      console.log('\n⚠️  Rate limited! Waiting 2s...');
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) { console.error(`\n❌ API error: ${res.status}`); break; }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) { hasMore = false; break; }

    for (const e of data) {
      exercises.push({
        name: capitalize(e.name),
        description: e.description || null,
        difficulty: e.difficulty || null,
        secondary_muscles: e.secondaryMuscles || [],
      });
    }

    offset += data.length;
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    process.stdout.write(`\r  📥 ${exercises.length} exercises (${requestCount} requests, ${remaining} remaining)`);
    if (data.length < limit) hasMore = false;
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\n✅ ${exercises.length} exercises fetched\n`);
  return exercises;
}

// Get Supabase exercises
async function getSupabaseExercises(userId, token) {
  let all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/exercises?trainer_id=eq.${userId}&select=id,name&order=name&offset=${offset}&limit=1000`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }

  const nameToId = new Map();
  for (const ex of all) nameToId.set(ex.name.toLowerCase(), ex.id);
  console.log(`📦 Supabase: ${all.length} exercises\n`);
  return nameToId;
}

// Update exercises
async function updateExercises(rapidExercises, nameToId, token) {
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rapidExercises.length; i++) {
    const ex = rapidExercises[i];
    const supabaseId = nameToId.get(ex.name.toLowerCase());

    if (!supabaseId) { skipped++; continue; }

    const payload = {};
    if (ex.description) payload.description = ex.description;
    if (ex.difficulty) payload.difficulty = ex.difficulty;
    if (ex.secondary_muscles?.length > 0) payload.secondary_muscles = ex.secondary_muscles;

    if (Object.keys(payload).length === 0) { skipped++; continue; }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/exercises?id=eq.${supabaseId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) updated++;
    else failed++;

    process.stdout.write(`\r  ✅ ${updated} updated, ${skipped} skipped, ${failed} failed (${i+1}/${rapidExercises.length})`);
    if (i % 30 === 0) await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n\n🎉 Done! ${updated} exercises updated with descriptions & difficulty.\n`);
}

async function main() {
  const { userId, token } = await login();
  const rapidExercises = await fetchAllFromRapidAPI();
  const nameToId = await getSupabaseExercises(userId, token);
  await updateExercises(rapidExercises, nameToId, token);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
