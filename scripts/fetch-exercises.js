// Script to download ALL ExerciseDB exercises respecting rate limits
// Run with: node scripts/fetch-exercises.js
// Uses cursor-based pagination with bodyParts filter
// Waits patiently when rate-limited, saves progress incrementally

const fs = require('fs');
const path = require('path');
const OUTPUT = path.join(__dirname, '..', 'assets', 'exercises.json');
const PROGRESS = OUTPUT + '.progress.json';

const BODY_PARTS = ['chest', 'back', 'upper legs', 'lower legs', 'upper arms', 'lower arms', 'shoulders', 'waist', 'cardio', 'neck'];
const DELAY_BETWEEN_REQUESTS = 2500;  // 2.5s between requests
const RATE_LIMIT_WAIT = 62000;        // Wait 62s on 429

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(bodyPart, cursor) {
  let url = `https://oss.exercisedb.dev/api/v1/exercises?bodyParts=${encodeURIComponent(bodyPart)}&limit=25`;
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
  
  const r = await fetch(url);
  if (r.status === 429) return { rateLimited: true };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  
  const d = await r.json();
  return {
    exercises: d.data || [],
    nextCursor: d.meta?.nextCursor || null,
    hasMore: d.meta?.hasNextPage ?? false,
    total: d.meta?.total || 0,
  };
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
  } catch {}
  return { completedParts: [], currentPart: null, currentCursor: null };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS, JSON.stringify(progress));
}

async function main() {
  // Load existing exercises
  let all = [];
  let seen = new Set();
  if (fs.existsSync(OUTPUT)) {
    all = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    all.forEach(e => seen.add(e.exerciseId));
  }
  
  const progress = loadProgress();
  console.log(`Starting with ${all.length} exercises, ${progress.completedParts.length} body parts done`);

  for (const bp of BODY_PARTS) {
    if (progress.completedParts.includes(bp)) {
      console.log(`  ✓ ${bp} - done`);
      continue;
    }

    console.log(`\n📥 ${bp}...`);
    let cursor = (progress.currentPart === bp) ? progress.currentCursor : null;
    let bpNew = 0;
    let retries = 0;

    while (true) {
      const result = await fetchPage(bp, cursor);
      
      if (result.rateLimited) {
        retries++;
        console.log(`  ⏳ Rate limited (attempt ${retries}). Saving ${all.length} exercises, waiting 62s...`);
        fs.writeFileSync(OUTPUT, JSON.stringify(all));
        progress.currentPart = bp;
        progress.currentCursor = cursor;
        saveProgress(progress);
        await sleep(RATE_LIMIT_WAIT);
        if (retries > 20) { console.log('Too many retries, exiting.'); process.exit(1); }
        continue;
      }

      retries = 0;
      for (const e of result.exercises) {
        if (!seen.has(e.exerciseId)) {
          seen.add(e.exerciseId);
          all.push(e);
          bpNew++;
        }
      }

      cursor = result.nextCursor;
      process.stdout.write(`  ${all.length} total (${bpNew} new)...\r`);
      
      if (!result.hasMore || result.exercises.length === 0) break;
      await sleep(DELAY_BETWEEN_REQUESTS);
    }

    console.log(`  ✅ ${bp}: +${bpNew} (total: ${all.length})`);
    progress.completedParts.push(bp);
    progress.currentPart = null;
    progress.currentCursor = null;
    
    fs.writeFileSync(OUTPUT, JSON.stringify(all));
    saveProgress(progress);
    await sleep(3000);
  }

  // Cleanup & stats
  if (fs.existsSync(PROGRESS)) fs.unlinkSync(PROGRESS);
  
  const bpCount = {};
  all.forEach(e => { const b = (e.bodyParts?.[0] || e.bodyPart || '?'); bpCount[b] = (bpCount[b] || 0) + 1; });
  console.log(`\n🎉 COMPLETE! ${all.length} exercises saved to assets/exercises.json`);
  console.log('Distribution:', JSON.stringify(bpCount, null, 2));
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
