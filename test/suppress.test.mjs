import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, rulesMetadata } from '../dist/index.js';
import { fixture, ids } from './helpers.mjs';

// Line 3 and 5 set max_velocity twice (duplicate-option, evidence on both lines),
// line 8 is a removed option, [extruder] is missing options, line 12 is unindented gcode.
const CFG = [
  '[printer]',
  'kinematics: none',
  'max_velocity: 300',
  'max_accel: 3000',
  'max_velocity: 200',
  '',
  '[extruder]',
  'pid_integral_max: 0.2',
  '',
  '[gcode_macro X]',
  'gcode:',
  'M117 hi',
  '',
].join('\n');
const withLine = (n, text) => CFG.split('\n').map((l, i) => (i + 1 === n ? text : l)).join('\n');
const insertBefore = (n, text) => {
  const lines = CFG.split('\n');
  lines.splice(n - 1, 0, text);
  return lines.join('\n');
};

test('the fixture config produces the findings these tests rely on', () => {
  assert.deepEqual(ids(analyze(CFG).config), ['missing-required', 'gcode-unindented', 'duplicate-option', 'removed-option', 'no-input-shaper']);
});

test('ignore removes the named config rules and counts them', () => {
  const r = analyze(CFG, { ignore: ['duplicate-option', 'no-input-shaper'] });
  assert.deepEqual(ids(r.config), ['missing-required', 'gcode-unindented', 'removed-option']);
  assert.equal(r.meta.suppressed, 2);
});

test('nothing suppressed leaves meta.suppressed unset', () => {
  assert.equal('suppressed' in analyze(CFG).meta, false);
  assert.equal('suppressed' in analyze(CFG, { ignore: ['no-such-rule'] }).meta, false);
});

test('ignore applies to the config dump inside a klippy.log', () => {
  const log = fixture('config-findings.log');
  assert.ok(ids(analyze(log).config).includes('removed-option'));
  assert.ok(!ids(analyze(log, { ignore: ['removed-option'] }).config).includes('removed-option'));
});

test('inline comment on the offending line suppresses that finding', () => {
  const r = analyze(withLine(8, 'pid_integral_max: 0.2   # klipper-doctor: ignore removed-option'));
  assert.ok(!ids(r.config).includes('removed-option'));
  assert.equal(r.meta.suppressed, 1);
  assert.ok(ids(r.config).includes('duplicate-option'));
});

test('inline comment on the line above suppresses, ShellCheck style', () => {
  const r = analyze(insertBefore(8, '# klipper-doctor: ignore removed-option'));
  assert.ok(!ids(r.config).includes('removed-option'));
});

test('a block of comment lines above the line works, a blank line breaks it', () => {
  const block = insertBefore(8, '# klipper-doctor: ignore removed-option\n# kept for the old board');
  assert.ok(!ids(analyze(block).config).includes('removed-option'));
  const gap = insertBefore(8, '# klipper-doctor: ignore removed-option\n');
  assert.ok(ids(analyze(gap).config).includes('removed-option'));
});

test('a comment above a code line does not reach the line below it', () => {
  const r = analyze(insertBefore(4, '# klipper-doctor: ignore duplicate-option'));
  // Evidence of duplicate-option is lines 3 and 6 now; the comment sits above line 4 only.
  assert.ok(ids(r.config).includes('duplicate-option'));
});

test('several ids in one comment, separated by commas', () => {
  const r = analyze(withLine(8, 'pid_integral_max: 0.2 # klipper-doctor: ignore removed-option, deprecated-option'));
  assert.ok(!ids(r.config).includes('removed-option'));
  const two = analyze(insertBefore(5, '# klipper-doctor: ignore duplicate-option,removed-option'));
  assert.ok(!ids(two.config).includes('duplicate-option'));
  assert.ok(ids(two.config).includes('removed-option'), 'the removed option is on another line');
});

test('a directive for another rule does not hide this one', () => {
  const r = analyze(withLine(8, 'pid_integral_max: 0.2 # klipper-doctor: ignore duplicate-option'));
  assert.ok(ids(r.config).includes('removed-option'));
});

test('a directive survives config parsing: it does not change what Klipper would read', () => {
  const plain = analyze(CFG);
  const noisy = analyze(
    CFG.split('\n').map((l) => (l.trim() ? l + ' # klipper-doctor: ignore not-a-rule' : l)).join('\n'),
  );
  assert.deepEqual(ids(noisy.config), ids(plain.config));
  const gcode = CFG.replace('gcode:\nM117 hi', 'gcode:\n  # klipper-doctor: ignore not-a-rule\n  M117 hi');
  assert.ok(!ids(analyze(gcode).config).includes('gcode-unindented'));
});

test('a finding with no line can only be suppressed with ignore', () => {
  const noEvidence = analyze(CFG).config.find((f) => f.id === 'no-input-shaper');
  assert.deepEqual(noEvidence.evidence, []);
  assert.ok(ids(analyze('# klipper-doctor: ignore no-input-shaper\n' + CFG).config).includes('no-input-shaper'));
});

test('crash findings are never hidden, by option or by comment', () => {
  const log = fixture('timer-too-close.log');
  assert.equal(analyze(log).crash[0].id, 'mcu-timer-too-close');
  assert.equal(analyze(log, { ignore: ['mcu-timer-too-close', 'crash-unknown-reason'] }).crash[0].id, 'mcu-timer-too-close');
  const lines = log.split('\n');
  const shutdown = lines.findIndex((l) => /Timer too close/.test(l));
  lines.splice(shutdown, 0, '# klipper-doctor: ignore mcu-timer-too-close');
  lines.splice(shutdown + 2, 0, '# klipper-doctor: ignore mcu-timer-too-close');
  const r = analyze(lines.join('\n'));
  assert.equal(r.crash[0].id, 'mcu-timer-too-close');
  assert.equal(r.meta.suppressed, undefined);
});

test('unusable-input cannot be suppressed', () => {
  const r = analyze('\u0000\u0001\u0002\u0003'.repeat(200) + 'x', { ignore: ['unusable-input'] });
  assert.deepEqual(ids(r.config), ['unusable-input']);
  const empty = analyze('', { ignore: ['unusable-input'] });
  assert.deepEqual(ids(empty.config), ['unusable-input']);
});

test('rulesMetadata says which rules can be suppressed', () => {
  const byId = Object.fromEntries(rulesMetadata().map((r) => [r.id, r]));
  assert.equal(byId['duplicate-option'].suppressible, true);
  assert.equal(byId['mcu-timer-too-close'].suppressible, false);
  assert.equal(byId['no-failure-found'].suppressible, false);
  assert.equal(byId['unusable-input'].suppressible, false);
});

test('a bad ignore option does not break analyze', () => {
  for (const ignore of [null, 'duplicate-option', 5, [1, null, {}]]) {
    assert.doesNotThrow(() => analyze(CFG, { ignore }));
  }
});
