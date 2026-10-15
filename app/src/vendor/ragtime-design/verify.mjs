#!/usr/bin/env node
// Verifies vendored ragtime-design files are unedited. Copied into dist/ by the build, and
// vendored beside the token files in each consumer. With no arguments it checks every
// family.* file in its own directory. Exit 1 on any mismatch, so it can sit in a gate.
//
//   node vendor/ragtime-design/verify.mjs

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const targets = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(here).filter((f) => f.startsWith('family.')).map((f) => join(here, f));

let bad = 0;
for (const file of targets) {
  const text = readFileSync(file, 'utf8');
  const nl = text.indexOf('\n');
  const head = text.slice(0, nl);
  const m = head.match(/ragtime-design v(\S+) sha256:([0-9a-f]{64})/);
  if (!m) {
    console.error(`${file}: no ragtime-design header`);
    bad++;
    continue;
  }
  const actual = createHash('sha256').update(text.slice(nl + 1)).digest('hex');
  if (actual !== m[2]) {
    console.error(`${file}: edited by hand (v${m[1]}). Re-vendor from ragtime-design instead.`);
    bad++;
  } else {
    console.log(`${file}: ragtime-design v${m[1]} ok`);
  }
}
process.exit(bad ? 1 : 0);
