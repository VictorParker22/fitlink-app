#!/usr/bin/env node
// scripts/eval-program.mjs — model-backed eval for the Solo program builder.
//
// The builder's structure is pure code (supabase/functions/solo-program/
// plan.ts, unit-tested in tests/soloProgramPlan.test.ts). This exercises the
// one part that needs the model: choosing between the options for each slot
// and writing the cues. It runs tests/evals/programModel.test.ts under jest
// with RUN_MODEL_EVALS=1; that file sends four real intakes to Gemini with
// the same prompt and response schema the edge function uses and asserts
// on what came back.
//
// Requires GEMINI_API_KEY. Without it, this is a no-op (exit 0).
//
//   node scripts/eval-program.mjs
//   GEMINI_API_KEY=... node scripts/eval-program.mjs

import { spawnSync } from 'node:child_process';

if (!process.env.GEMINI_API_KEY) {
  console.log('eval-program: GEMINI_API_KEY not set — skipping program evals.');
  process.exit(0);
}

const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['jest', 'tests/evals/programModel.test.ts', '--ci'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_MODEL_EVALS: '1' },
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
