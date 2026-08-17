#!/usr/bin/env node
/**
 * FitLink invariant checks — the automated half of .agents/INVARIANTS.md.
 *
 * Every rule here exists because breaking it shipped a real bug. This is a
 * smoke alarm, not a proof: it catches the SHAPES that have caused incidents.
 * A clean run does not mean the code is correct; a dirty run means something
 * that has bitten us before is back.
 *
 *   node scripts/verify.js            # whole tree, exit 1 on any error
 *   node scripts/verify.js --staged   # only what is about to be committed
 *   node scripts/verify.js --warn     # report, always exit 0
 *
 * Suppress a knowingly-fine line with a trailing:  // invariant-ok: <reason>
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const DIRS = ['app', 'components', 'lib', 'hooks', 'context', 'utils'];
const WARN_ONLY = process.argv.includes('--warn');
const STAGED = process.argv.includes('--staged');

/** @type {{id:string,level:'error'|'warn',what:string,why:string,test:(line:string,file:string)=>boolean}[]} */
const RULES = [
  {
    id: 'brand-names',
    level: 'error',
    what: 'Third-party brand or public figure name',
    why: 'Shipping these in content risks App Store 4.1/5.2 and a trademark complaint. data/classes.ts was deleted for exactly this.',
    test: (l) => /\b(Equinox|SoulCycle|Precision Run|Headstrong|Peloton|Barry's Bootcamp)\b/.test(l),
  },
  {
    id: 'phantom-column',
    level: 'error',
    what: 'Phantom database column',
    why: 'These do not exist. Reads return undefined forever; writes fail 42703 and take the whole statement with them. Use lib/workoutCounts.ts / lib/clientGoals.ts.',
    test: (l) =>
      /\bcompleted_workouts\b/.test(l) ||
      /\.(goals)\b/.test(l) && /client(Data)?\./.test(l) ||
      /live_classes[^\n]*\b(category|duration_minutes)\b/.test(l),
  },
  {
    id: 'ios-only-api',
    level: 'error',
    what: 'iOS-only API with no Android path',
    why: 'Alert.prompt renders NOTHING on Android (it dead-ended coach account deletion, a Play policy violation).',
    test: (l) => /Alert\.prompt\s*\(/.test(l),
  },
  {
    id: 'safearea-core',
    level: 'error',
    what: "SafeAreaView imported from 'react-native'",
    why: 'It is an iOS-only no-op — headers sit under the Android status bar. Import from react-native-safe-area-context.',
    test: (l) => /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from\s*['"]react-native['"]/.test(l),
  },
  {
    id: 'kav-behavior',
    level: 'error',
    what: 'KeyboardAvoidingView behavior not branched by platform',
    why: "'padding'/'height' double-compensate on Android against adjustResize and push the composer off screen. Use Platform.OS === 'ios' ? 'padding' : undefined.",
    test: (l) => /behavior=\{?["']?(padding|height)["']?\}?/.test(l) && !/Platform\.OS/.test(l),
  },
  {
    id: 'swallowed-write',
    level: 'warn',
    what: 'try { directly wrapping an await supabase call',
    why: 'Supabase RESOLVES with { error } instead of throwing, so the catch is dead code and the failure is invisible. Check { error } explicitly.',
    test: (l) => /try\s*\{\s*(const\s+.*=\s*)?await\s+supabase/.test(l),
  },
  {
    id: 'fabricated-number',
    level: 'warn',
    what: 'Possible fabricated metric',
    why: 'Real data or omitted. Estimates presented as fact are an App Store 2.1 risk and have shipped here before.',
    test: (l) =>
      /calories\s*[:=]\s*[^;\n]*\*\s*6\b/.test(l) ||
      /Math\.floor\(Math\.random\(\)[^)]*\)\s*\+\s*\d+/.test(l) && /(viewer|count|score|rating)/i.test(l),
  },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/**
 * In --staged mode, read the INDEX rather than the working tree: that is what
 * is actually about to become a commit. Reading the file from disk would let a
 * fix you have not staged mask a problem you have, and would flag unstaged
 * work-in-progress that is none of this commit's business.
 */
function sources() {
  if (!STAGED) {
    return DIRS.flatMap((d) => walk(path.join(ROOT, d))).map((file) => ({
      file,
      text: fs.readFileSync(file, 'utf8'),
    }));
  }
  const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACM'])
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /\.(ts|tsx)$/.test(s) && DIRS.some((d) => s === d || s.startsWith(d + '/')));
  return names.map((name) => ({
    file: path.join(ROOT, name),
    text: git(['show', `:${name}`]),
  }));
}

const hits = [];

for (const { file, text } of sources()) {
  // The invariants doc and this script legitimately name the patterns.
  if (/scripts[\\/]verify\.js$/.test(file)) continue;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/invariant-ok:/.test(line)) return;
    // Comments legitimately NAME these patterns — most of them exist to warn
    // the next reader. Flagging documentation would train everyone to ignore
    // this script, so strip comments and test only executable code.
    const trimmed = line.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('{/*') // JSX comment
    ) return;
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (!code.trim()) return;
    for (const rule of RULES) {
      if (rule.test(code, file)) {
        hits.push({ rule, file: path.relative(ROOT, file), line: i + 1, text: trimmed.slice(0, 120) });
      }
    }
  });
}

const errors = hits.filter((h) => h.rule.level === 'error');
const warns = hits.filter((h) => h.rule.level === 'warn');

if (!hits.length) {
  console.log(`verify: clean — no known-bad patterns in ${STAGED ? 'the staged changes' : 'app/, components/, lib/, hooks/, context/, utils/'}.`);
  console.log('(A clean run is not a proof. See .agents/INVARIANTS.md for the rules a grep cannot check.)');
  process.exit(0);
}

const byRule = new Map();
for (const h of hits) {
  if (!byRule.has(h.rule.id)) byRule.set(h.rule.id, []);
  byRule.get(h.rule.id).push(h);
}

for (const [id, group] of byRule) {
  const rule = group[0].rule;
  console.log(`\n${rule.level === 'error' ? 'ERROR' : 'warn '}  [${id}] ${rule.what} — ${group.length} hit${group.length === 1 ? '' : 's'}`);
  console.log(`       ${rule.why}`);
  for (const h of group.slice(0, 12)) console.log(`       ${h.file}:${h.line}  ${h.text}`);
  if (group.length > 12) console.log(`       … and ${group.length - 12} more`);
}

console.log(`\nverify: ${errors.length} error(s), ${warns.length} warning(s).`);
console.log('Suppress a reviewed line with a trailing  // invariant-ok: <reason>');

process.exit(!WARN_ONLY && errors.length > 0 ? 1 : 0);
