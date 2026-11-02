// Lints every sample config in a Klipper checkout. They are all valid or meant for [include], so an
// error here is a false positive in a rule. Not part of npm test: Klipper's configs are GPL, so they
// are not vendored here, and CI does not clone them.
//
//   node scripts/check-samples.mjs ~/klipper
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../dist/index.js';

const checkout = process.argv[2];
if (!checkout) {
  console.error('usage: node scripts/check-samples.mjs <path to a Klipper checkout>');
  process.exit(2);
}
const dir = join(checkout, 'config');
const files = readdirSync(dir).filter((f) => f.endsWith('.cfg')).sort();
const counts = {};
let errors = 0;
for (const f of files) {
  for (const x of analyze(readFileSync(join(dir, f), 'utf8'), { filename: f }).config) {
    counts[`${x.severity} ${x.id}`] = (counts[`${x.severity} ${x.id}`] ?? 0) + 1;
    if (x.severity === 'note') continue;
    if (x.severity === 'error') errors++;
    console.log(`${f}: ${x.severity} ${x.id}: ${x.title}`);
  }
}
console.log(`\n${files.length} files, ${errors} false errors`, counts);
process.exitCode = errors > 0 ? 1 : 0;
