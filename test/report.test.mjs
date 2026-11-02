import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyze, toMarkdown, toText, rulesMetadata } from '../dist/index.js';
import { fixture, root } from './helpers.mjs';

test('toMarkdown: verdict line, severity groups, fixes, no tables, no em dashes', () => {
  const r = analyze(fixture('all-rules.cfg'));
  const md = toMarkdown(r);
  const lines = md.split('\n');
  assert.match(lines[0], /klipper-doctor/);
  assert.match(lines[0], /\d+ errors?/);
  assert.ok(md.indexOf('Errors') < md.indexOf('Warnings'));
  assert.ok(md.indexOf('Warnings') < md.indexOf('Notes'));
  assert.match(md, /Fix:/);
  assert.ok(!lines.some((l) => /^\s*\|.*\|\s*$/.test(l)), 'no table rows');
  assert.ok(!/[—–]/.test(md));
});

test('toMarkdown on a clean log says nothing is wrong', () => {
  const md = toMarkdown(analyze(fixture('clean.log')));
  assert.match(md.split('\n')[0], /no errors/i);
});

test('toText: colour only when asked', () => {
  const r = analyze(fixture('timer-too-close.log'));
  assert.ok(!toText(r, { color: false }).includes('\u001b['));
  assert.ok(toText(r, { color: true }).includes('\u001b['));
  assert.match(toText(r, { color: false }), /Timer too close/);
});

test('rulesMetadata: unique ids, a docs link into klipper3d.org or the Klipper source on every rule', () => {
  const rules = rulesMetadata();
  assert.ok(rules.filter((x) => x.kind === 'config').length >= 8);
  assert.ok(rules.filter((x) => x.kind === 'crash').length >= 10);
  const seen = new Set();
  for (const x of rules) {
    const key = `${x.kind}:${x.id}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
    assert.match(x.docs, /^https:\/\/(www\.klipper3d\.org\/|github\.com\/Klipper3d\/klipper\/)/, key);
    assert.ok(['error', 'warning', 'note'].includes(x.severity));
  }
});

test('every finding links to docs', () => {
  for (const f of ['all-rules.cfg', 'timer-too-close.log', 'adc-out-of-range.log', 'unknown-reason.log', 'protocol-mismatch.log']) {
    const r = analyze(fixture(f));
    for (const x of [...r.config, ...r.crash]) {
      if (x.id === 'no-failure-found' || x.id === 'no-config-dump') continue;
      assert.match(x.docs ?? '', /^https:\/\//, `${f} ${x.id}`);
    }
  }
});

test('the core imports nothing from Node and touches no Node or browser globals', () => {
  const dir = join(root, 'dist', 'core');
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const file of walk(dir).filter((p) => p.endsWith('.js'))) {
    const src = readFileSync(file, 'utf8');
    assert.ok(!/from\s+['"]node:|require\(|from\s+['"](fs|path|os|child_process)['"]/.test(src), `${file} imports Node`);
    assert.ok(!/\bprocess\./.test(src), `${file} uses process`);
  }
});

test('README rule table matches the rule metadata (run `npm run docs` to refresh it)', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const m = readme.match(/<!-- rules:start -->\n([\s\S]*?)\n<!-- rules:end -->/);
  assert.ok(m, 'README is missing the rules markers');
  const rows = rulesMetadata().map((x) => `| \`${x.id}\` | ${x.kind} | ${x.severity} | ${x.title} | [docs](${x.docs}) |`);
  for (const row of rows) assert.ok(m[1].includes(row), `README table is stale: ${row}`);
});

test('VERSION matches package.json', async () => {
  const { VERSION } = await import('../dist/index.js');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(VERSION, pkg.version);
});

test('no copy in the repo uses an em dash or an en dash', () => {
  const files = ['README.md', ...readdirSync(join(root, 'src', 'core', 'rules', 'crash')).map((f) => `src/core/rules/crash/${f}`), ...readdirSync(join(root, 'src', 'core', 'rules', 'config')).map((f) => `src/core/rules/config/${f}`)];
  for (const f of files) assert.ok(!/[—–]/.test(readFileSync(join(root, f), 'utf8')), f);
});
