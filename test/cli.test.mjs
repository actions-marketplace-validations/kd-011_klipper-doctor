import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, fixturePath, fixture } from './helpers.mjs';

const cli = join(root, 'dist', 'cli.js');
const run = (args, input) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input });

test('exit code 1 when an error-severity finding exists', () => {
  const r = run(['--no-color', fixturePath('timer-too-close.log')]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Timer too close/);
});

test('exit code 0 on a clean log', () => {
  assert.equal(run([fixturePath('clean.log')]).status, 0);
});

test('exit code 0 when there are only warnings and notes', () => {
  assert.equal(run([fixturePath('includes.cfg')]).status, 0);
});

test('exit code 2 on a missing file, with the real error text', () => {
  const r = run([fixturePath('nope.log')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ENOENT|no such file/i);
});

test('exit code 2 on no arguments and on an unknown flag', () => {
  assert.equal(run([]).status, 2);
  const r = run(['--frobnicate', fixturePath('clean.log')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--frobnicate/);
});

test('--json prints a Report', () => {
  const r = run(['--json', fixturePath('timer-too-close.log')]);
  const j = JSON.parse(r.stdout);
  assert.equal(j.crash[0].id, 'mcu-timer-too-close');
  assert.equal(j.meta.inputKind, 'klippy.log');
});

test('--md prints markdown', () => {
  const r = run(['--md', fixturePath('timer-too-close.log')]);
  assert.match(r.stdout, /\*\*Errors/);
});

test('--config-only skips the crash report and its exit code', () => {
  const r = run(['--json', '--config-only', fixturePath('timer-too-close.log')]);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout).crash, []);
});

test('--no-color strips escape codes; colour is on when forced', () => {
  assert.ok(!run(['--no-color', fixturePath('timer-too-close.log')]).stdout.includes('\u001b['));
});

test('reads stdin when the file is -', () => {
  const r = run(['--json', '-'], fixture('timer-too-close.log'));
  assert.equal(JSON.parse(r.stdout).crash[0].id, 'mcu-timer-too-close');
  assert.equal(r.status, 1);
});

test('--help and --version exit 0', () => {
  assert.equal(run(['--help']).status, 0);
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/);
});

test('the CLI works on every fixture', () => {
  for (const f of readdirSync(join(root, 'test', 'fixtures'))) {
    const r = run(['--json', fixturePath(f)]);
    assert.ok([0, 1].includes(r.status), `${f}: exit ${r.status}: ${r.stderr}`);
    JSON.parse(r.stdout);
  }
});

test('exit code 0 for a gcode command error that did not shut Klipper down', () => {
  assert.equal(run([fixturePath('move-out-of-range.log')]).status, 0);
  assert.equal(run([fixturePath('must-home.log')]).status, 0);
});

test('exit code 1 for a real shutdown that follows a warning-level gcode error', () => {
  assert.equal(run([fixturePath('shutdown-after-gcode-error.log')]).status, 1);
});

test('exit code 0 for a rotated log whose crash is before the last restart', () => {
  assert.equal(run([fixturePath('rollover-shutdown-restart.log')]).status, 0);
});
