import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../dist/index.js';
import { root, fixture } from './helpers.mjs';

// The examples in docs/examples.md and the README are real output. If a rule's wording
// changes, this fails until the page is updated to match.
const examples = readFileSync(join(root, 'docs', 'examples.md'), 'utf8').replace(/\s+/g, ' ');
const readme = readFileSync(join(root, 'README.md'), 'utf8').replace(/\s+/g, ' ');
const EXAMPLES = [
  ['lost-communication.log', 'crash', 'mcu-lost-communication'],
  ['timer-too-close.log', 'crash', 'mcu-timer-too-close'],
  ['tmc-uart.log', 'crash', 'tmc-comm'],
  ['config-findings.log', 'config', 'removed-option'],
  ['command-error-bed-mesh.log', 'crash', 'command-error'],
];

for (const [file, kind, id] of EXAMPLES) {
  test(`docs/examples.md example for ${id} matches the engine's output`, () => {
    const f = analyze(fixture(file))[kind].find((x) => x.id === id);
    assert.ok(f, `${id} not produced by ${file}`);
    for (const part of [f.title, f.detail, f.fix]) {
      assert.ok(examples.includes(part.replace(/\s+/g, ' ')), `docs/examples.md is missing: ${part}`);
    }
  });
}

test('the example in the README matches the engine too', () => {
  const f = analyze(fixture('timer-too-close.log')).crash.find((x) => x.id === 'mcu-timer-too-close');
  for (const part of [f.title, f.detail, f.fix]) {
    assert.ok(readme.includes(part.replace(/\s+/g, ' ')), `README is missing: ${part}`);
  }
});

test('the README stays short: reference material belongs in docs/', () => {
  const words = readme.split(' ').length;
  assert.ok(words < 700, `README is ${words} words, which is more than about two minutes of reading`);
});
