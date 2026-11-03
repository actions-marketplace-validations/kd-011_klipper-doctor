import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from '../dist/index.js';
import { root, fixture, ids } from './helpers.mjs';

const cli = join(root, 'dist', 'cli.js');

// What someone meets on the first run, when the log is still on the printer.
function inEmptyDir(args) {
  const dir = mkdtempSync(join(tmpdir(), 'klipper-doctor-first-'));
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: dir, env: { ...process.env, HOME: dir, USERPROFILE: dir } });
  rmSync(dir, { recursive: true });
  return r;
}

test('a missing klippy.log says where the log is, not just ENOENT', () => {
  const r = inEmptyDir(['klippy.log']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /klippy\.log/);
  assert.match(r.stderr, /printer_data\/logs/);
  assert.match(r.stderr, /Mainsail|Fluidd/);
  assert.match(r.stderr, /http:\/\/[^ ]+:7125/);
  assert.doesNotMatch(r.stderr, /ENOENT/);
});

test('a missing printer.cfg gets the plain message, with no talk of logs', () => {
  const r = inEmptyDir(['printer.cfg']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /printer\.cfg/);
  assert.match(r.stderr, /no such file/i);
  assert.doesNotMatch(r.stderr, /Mainsail|Fluidd/);
  assert.doesNotMatch(r.stderr, /ENOENT/);
});

test('a directory says so', () => {
  const r = inEmptyDir(['.']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /directory/);
  assert.doesNotMatch(r.stderr, /EISDIR/);
});

test('with no file and no default log, the error offers the ways in', () => {
  const r = inEmptyDir([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Moonraker/);
  assert.match(r.stderr, /demo\.log/);
});

test('the sample log in the README try-it-now line exists and gives a diagnosis on stdin', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /curl -s\S* https:\/\/raw\.githubusercontent\.com\/kd-011\/klipper-doctor\/main\/test\/fixtures\/demo\.log \| npx klipper-doctor -/);
  const r = spawnSync(process.execPath, [cli, '--no-color', '-'], { encoding: 'utf8', input: fixture('demo.log') });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Heater extruder not heating at expected rate/);
});

// Forum thread 26238 and others: the failing command was in a session before the last, and the report said nothing.

test('a command error in an earlier session is named when the last session is clean', () => {
  const r = analyze(fixture('probe-triggered-early.log') + fixture('clean.log'));
  const f = r.crash[0];
  assert.deepEqual(ids(r.crash), ['no-failure-found']);
  assert.equal(f.severity, 'note');
  assert.match(f.title, /session 1 of 2/);
  assert.match(f.title, /Probe triggered before it moved/);
  assert.match(f.detail, /QUERY_PROBE|probe/i);
  assert.ok(f.evidence.length > 0);
});

test('an earlier shutdown still wins over a later earlier-session command error', () => {
  const r = analyze(fixture('timer-too-close.log') + fixture('must-home.log') + fixture('clean.log'));
  assert.equal(r.crash[0].id, 'no-failure-found');
  assert.match(r.crash[0].title, /session 1 of 3/);
  assert.match(r.crash[0].title, /Timer too close/);
  assert.equal(r.crash[0].severity, 'warning');
});

test('a clean log with no command errors anywhere stays a plain no failure', () => {
  const f = analyze(fixture('clean.log') + fixture('clean.log')).crash[0];
  assert.equal(f.title, 'No failure found in the last session');
});

test('a command error in an earlier session does not change the exit code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'klipper-doctor-first-'));
  const r = spawnSync(process.execPath, [cli, '-'], { encoding: 'utf8', cwd: dir, input: fixture('must-home.log') + fixture('clean.log') });
  rmSync(dir, { recursive: true });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Must home axis first/);
});

// Forum threads 25669, 25692, 25679 and 25693 asked about "MCU has deprecated code": the versions are in the log.

test('mcu-version-differs: names each MCU, both versions, and the warning people search for', () => {
  const log = fixture('clean.log').replace(/^(Loaded MCU 'mcu' \d+ commands \()\S+/m, '$1v0.11.0-1-gabcdef12');
  const f = analyze(log).config.find((x) => x.id === 'mcu-version-differs');
  assert.ok(f, 'no finding');
  assert.equal(f.severity, 'note');
  assert.match(f.title, /'mcu'|MCU/);
  assert.match(f.detail, /v0\.11\.0-1-gabcdef12/);
  assert.match(f.detail, /v0\.12\.0-250-g1a2b3c4d/);
  assert.match(f.detail, /deprecated code/);
  assert.match(f.fix, /flash/);
});

test('mcu-version-differs: the same commit is not a difference, whatever the build added to its name', () => {
  for (const same of ['v0.12.0-250-g1a2b3c4d', 'v0.12.0-250-g1a2b3c4d-dirty', 'v0.12.0-250-g1a2b3c4', 'v0.12.0-250-g1a2b3c4d-dirty-20251010_005307-host']) {
    const log = fixture('clean.log').replace(/^(Loaded MCU 'mcu' \d+ commands \()\S+/m, `$1${same}`);
    assert.equal(analyze(log).config.find((x) => x.id === 'mcu-version-differs'), undefined, same);
  }
});

test('mcu-version-differs: no version to compare gives no note', () => {
  assert.equal(analyze(fixture('clean.log')).config.find((x) => x.id === 'mcu-version-differs'), undefined);
  assert.equal(analyze('[printer]\nkinematics: none\nmax_velocity: 1\nmax_accel: 1\n').config.find((x) => x.id === 'mcu-version-differs'), undefined);
});

test('moonraker.log gets told what it is and where klippy.log is, even when it quotes Klipper', () => {
  const log = '-------------------- Log Start | Sat Dec 20 06:23:23 2025 --------------------\nplatform: Linux-6.1.31-aarch64\ndata_path: /home/pi/printer_data\n2025-12-20 06:23:30,000 [klippy_connection.py:_log()] - Klippy said\nmcu \'mcu\': Unable to connect\n';
  for (const opts of [{ filename: 'moonraker.log' }, { filename: 'klippy.log' }, {}]) {
    const r = analyze(log, opts);
    assert.deepEqual(r.crash, [], JSON.stringify(opts));
    assert.equal(r.config[0].id, 'unusable-input');
    assert.match(r.config[0].title, /Moonraker/);
    assert.match(r.config[0].fix, /klippy\.log/);
  }
});
