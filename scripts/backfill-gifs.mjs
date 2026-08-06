/**
 * Download exercise GIFs from ExerciseDB RapidAPI (paid plan)
 * and upload them to Supabase Storage, then update exercise records.
 * 
 * Run: node scripts/backfill-gifs.mjs <email> <password>
 * 
 * This script:
 * 1. Fetches all exercise IDs from RapidAPI
 * 2. Downloads each GIF at 360p resolution
 * 3. Uploads to Supabase Storage (exercise-gifs bucket)
 * 4. Updates the exercise record with the public URL
 */

const RAPIDAPI_KEY = 'ec2dd19261msh1d388f0d834e1e0p192a37jsn8c0eb628f4a0';
const RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com';
const SUPABASE_URL = 'https://qcmtaskhyhwzyoegtfpw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IxZ1QUlo0for6NcOQvf-xw_D0-vmrXL';
const GIF_RESOLUTION = 360;
const BUCKET = 'exercise-gifs';

function capitalize(str) {
  if (!str) return '';
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// --- Auth ---
async function login() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('❌ Usage: node scripts/backfill-gifs.mjs <email> <password>');
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

// --- Ensure storage bucket exists ---
async function ensureBucket(token) {
  // Try to create the bucket (will fail silently if exists)
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  console.log(`📁 Storage bucket "${BUCKET}" ready\n`);
}

// --- Step 1: Fetch all exercises from RapidAPI to get IDs ---
async function fetchExerciseList() {
  const exercises = []; // { id, name }
  let offset = 0;
  const limit = 10;
  let hasMore = true;
  let requestCount = 0;

  console.log('📋 Fetching exercise list from RapidAPI...\n');

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

    exercises.push(...data.map(e => ({ id: e.id, name: capitalize(e.name) })));
    offset += data.length;
    process.stdout.write(`\r  📥 ${exercises.length} exercises listed (${requestCount} requests)`);
    if (data.length < limit) hasMore = false;
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\n✅ ${exercises.length} exercises found\n`);
  return exercises;
}

// --- Step 2: Get Supabase exercises to know which need GIFs ---
async function getSupabaseExercises(userId, token) {
  let all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/exercises?trainer_id=eq.${userId}&select=id,name,image_url&order=name&offset=${offset}&limit=1000`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  
  const nameToId = new Map();
  const needsGif = new Set();
  for (const ex of all) {
    nameToId.set(ex.name.toLowerCase(), ex.id);
    if (!ex.image_url) needsGif.add(ex.name.toLowerCase());
  }
  
  console.log(`📦 Supabase: ${all.length} exercises, ${needsGif.size} need GIFs\n`);
  return { nameToId, needsGif };
}

// --- Step 3: Download GIF, upload to storage, update record ---
async function processExercise(rapidId, name, supabaseId, token) {
  const fileName = `${rapidId}.gif`;

  // Download GIF from RapidAPI
  const gifRes = await fetch(
    `https://${RAPIDAPI_HOST}/image?exerciseId=${rapidId}&resolution=${GIF_RESOLUTION}`,
    { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY } }
  );
  
  if (!gifRes.ok || gifRes.headers.get('content-type') !== 'image/gif') {
    return { success: false, reason: `GIF download failed: ${gifRes.status}` };
  }

  const gifBuffer = await gifRes.arrayBuffer();
  if (gifBuffer.byteLength < 100) {
    return { success: false, reason: 'Empty GIF' };
  }

  // Upload to Supabase Storage
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'image/gif',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'x-upsert': 'true',
      },
      body: gifBuffer,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return { success: false, reason: `Upload failed: ${err.substring(0, 100)}` };
  }

  // Get public URL
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;

  // Update exercise record
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/exercises?id=eq.${supabaseId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ image_url: publicUrl }),
    }
  );

  if (!updateRes.ok) {
    return { success: false, reason: 'DB update failed' };
  }

  return { success: true, size: gifBuffer.byteLength };
}

// --- Main ---
async function main() {
  const { userId, token } = await login();
  await ensureBucket(token);

  const rapidExercises = await fetchExerciseList();
  const { nameToId, needsGif } = await getSupabaseExercises(userId, token);

  // Match RapidAPI exercises to Supabase exercises that need GIFs
  const toProcess = [];
  for (const rapid of rapidExercises) {
    const key = rapid.name.toLowerCase();
    if (needsGif.has(key) && nameToId.has(key)) {
      toProcess.push({ rapidId: rapid.id, name: rapid.name, supabaseId: nameToId.get(key) });
    }
  }

  console.log(`🔗 ${toProcess.length} exercises to download GIFs for\n`);

  if (toProcess.length === 0) {
    console.log('✅ All exercises already have GIFs!');
    return;
  }

  let success = 0;
  let failed = 0;
  let totalBytes = 0;
  const errors = [];

  for (let i = 0; i < toProcess.length; i++) {
    const { rapidId, name, supabaseId } = toProcess[i];

    try {
      const result = await processExercise(rapidId, name, supabaseId, token);
      if (result.success) {
        success++;
        totalBytes += result.size;
      } else {
        failed++;
        if (errors.length < 10) errors.push(`${name}: ${result.reason}`);
      }
    } catch (err) {
      failed++;
      if (errors.length < 10) errors.push(`${name}: ${err.message}`);
    }

    process.stdout.write(`\r  🖼️  ${success} uploaded, ${failed} failed, ${Math.round(totalBytes/1024/1024)}MB total (${i+1}/${toProcess.length})`);

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\n');
  if (errors.length > 0) {
    console.log('⚠️  Errors:');
    errors.forEach(e => console.log('  -', e));
    console.log('');
  }

  console.log(`🎉 Done! ${success} GIFs uploaded (${Math.round(totalBytes/1024/1024)}MB)`);
  console.log(`📊 Coverage: ${success}/${toProcess.length} exercises\n`);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
