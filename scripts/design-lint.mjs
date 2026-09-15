#!/usr/bin/env node
// Design-system guardrail. Counts legacy BentoPDF styling and raw design
// values outside the token file, and fails if any count rises above the
// recorded baseline. Counts may only go down.
//
//   node scripts/design-lint.mjs            check against baseline
//   node scripts/design-lint.mjs --update   lower the baseline to current counts
//   node scripts/design-lint.mjs --report   per-file breakdown
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
} from 'fs';
import { join, relative, resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const baselinePath = join(root, 'scripts/design-lint-baseline.json');

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, exts, out);
    else if (exts.some((ext) => name.endsWith(ext))) out.push(path);
  }
  return out;
}

const tokenFiles = new Set([
  'src/design-system/tokens.css',
  'src/design-system/tokens.ts',
]);
const isTest = (file) =>
  /\.test\.ts$/.test(file) || file.startsWith('src/tests/');

const rules = {
  // Tailwind colour utilities from BentoPDF's palette.
  legacyClasses: {
    files: () => [
      ...walk(join(root, 'src/pages'), ['.html']),
      ...walk(join(root, 'src/partials'), ['.html']),
      ...walk(join(root, 'src/js'), ['.ts']),
    ],
    pattern:
      /\b(?:hover:|focus:|group-hover:|disabled:)?(?:bg|text|border|ring|from|to|via|divide|placeholder)-(?:gray|slate|zinc|indigo|blue|purple|violet)-\d{2,3}(?:\/\d+)?\b/g,
  },
  // Raw colours in stylesheets outside the token file.
  cssColorLiterals: {
    files: () => walk(join(root, 'src/css'), ['.css']),
    pattern: /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g,
  },
  // Text below the 12px floor.
  tinyFontSizes: {
    files: () => [
      ...walk(join(root, 'src/css'), ['.css']),
      ...walk(join(root, 'src/design-system'), ['.css']),
    ],
    pattern: /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/g,
  },
  // Product-name leaks in shipped code (licensing and attribution excluded).
  brandLeaks: {
    files: () => [
      ...walk(join(root, 'src/js'), ['.ts']),
      ...walk(join(root, 'src/partials'), ['.html']),
    ],
    pattern: /BentoPDF(?! \(AGPL| · AGPL)/g,
  },
};

const counts = {};
const byFile = {};
for (const [name, rule] of Object.entries(rules)) {
  counts[name] = 0;
  for (const path of rule.files()) {
    const file = relative(root, path);
    if (tokenFiles.has(file) || isTest(file)) continue;
    const text = readFileSync(path, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
    const n = text.match(rule.pattern)?.length ?? 0;
    if (!n) continue;
    counts[name] += n;
    (byFile[name] ??= {})[file] = n;
  }
}

const args = new Set(process.argv.slice(2));
if (args.has('--report')) {
  for (const [name, files] of Object.entries(byFile)) {
    console.log(`\n${name} (${counts[name]})`);
    for (const [file, n] of Object.entries(files).sort((a, b) => b[1] - a[1]))
      console.log(`  ${String(n).padStart(5)}  ${file}`);
  }
}

const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : null;
if (!baseline || args.has('--update')) {
  const next = baseline
    ? Object.fromEntries(
        Object.entries(counts).map(([k, v]) => [
          k,
          Math.min(v, baseline[k] ?? v),
        ])
      )
    : counts;
  writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
  console.log('Design lint baseline written:', next);
  process.exit(0);
}

let failed = false;
for (const [name, value] of Object.entries(counts)) {
  const limit = baseline[name] ?? 0;
  const status = value > limit ? 'FAIL' : value < limit ? 'down' : 'ok';
  if (value > limit) failed = true;
  console.log(`${status.padEnd(4)}  ${name}: ${value} (baseline ${limit})`);
}
if (failed) {
  console.error(
    '\nDesign lint failed: new legacy styling or raw values were added. Use --report to locate them and use design-system tokens/components instead.'
  );
  process.exit(1);
}
