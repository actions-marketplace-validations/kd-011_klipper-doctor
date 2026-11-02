import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../dist/index.js';
import { root, fixture } from './helpers.mjs';

// The "What it catches" examples in the README are real output. If a rule's wording
// changes, this fails until the README is updated to match.
const readme = readFileSync(join(root, 'README.md'), 'utf8').replace(/\s+/g, ' ');
const EXAMPLES = [
  ['lost-communication.log', 'crash', 'mcu-lost-communication'],
  ['timer-too-close.log', 'crash', 'mcu-timer-too-close'],
  ['tmc-uart.log', 'crash', 'tmc-comm'],
  ['config-findings.log', 'config', 'removed-option'],
];

for (const [file, kind, id] of EXAMPLES) {
  test(`README example for ${id} matches the engine's output`, () => {
    const f = analyze(fixture(file))[kind].find((x) => x.id === id);
    assert.ok(f, `${id} not produced by ${file}`);
    for (const part of [f.title, f.detail, f.fix]) {
      assert.ok(readme.includes(part.replace(/\s+/g, ' ')), `README is missing: ${part}`);
    }
  });
}
