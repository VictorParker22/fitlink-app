/**
 * Seed script: Downloads ALL exercises from ExerciseDB (RapidAPI) 
 * and inserts them into Supabase.
 * 
 * Run once: node scripts/seed-exercises.mjs
 * 
 * Uses ~140 API requests (10 exercises per request, ~1400 total exercises)
 */

const RAPIDAPI_KEY = 'ec2dd19261msh1d388f0d834e1e0p192a37jsn8c0eb628f4a0';
const RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com';
const SUPABASE_URL = 'https://qcmtaskhyhwzyoegtfpw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IxZ1QUlo0for6NcOQvf-xw_D0-vmrXL';

// --- Helpers ---

function capitalize(str) {
  if (!str) return '';
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function mapBodyPartToCategory(bodyPart) {
  const map = {
    'back': 'back', 'cardio': 'cardio', 'chest': 'chest',
    'lower arms': 'arms', 'lower legs': 'legs', 'neck': 'shoulders',
    'shoulders': 'shoulders', 'upper arms': 'arms', 'upper legs': 'legs', 'waist': 'core',
  };
  return map[bodyPart?.toLowerCase()] || 'full_body';
}

function mapEquipment(equipment) {
  const map = {
    'body weight': 'bodyweight', 'barbell': 'barbell', 'dumbbell': 'dumbbell',
    'cable': 'cable', 'kettlebell': 'kettlebell', 'band': 'bands',
    'resistance band': 'bands', 'leverage machine': 'machine', 'smith machine': 'machine',
    'ez barbell': 'barbell', 'olympic barbell': 'barbell', 'trap bar': 'barbell',
    'assisted': 'machine', 'medicine ball': 'other', 'stability ball': 'other',
    'bosu ball': 'other', 'roller': 'other', 'rope': 'cable',
    'skierg machine': 'machine', 'elliptical machine': 'machine',
    'stationary bike': 'machine', 'stepmill machine': 'machine',
    'upper body ergometer': 'machine', 'wheel roller': 'other',
    'hammer': 'dumbbell', 'tire': 'other', 'sled machine': 'machine',
  };
  const key = equipment?.toLowerCase()?.trim();
  if (!key) return 'bodyweight';
  if (map[key]) return map[key];
  if (key.includes('machine')) return 'machine';
  if (key.includes('barbell')) return 'barbell';
  if (key.includes('dumbbell')) return 'dumbbell';
  if (key.includes('cable')) return 'cable';
  if (key.includes('band')) return 'bands';
  if (key.includes('kettle')) return 'kettlebell';
  return 'other';
}

function buildInstructionsHtml(instructions) {
  if (!instructions || instructions.length === 0) return '';
  const steps = instructions.map(step => {
    const cleaned = step.replace(/^Step:\d+\s*/i, '');
    return `<li>${cleaned}</li>`;
  }).join('');
  return `<ol>${steps}</ol>`;
}

// --- Step 1: Fetch all exercises from RapidAPI ---

async function fetchAllExercises() {
  const allExercises = [];
  let offset = 0;
  const limit = 10;
  let hasMore = true;
  let requestCount = 0;

  console.log('🏋️ Fetching exercises from ExerciseDB RapidAPI...\n');

  while (hasMore) {
    const url = `https://${RAPIDAPI_HOST}/exercises?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY,
      },
    });

    requestCount++;

    if (res.status === 429) {
      console.log('⚠️  Rate limited! Waiting 2 seconds...');
      await new Promise(r => setTimeout(r, 2000));
      continue; // retry same offset
    }

    if (!res.ok) {
      console.error(`❌ API error: ${res.status} at offset ${offset}`);
      break;
    }

    const data = await res.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
      break;
    }

    allExercises.push(...data);
    offset += data.length;
    
    // Log progress
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    process.stdout.write(`\r  📥 Fetched ${allExercises.length} exercises (${requestCount} requests, ${remaining} remaining)`);

    if (data.length < limit) {
      hasMore = false; // last page
    }

    // Small delay to be polite to the API
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\n✅ Downloaded ${allExercises.length} exercises in ${requestCount} requests\n`);
  return allExercises;
}

// --- Step 2: Get the trainer's user ID ---

async function getTrainerId() {
  // We need to be authenticated. Let's prompt for email/password.
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('❌ Usage: node scripts/seed-exercises.mjs <email> <password>');
    process.exit(1);
  }

  // Sign in via Supabase REST API
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error('❌ Login failed:', err.error_description || err.msg || JSON.stringify(err));
    process.exit(1);
  }

  const auth = await res.json();
  console.log(`🔐 Logged in as ${auth.user.email}\n`);
  return { userId: auth.user.id, accessToken: auth.access_token };
}

// --- Step 3: Insert into Supabase ---

async function insertExercises(exercises, userId, accessToken) {
  console.log(`📦 Preparing ${exercises.length} exercises for Supabase...\n`);

  // Transform to Supabase schema
  const rows = exercises.map(ex => ({
    trainer_id: userId,
    name: capitalize(ex.name),
    category: mapBodyPartToCategory(ex.bodyPart),
    muscle_group: capitalize(ex.target || 'Full Body'),
    equipment: mapEquipment(ex.equipment),
    instructions: buildInstructionsHtml(ex.instructions || []),
    is_custom: false,
    image_url: null, // RapidAPI doesn't include GIF URLs on free tier
  }));

  // Deduplicate by name (case-insensitive)
  const seen = new Set();
  const unique = rows.filter(r => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`  📊 ${unique.length} unique exercises (removed ${rows.length - unique.length} duplicates)\n`);

  // First, fetch existing exercise names for this trainer to avoid duplicates
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/exercises?trainer_id=eq.${userId}&select=name`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );
  const existingExercises = await existingRes.json();
  const existingNames = new Set(existingExercises.map(e => e.name.toLowerCase()));
  
  const toInsert = unique.filter(r => !existingNames.has(r.name.toLowerCase()));
  console.log(`  ⏭️  Skipping ${unique.length - toInsert.length} exercises that already exist`);
  console.log(`  ➕ Inserting ${toInsert.length} new exercises\n`);

  if (toInsert.length === 0) {
    console.log('✅ Nothing to insert — all exercises already exist!');
    return;
  }

  // Insert in batches of 50
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/exercises`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ Insert batch ${i}-${i + batch.length} failed:`, err);
      continue;
    }

    inserted += batch.length;
    process.stdout.write(`\r  ✅ Inserted ${inserted}/${toInsert.length}`);
  }

  console.log(`\n\n🎉 Done! ${inserted} exercises seeded into Supabase.\n`);
}

// --- Main ---

async function main() {
  const { userId, accessToken } = await getTrainerId();
  const exercises = await fetchAllExercises();
  await insertExercises(exercises, userId, accessToken);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
