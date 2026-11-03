// Rewrites the rule table in docs/rules.md from the rules' own metadata, so the table cannot drift.
// Usage: node scripts/gen-rules-table.mjs [--check]   (build first: npm run build)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rulesMetadata } from '../dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rulesPath = join(root, 'docs', 'rules.md');
const page = readFileSync(rulesPath, 'utf8');

const rows = rulesMetadata().map(
  (x) => `| \`${x.id}\` | ${x.kind} | ${x.severity} | ${x.title} | [docs](${x.docs}) |`,
);
const table = ['| Rule | Report | Severity | What it catches | Source |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');

const re = /<!-- rules:start -->\n[\s\S]*?\n<!-- rules:end -->/;
if (!re.test(page)) {
  console.error('docs/rules.md has no <!-- rules:start --> / <!-- rules:end --> markers');
  process.exit(2);
}
const next = page.replace(re, `<!-- rules:start -->\n${table}\n<!-- rules:end -->`);
if (process.argv.includes('--check')) {
  if (next !== page) {
    console.error('The rule table in docs/rules.md is stale. Run: npm run docs');
    process.exit(1);
  }
  process.exit(0);
}
writeFileSync(rulesPath, next);
console.log(`wrote ${rows.length} rules to docs/rules.md`);
