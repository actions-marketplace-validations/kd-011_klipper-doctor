import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../dist/index.js';
import { makeLog, makeLongLine, makeRestarts, makeSpaces } from '../scripts/bench.mjs';

// Compares two sizes as a ratio, never against a wall-clock limit, so a slow CI machine cannot fail
// it. The input grows by RATIO: linear work takes about RATIO times as long, and quadratic work about
// RATIO squared. The limit sits half way between the two. Three things keep noise out of the ratio:
// it uses CPU time, which does not count waiting on a busy machine; it takes the best of several runs,
// so a garbage collection pause does not decide it; and FLOOR_MS stops timer noise on a very fast
// small run from inflating it. The input sizes are chosen so superlinear work is far above the floor.
const RATIO = 8;
const LIMIT = (RATIO * RATIO) / 2;
const RUNS = 7;
const FLOOR_MS = 2;
const KB = 1024;
const MB = KB * KB;

function best(text, filename) {
  let min = Infinity;
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.cpuUsage();
    analyze(text, { filename });
    const used = process.cpuUsage(t0);
    min = Math.min(min, (used.user + used.system) / 1000);
  }
  return min;
}

function assertLinear(make, small, filename) {
  const a = make(small);
  const b = make(small * RATIO);
  best(a, filename); // warm up the JIT, so the first size is not charged for compiling
  const ratio = best(b, filename) / Math.max(best(a, filename), FLOOR_MS);
  assert.ok(ratio < LIMIT, `grew ${ratio.toFixed(1)}x for ${RATIO}x the input (limit ${LIMIT}x)`);
}

test('scaling: one long session', () => assertLinear(makeLog, 1 * MB, 'klippy.log'));
test('scaling: many restarts', () => assertLinear(makeRestarts, 1 * MB, 'klippy.log'));
test('scaling: one very long line in a log', () => assertLinear(makeLongLine, 1 * MB, 'klippy.log'));

// Big enough that the old option-splitting regex would take minutes at the larger size.
test('scaling: a long run of spaces in a config line', () => assertLinear(makeSpaces, 256 * KB, 'printer.cfg'));

const manySections = (bytes) => {
  const block = (i) => `[tmc2209 stepper_${i}]\nuart_pin: PA1\nrun_current: 0.5\nstealthchop_threshold: 999999\n`;
  const out = [];
  let size = 0;
  for (let i = 0; size < bytes; i++) {
    const s = block(i);
    out.push(s);
    size += s.length;
  }
  return out.join('');
};
test('scaling: a config with many distinct sections', () => assertLinear(manySections, 128 * KB, 'printer.cfg'));

const manySaved = (bytes) => {
  const main = '[printer]\nkinematics: none\nmax_velocity: 1\nmax_accel: 1\n[input_shaper]\n';
  const line = (i) => `#*# opt_${i} = 1\n`;
  const out = [main, '[extruder]\n'];
  const save = ['#*# <---------------------- SAVE_CONFIG ---------------------->\n#*# DO NOT EDIT THIS BLOCK OR BELOW. The contents are auto-generated.\n#*#\n#*# [extruder]\n'];
  for (let i = 0, size = 0; size < bytes; i++) {
    out.push(`opt_${i}: 1\n`);
    save.push(line(i));
    size += 26;
  }
  return out.join('') + save.join('');
};
test('scaling: every saved option repeated in the main config', () => assertLinear(manySaved, 64 * KB, 'printer.cfg'));

test('scaling: a repeated section', () => {
  const make = (bytes) => '[extruder]\nx: 1\n'.repeat(Math.ceil(bytes / 16));
  assertLinear(make, 128 * KB, 'printer.cfg');
});
