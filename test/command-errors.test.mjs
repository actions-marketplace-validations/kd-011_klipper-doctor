// Command errors raised in the Klipper source, and the connect errors the survey of forum logs found most often.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, rulesMetadata } from '../dist/index.js';
import { COMMAND_ERRORS, KLIPPER_COMMIT } from '../dist/core/rules/crash/commandErrorTable.js';
import { fixture, ids } from './helpers.mjs';

const crash = (file) => analyze(fixture(file), { filename: file }).crash;
const named = (list, id) => list.find((f) => f.id === id);

test('command-error: a message from the Klipper source is named, with the file it comes from', () => {
  const f = named(crash('command-error-bed-mesh.log'), 'command-error');
  assert.ok(f, 'no command-error finding');
  assert.equal(f.severity, 'warning');
  assert.match(f.title, /bed_mesh: min\/max points too close together/);
  assert.match(f.detail, /klippy\/extras\/bed_mesh\.py/);
  assert.match(f.docs, /github\.com\/Klipper3d\/klipper\/blob\/master\/klippy\/extras\/bed_mesh\.py/);
  assert.equal(f.evidence[0].text, 'bed_mesh: min/max points too close together');
});

test('command-error: a clean last session no longer reads as no failure at all when the session had one', () => {
  assert.deepEqual(ids(crash('command-error-bed-mesh.log')), ['command-error']);
});

test('command-error: reports the last one, and lists the other different ones once', () => {
  const f = named(crash('command-error-many.log'), 'command-error');
  assert.match(f.title, /SDCARD_RESET_FILE cannot be run from the sdcard/);
  assert.match(f.detail, /Must home before probe/);
  assert.match(f.detail, /bed_mesh: min\/max points too close together/);
  assert.equal((f.detail.match(/SDCARD_RESET_FILE/g) ?? []).length, 1);
});

test('command-error: quotes in a request dump, the middle of a line and indented text do not count', () => {
  assert.equal(named(crash('command-error-near-miss.log'), 'command-error'), undefined);
});

test('command-error: nothing after the first shutdown counts, since that is the cascade', () => {
  const list = crash('command-error-before-shutdown.log');
  assert.equal(list[0].id, 'mcu-lost-communication');
  const f = named(list, 'command-error');
  assert.match(f.title, /too close together/);
  assert.doesNotMatch(f.detail, /Must home before probe/);
});

test('command-error: stays out of the way of the rules with specific advice', () => {
  for (const file of ['probe-triggered-early.log', 'homing-no-trigger.log', 'homing-still-triggered.log', 'must-home.log', 'bltouch-raise.log']) {
    assert.equal(named(crash(file), 'command-error'), undefined, file);
  }
});

test('command-error: appears in the rule list, and crash findings stay unsuppressible', () => {
  const r = rulesMetadata().find((x) => x.id === 'command-error');
  assert.equal(r.kind, 'crash');
  assert.equal(r.suppressible, false);
});

test('the table is from the Klipper source: pinned commit, real files, no message that could match anything', () => {
  assert.match(KLIPPER_COMMIT, /^[0-9a-f]{7,40}$/);
  assert.ok(COMMAND_ERRORS.length > 100, `only ${COMMAND_ERRORS.length} messages`);
  for (const [message, file] of COMMAND_ERRORS) {
    assert.match(file, /^klippy\/.+\.py$/);
    assert.doesNotMatch(message, /^%/, `${message} starts with a placeholder`);
    assert.ok(message.replace(/%[-.\d]*[a-zA-Z]/g, '').replace(/[^A-Za-z]/g, '').length >= 10, `${message} is too generic`);
    assert.doesNotMatch(message, /\n/);
  }
  const has = (m) => COMMAND_ERRORS.some(([x]) => x === m);
  assert.ok(has('bed_mesh: min/max points too close together'));
  assert.ok(has('Must home before probe'));
  assert.ok(!COMMAND_ERRORS.some(([x]) => x.startsWith('Option ')), 'config errors go through the config-error rule');
});

test('mcu-config-while-shutdown: says the MCU is still shut down and to run FIRMWARE_RESTART', () => {
  const f = crash('mcu-config-shutdown.log')[0];
  assert.equal(f.id, 'mcu-config-while-shutdown');
  assert.equal(f.severity, 'error');
  assert.match(f.detail, /'mcu'/);
  assert.match(f.fix, /FIRMWARE_RESTART/);
});

test('mcu-reset-failed: says the reset did not happen and to power-cycle', () => {
  const f = crash('mcu-reset-failed.log')[0];
  assert.equal(f.id, 'mcu-reset-failed');
  assert.equal(f.severity, 'error');
  assert.match(f.fix, /[Pp]ower/);
  assert.match(f.fix, /restart_method/);
});

test('mcu-thermocouple-fault: points at the sensor and its wiring', () => {
  const f = crash('thermocouple-fault.log')[0];
  assert.equal(f.id, 'mcu-thermocouple-fault');
  assert.equal(f.severity, 'error');
  assert.match(f.detail, /thermocouple/i);
  assert.match(f.docs, /src\/thermocouple\.c/);
});

test('an earlier session stuck on Can not update MCU config points back at the shutdown that left it there', () => {
  const f = crash('shutdown-then-config-shutdown.log')[0];
  assert.equal(f.id, 'no-failure-found');
  assert.match(f.title, /session 1 of 3/);
  assert.match(f.title, /Timer too close/);
});

test('the no-failure finding lists what other sessions logged, so a repeated problem is visible', () => {
  const log = fixture('homing-still-triggered.log') + fixture('homing-still-triggered.log') + fixture('lost-communication.log') + fixture('clean.log');
  const f = analyze(log).crash[0];
  assert.equal(f.id, 'no-failure-found');
  assert.match(f.title, /session 3 of 4/);
  assert.match(f.title, /Lost communication/);
  assert.match(f.detail, /Other sessions in this file logged: Endstop still triggered after the retract \(2 sessions\)/);
});

// Forum threads 25799, 25526 and 25308: the log was saved during the 90 seconds Klipper keeps retrying.

test('a log that ends while Klipper is still retrying says so, instead of no failure', () => {
  const f = crash('connect-still-retrying.log')[0];
  assert.equal(f.id, 'mcu-connect-failed');
  assert.equal(f.severity, 'warning');
  assert.match(f.title, /still trying to connect/);
  assert.match(f.title, /'mcu'/);
  assert.match(f.detail, /90 seconds/);
  assert.match(f.fix, /serial/);
});

test('still retrying a port that does not exist: names the port error and the check', () => {
  const f = crash('connect-still-retrying-port.log')[0];
  assert.equal(f.id, 'mcu-connect-failed');
  assert.match(f.detail, /No such file or directory/);
  assert.match(f.fix, /ls \/dev\/serial\/by-id/);
});

test('a retry that then connected is not a finding', () => {
  assert.deepEqual(ids(crash('connect-retried-then-ok.log')), ['no-failure-found']);
});

test('a failed connect above the first Start printer is its own session, so it cannot mask the next run', () => {
  const r = analyze(fixture('log-starts-with-failed-connect.log'), { filename: 'klippy.log' });
  assert.equal(r.meta.sessions, 3);
  const f = r.crash[0];
  assert.equal(f.id, 'no-failure-found');
  assert.match(f.title, /session 2 of 3/);
  assert.match(f.title, /Timer too close/);
});
