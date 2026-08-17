#!/usr/bin/env node
/**
 * Staged-content secret scan.
 *
 * This is the one pre-commit check that guards something genuinely
 * irreversible. A type error is a nuisance; a pushed credential is public
 * forever — rewriting history does not recall the clones, the forks, or the
 * scrapers. This repo has already learned that twice: a Spotify client secret
 * that survives in git history despite the code being migrated to PKCE, and a
 * GitHub PAT embedded in the remote URL.
 *
 *   node scripts/scan-secrets.js            # staged content (pre-commit)
 *   node scripts/scan-secrets.js --all      # every tracked file
 *
 * Patterns are deliberately narrow. A scanner that cries wolf gets bypassed
 * with --no-verify, and then it protects nothing.
 *
 * Suppress a reviewed line with a trailing:  // secret-ok: <reason>
 */
const { execFileSync } = require('child_process');

const ALL = process.argv.includes('--all');
const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Files that must never be committed at all, regardless of content. */
const FORBIDDEN_PATHS = [
  { re: /(^|\/)google-services\.json$/, why: 'Firebase config for the Android build — gitignored on purpose.' },
  { re: /(^|\/)GoogleService-Info\.plist$/, why: 'Firebase config for the iOS build — gitignored on purpose.' },
  { re: /(^|\/)\.env(\.|$)/, why: 'Environment files hold live keys. Use EAS secrets or Supabase secrets instead.' },
  { re: /\.(p8|p12|keystore|jks|mobileprovision)$/, why: 'Signing material. Store it in EAS credentials, never in the repo.' },
];

const PATTERNS = [
  { id: 'private-key', why: 'PEM private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'stripe-live', why: 'Stripe live secret/restricted key', re: /\b(sk|rk)_live_[A-Za-z0-9]{16,}/ },
  { id: 'stripe-test', why: 'Stripe test secret key (still a secret — it moves test money and reveals the account)', re: /\bsk_test_[A-Za-z0-9]{16,}/ },
  { id: 'github-token', why: 'GitHub token', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { id: 'aws-key', why: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'google-api-key', why: 'Google/Firebase API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'openai-key', why: 'OpenAI-style API key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { id: 'anthropic-key', why: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  {
    id: 'supabase-service-role',
    why: 'Supabase SERVICE ROLE key — it bypasses every RLS policy in the project',
    re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*?(service_role|c2VydmljZV9yb2xl)[A-Za-z0-9_-]*\./,
  },
  {
    id: 'remote-with-token',
    why: 'Credential embedded in a URL (https://user:token@host)',
    re: /https:\/\/[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]{16,}@/,
  },
  {
    // Assignment of a literal to a secret-shaped name. Ignores env lookups,
    // interpolation, and obvious placeholders — those are the correct patterns.
    id: 'hardcoded-secret',
    why: 'Secret-shaped name assigned a literal value',
    re: /\b(client_secret|clientSecret|api_?key|apiKey|secret_key|secretKey|password|access_token|auth_token)\b\s*[:=]\s*['"`][A-Za-z0-9_\-+/=]{16,}['"`]/i,
    skip: (line) =>
      /process\.env|Deno\.env|EXPO_PUBLIC_|Constants\.|expoConfig|\$\{/.test(line) ||
      /your[-_]?|example|placeholder|xxxx|<[a-z_]+>|changeme|dummy|test123/i.test(line),
  },
];

const BINARY = /\.(png|jpg|jpeg|gif|webp|ico|ttf|otf|woff2?|mp3|mp4|mov|pdf|zip|jar|so|dylib|aab|apk|keystore|jks|p8|p12)$/i;

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACM'])
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
const files = ALL ? git(['ls-files']).split('\n').map((s) => s.trim()).filter(Boolean) : staged;

const hits = [];

for (const file of files) {
  for (const f of FORBIDDEN_PATHS) {
    if (f.re.test(file)) hits.push({ file, line: 0, id: 'forbidden-file', why: f.why, text: file });
  }
  if (BINARY.test(file)) continue;

  let text;
  try {
    text = ALL ? require('fs').readFileSync(file, 'utf8') : git(['show', `:${file}`]);
  } catch {
    continue; // deleted, submodule, or unreadable
  }
  if (text.includes('\0')) continue; // binary without a telling extension

  text.split('\n').forEach((line, i) => {
    if (line.includes('secret-ok:')) return;
    if (line.length > 2000) return; // minified/bundled output, not hand-written
    for (const p of PATTERNS) {
      if (p.skip && p.skip(line)) continue;
      const m = line.match(p.re);
      if (m) {
        // Never print the secret itself — this output lands in terminals,
        // scrollback, and CI logs.
        hits.push({
          file,
          line: i + 1,
          id: p.id,
          why: p.why,
          text: `${m[0].slice(0, 6)}…${m[0].length} chars redacted`,
        });
      }
    }
  });
}

if (!hits.length) {
  console.log(`secrets: clean — ${files.length} file(s) scanned.`);
  process.exit(0);
}

console.log('\nPOSSIBLE SECRET IN A COMMIT — stopping.\n');
for (const h of hits) {
  console.log(`  ${h.file}${h.line ? ':' + h.line : ''}  [${h.id}] ${h.why}`);
  console.log(`      ${h.text}`);
}
console.log(`
${hits.length} finding(s). If any is real, do NOT commit and then remove it in a
follow-up — the value is in the object store from the moment it is committed and
is public from the moment it is pushed. Rotate the credential at its source.

If a finding is a false positive, append  // secret-ok: <reason>  to the line.
`);
process.exit(1);
