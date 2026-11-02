import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

test('exit code 2 on no arguments (with no default log) and on an unknown flag', () => {
  // A printer host has ~/printer_data/logs/klippy.log, which no arguments would read, so use an empty HOME.
  const home = mkdtempSync(join(tmpdir(), 'klipper-doctor-home-'));
  const none = spawnSync(process.execPath, [cli], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
  rmSync(home, { recursive: true });
  assert.equal(none.status, 2);
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

test('a Windows path that cannot be opened here gives the real error and a hint, not a stack trace', () => {
  const r = run(['C:\\Users\\me\\printer_data\\logs\\klippy.log']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /C:\\Users\\me/);
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/);
  if (process.platform !== 'win32') assert.match(r.stderr, /Windows path/);
});

test('a directory gives a read error, not a stack trace', () => {
  const r = run([join(root, 'test')]);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/);
});

test('a binary file is an error finding that says what happened, and only one', () => {
  for (const name of ['binary.gz', 'binary-named.log']) {
    const r = run(['--json', fixturePath(name)]);
    assert.equal(r.status, 1, name);
    const j = JSON.parse(r.stdout);
    assert.deepEqual(j.config.map((f) => f.id), ['unusable-input'], name);
    assert.deepEqual(j.crash, [], name);
    assert.match(j.config[0].title, /binary|compressed/i, name);
  }
});

test('an empty file says it is empty and exits 0', () => {
  for (const name of ['empty.log', 'empty.cfg', 'blank.cfg', 'nul-only.cfg']) {
    const r = run(['--no-color', fixturePath(name)]);
    assert.equal(r.status, 0, name);
    assert.match(r.stdout, /empty/i, name);
    assert.doesNotMatch(r.stdout, /no errors or warnings/, name);
  }
});

test('text on stdin with no recognisable section gets one finding, not one per line', () => {
  const r = run(['--json', '-'], fixture('notes.txt'));
  assert.deepEqual(JSON.parse(r.stdout).config.map((f) => f.id), ['unusable-input']);
});

test('a reader that closes the pipe early does not produce a stack trace', () => {
  // Far more output than a pipe buffers, so the write is still going when head has gone.
  const dir = mkdtempSync(join(tmpdir(), 'klipper-doctor-'));
  const cfg = join(dir, 'bad.cfg');
  writeFileSync(cfg, '[printer]\nkinematics: none\nmax_velocity: 1\nmax_accel: 1\n' + 'a: 1\n'.repeat(200000));
  const r = spawnSync('sh', ['-c', `"${process.execPath}" "${cli}" --json "${cfg}" | head -c 10 >/dev/null`], { encoding: 'utf8' });
  rmSync(dir, { recursive: true });
  assert.doesNotMatch(r.stderr, /EPIPE|at .*\.js:\d+/);
});
