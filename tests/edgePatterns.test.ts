/**
 * Patterns in the edge functions that a grep can catch and that shipped a
 * real outage. Each rule names the day it earned its place.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', 'supabase', 'functions');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('edge function patterns', () => {
  const files = tsFiles(ROOT);

  it('finds the functions', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never verifies a Stripe signature synchronously (2026-09-08: every live webhook was rejected with a 400)', () => {
    const offenders = files.filter((f) => /webhooks\.constructEvent\(/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.replace(ROOT, ''))).toEqual([]);
  });

  it('keeps the enrolment writers in the shared module, used by both the webhook and confirm-subscription', () => {
    const webhook = readFileSync(join(ROOT, 'stripe-webhook', 'index.ts'), 'utf8');
    const confirm = readFileSync(join(ROOT, 'confirm-subscription', 'index.ts'), 'utf8');
    const shared = readFileSync(join(ROOT, '_shared', 'enrollment.ts'), 'utf8');
    expect(webhook).toMatch(/from '\.\.\/_shared\/enrollment\.ts'/);
    expect(confirm).toMatch(/from '\.\.\/_shared\/enrollment\.ts'/);
    expect(webhook).not.toMatch(/async function attachClientToPlan/);
    expect(shared).toMatch(/export async function attachClientToPlan/);
    expect(shared).toMatch(/export async function ensurePlanEnrollment/);
    expect(shared).toMatch(/export async function activateStripeSubscription/);
  });
});
