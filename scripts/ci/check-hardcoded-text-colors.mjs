#!/usr/bin/env node
/**
 * Fails CI when athlete-facing code hardcodes text colors instead of semantic
 * accent/onAccent pairs (text-white, text-black, arbitrary hex/rgb/oklch text
 * utilities, or inline style color literals).
 *
 * Token source of truth: packages/ui/src/styles/globals.css
 * Allowlist only where a third-party paint API rejects CSS variables.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;

const SCAN_ROOTS = ['apps/web', 'apps/hub', 'apps/api', 'packages/ui', 'packages/app'];

const IGNORE_DIR = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo', 'public']);

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.mjs']);

/** Paths relative to repo root that may keep a justified literal. */
const ALLOWLIST = [
  // Design token file — the only place literal text colors belong.
  'packages/ui/src/styles/globals.css',
  // MapLibre paint props reject CSS variables; cluster label ink stays #fff.
  'apps/web/src/components/ui/map/map.tsx',
  // Brand icon SVG canvas literals (not UI text).
  'packages/app/src/lib/brand/brand-icon.ts',
  // Hex sport map paints — backgrounds/strokes, asserted against --sport-* in tests.
  'packages/app/src/lib/activity/sport-identity.ts',
];

function isTestFile(rel) {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(rel);
}

const PATTERNS = [
  {
    id: 'text-white',
    re: /\btext-white\b/,
  },
  {
    id: 'text-black',
    re: /\btext-black\b/,
  },
  {
    id: 'arbitrary-text-hex',
    re: /\btext-\[#[0-9a-fA-F]{3,8}\]/,
  },
  {
    id: 'arbitrary-text-rgb',
    re: /\btext-\[rgba?\(/,
  },
  {
    id: 'arbitrary-text-oklch',
    re: /\btext-\[oklch\(/,
  },
  {
    id: 'inline-style-color',
    // style={{ color: '#fff' }} / color: "rgb(...)" / color: 'oklch(...)'
    re: /\b(?:style=\{\{[^}]*\bcolor\s*:\s*['"]?(?:#|rgb|oklch)|(?<![\w-])color:\s*(?:#|rgb|oklch))/,
  },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (IGNORE_DIR.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else {
      const ext = name.slice(name.lastIndexOf('.'));
      if (EXTENSIONS.has(ext)) out.push(full);
    }
  }
  return out;
}

function isAllowlisted(rel) {
  return ALLOWLIST.some((entry) => rel === entry || rel.endsWith(`/${entry}`));
}

const violations = [];

for (const root of SCAN_ROOTS) {
  const absRoot = join(ROOT, root);
  for (const file of walk(absRoot)) {
    const rel = relative(ROOT, file);
    if (isAllowlisted(rel) || isTestFile(rel)) continue;
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment-only lines (block or line comments without code).
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
      for (const { id, re } of PATTERNS) {
        if (re.test(line)) {
          violations.push({ rel, line: i + 1, id, text: line.trim().slice(0, 160) });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Hardcoded text colors found (use semantic *-foreground / on-sport tokens):\n');
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}  [${v.id}]  ${v.text}`);
  }
  console.error(
    `\n${violations.length} violation(s). Prefer text-primary-foreground, text-destructive-foreground, text-on-sport-*, etc.`,
  );
  process.exit(1);
}

console.log('check-hardcoded-text-colors: ok');
