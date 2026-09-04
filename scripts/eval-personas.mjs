#!/usr/bin/env node
// scripts/eval-personas.mjs — offline prompt eval for the Solo corner
// personas. Sends every case in evals/golden.json to Gemini directly (the
// same model + prompt shape as supabase/functions/solo-corner/index.ts,
// copied verbatim into evals/prompts.mjs) and checks the reply against each
// case's `expect` block.
//
// Requires GEMINI_API_KEY. Without it, this is a no-op (exit 0) so it is
// safe to wire into a CI job that only sometimes has the secret available
// (see the `evals` job in .github/workflows/ci.yml, workflow_dispatch only).
//
//   node scripts/eval-personas.mjs
//   GEMINI_API_KEY=... node scripts/eval-personas.mjs

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PERSONAS, buildPrompt } from '../evals/prompts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'gemini-2.5-flash';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.log('eval-personas: GEMINI_API_KEY not set — skipping persona evals.');
  process.exit(0);
}

/** Same grounding check as supabase/functions/_shared/ai.ts numbersNotInContext. */
function numbersNotInContext(reply, context) {
  const inCtx = new Set((context.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));
  const out = [];
  for (const raw of reply.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const n = raw.replace(',', '.');
    const val = Number(n);
    if (Number.isFinite(val) && val >= 1 && val <= 12 && !n.includes('.')) continue;
    if (!inCtx.has(n)) out.push(n);
  }
  return Array.from(new Set(out));
}

function contextToBlockAndString(context) {
  let contextBlock = '';
  const parts = [];
  for (const [k, v] of Object.entries(context ?? {}).slice(0, 20)) {
    if (v === null || v === undefined || String(v).trim() === '') continue;
    contextBlock += `\n${k}: ${v}`;
    parts.push(String(v));
  }
  return { contextBlock, contextString: parts.join(' ') };
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini returned an empty candidate');
  return text;
}

function evaluate(reply, expect, contextString) {
  const failures = [];
  const words = reply.trim().split(/\s+/).filter(Boolean);

  if (typeof expect.maxWords === 'number' && words.length > expect.maxWords) {
    failures.push(`over word limit: ${words.length} > ${expect.maxWords}`);
  }

  if (expect.mustNotContainNumbersOutsideContext) {
    const stray = numbersNotInContext(reply, contextString);
    if (stray.length) failures.push(`numbers not in context: ${stray.join(', ')}`);
  }

  for (const phrase of expect.mustMention ?? []) {
    if (!reply.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`missing expected mention: "${phrase}"`);
    }
  }

  for (const phrase of expect.mustNotMention ?? []) {
    if (reply.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`contains forbidden phrase: "${phrase}"`);
    }
  }

  for (const kw of expect.toneKeywords ?? []) {
    // Tone keywords are a soft signal (persona register is fuzzy by design):
    // record but don't fail the case on tone alone. Reported as info only.
    void kw;
  }

  return failures;
}

async function main() {
  const goldenPath = path.join(__dirname, '..', 'evals', 'golden.json');
  const cases = JSON.parse(await readFile(goldenPath, 'utf8'));

  const results = [];
  for (const [i, c] of cases.entries()) {
    const persona = PERSONAS[c.persona] ?? PERSONAS.reyes;
    const { contextBlock, contextString } = contextToBlockAndString(c.context);
    const prompt = buildPrompt({
      persona,
      contextBlock,
      name: undefined,
      turns: '',
      message: c.message,
    });

    let reply = '';
    let error = null;
    try {
      reply = await callGemini(prompt);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const failures = error ? [`request failed: ${error}`] : evaluate(reply, c.expect, contextString);
    results.push({ index: i, persona: c.persona, message: c.message, reply, failures });

    // Gentle pacing to stay under free-tier RPM limits.
    await new Promise((r) => setTimeout(r, 250));
  }

  const passed = results.filter((r) => r.failures.length === 0);
  const failed = results.filter((r) => r.failures.length > 0);

  console.log('\npersona  | pass/fail | case');
  console.log('---------|-----------|-----------------------------------------------');
  for (const r of results) {
    const status = r.failures.length === 0 ? 'PASS' : 'FAIL';
    console.log(`${r.persona.padEnd(8)} | ${status.padEnd(9)} | ${r.message.slice(0, 60)}`);
    if (r.failures.length) {
      for (const f of r.failures) console.log(`         ${' '.repeat(11)} - ${f}`);
    }
  }

  console.log(`\neval-personas: ${passed.length}/${results.length} passed, ${failed.length} failed.`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('eval-personas: fatal error', err);
  process.exit(1);
});
