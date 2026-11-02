import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../dist/index.js';
import { fixture, ids } from './helpers.mjs';

// fixture file -> the crash rule ids it must produce (and nothing else).
const EXPECTED = {
  'timer-too-close.log': ['mcu-timer-too-close'],
  'missed-scheduling.log': ['mcu-missed-scheduling'],
  'lost-communication.log': ['mcu-lost-communication'],
  'connect-failed.log': ['mcu-connect-failed'],
  'adc-out-of-range.log': ['mcu-adc-out-of-range'],
  'heater-not-heating.log': ['heater-verify'],
  'tmc-uart.log': ['tmc-comm'],
  'tmc-spi.log': ['tmc-comm'],
  'tmc-error.log': ['tmc-reports-error'],
  'move-out-of-range.log': ['move-out-of-range'],
  'must-home.log': ['must-home-first'],
  'rescheduled-timer.log': ['mcu-step-rate'],
  'stepper-too-far.log': ['mcu-step-rate'],
  'protocol-mismatch.log': ['mcu-protocol-mismatch'],
  'stepcompress.log': ['stepcompress-internal-error'],
  'command-request.log': ['mcu-command-request'],
  'spontaneous-restart.log': ['mcu-spontaneous-restart'],
  'config-error-invalid-option.log': ['config-error'],
  'config-error-missing-option.log': ['config-error'],
  'unknown-reason.log': ['crash-unknown-reason'],
  'truncated.log': ['mcu-timer-too-close'],
  'multi-session-last-crashed.log': ['mcu-timer-too-close'],
  'clean.log': ['no-failure-found'],
  'crlf.log': ['no-failure-found'],
  'rollover-header.log': ['no-failure-found'],
  'multi-session.log': ['no-failure-found'],
};

for (const [file, want] of Object.entries(EXPECTED)) {
  test(`crash: ${file} -> ${want.join(', ')}`, () => {
    const r = analyze(fixture(file), { filename: file });
    assert.deepEqual(ids(r.crash), want);
    assert.equal(r.meta.inputKind, 'klippy.log');
  });
}

test('crash findings carry detail, fix, docs and evidence', () => {
  for (const file of Object.keys(EXPECTED)) {
    const r = analyze(fixture(file));
    for (const f of r.crash) {
      assert.ok(f.title && f.detail, `${file} ${f.id} title/detail`);
      assert.ok(['error', 'warning', 'note'].includes(f.severity));
      if (f.id !== 'no-failure-found') {
        assert.ok(f.fix, `${file} ${f.id} fix`);
        assert.ok(f.evidence.length > 0, `${file} ${f.id} evidence`);
      }
    }
  }
});

test('no failure: says so plainly with the Klipper version and uptime from the stats lines', () => {
  const r = analyze(fixture('clean.log'));
  const f = r.crash[0];
  assert.equal(f.id, 'no-failure-found');
  assert.equal(f.severity, 'note');
  assert.match(f.detail, /v0\.12\.0-250-g1a2b3c4d/);
  assert.match(f.detail, /Stats/);
  assert.match(f.detail, /\b\d+ s\b|\bsecond/);
});

test('the fallback surfaces the raw shutdown reason', () => {
  const f = analyze(fixture('unknown-reason.log')).crash[0];
  assert.match(f.detail + f.title, /Some future firmware reason/);
  assert.ok(f.evidence.some((e) => /Transition to shutdown state/.test(e.text)));
});

test('the fallback stays quiet when a rule matched', () => {
  const r = analyze(fixture('timer-too-close.log'));
  assert.ok(!ids(r.crash).includes('crash-unknown-reason'));
});

test('ADC out of range names the sensor and range from the clarification line', () => {
  const f = analyze(fixture('adc-out-of-range.log')).crash[0];
  assert.match(f.detail, /extruder/);
  assert.match(f.detail, /0\.000:270\.000/);
});

test('TMC error explains the flag that was reported', () => {
  const f = analyze(fixture('tmc-error.log')).crash[0];
  assert.match(f.detail, /stepper_y/);
  assert.match(f.detail, /too hot|overtemp/i);
});

test('protocol mismatch lists the MCU Klipper says is out of date', () => {
  const f = analyze(fixture('protocol-mismatch.log')).crash[0];
  assert.match(f.detail, /v0\.11\.0-33-g99aabbcc/);
  assert.match(f.fix, /flash/i);
});

test('connect failure explains a missing serial device', () => {
  const f = analyze(fixture('connect-failed.log')).crash[0];
  assert.match(f.detail, /\/dev\/serial\/by-id\/usb-Klipper_stm32f103xe_ABC123-if00/);
  assert.match(f.fix, /by-id/);
});

test('config-error points at the removed option when the config dump still has it', () => {
  const r = analyze(fixture('config-error-invalid-option.log'));
  const f = r.crash[0];
  assert.match(f.detail, /pid_integral_max/);
  assert.match(f.detail, /removed/i);
});

test('multi-session: the last session is analysed and the count is reported', () => {
  const r = analyze(fixture('multi-session.log'));
  assert.equal(r.meta.sessions, 3);
  assert.equal(r.meta.analysedSession, 3);
  const last = analyze(fixture('multi-session-last-crashed.log'));
  assert.equal(last.meta.sessions, 2);
  assert.equal(last.meta.analysedSession, 2);
});

test('multi-session: a later start inherits the Klipper version from the first', () => {
  const r = analyze(fixture('multi-session.log'));
  assert.equal(r.meta.klipperVersion, 'v0.12.0-250-g1a2b3c4d');
});

test('meta: version, MCUs and line count', () => {
  const text = fixture('clean.log');
  const r = analyze(text);
  assert.equal(r.meta.klipperVersion, 'v0.12.0-250-g1a2b3c4d');
  assert.deepEqual(r.meta.mcus, [{ name: 'mcu', version: 'v0.12.0-250-g1a2b3c4d' }]);
  assert.equal(r.meta.sessions, 1);
  assert.equal(r.meta.analysedSession, 1);
  assert.equal(r.meta.linesRead, text.trimEnd().split('\n').length);
});

test('CRLF logs give the same result with no stray carriage returns', () => {
  const a = analyze(fixture('clean.log'));
  const b = analyze(fixture('crlf.log'));
  assert.deepEqual(ids(a.crash), ids(b.crash));
  assert.deepEqual(ids(a.config), ids(b.config));
  const t = analyze(fixture('timer-too-close.log').replace(/\n/g, '\r\n'));
  for (const f of t.crash) for (const e of f.evidence) assert.ok(!e.text.includes('\r'));
});

test('evidence line numbers point at the same text in the file', () => {
  for (const file of Object.keys(EXPECTED)) {
    const lines = fixture(file).split(/\r?\n/);
    const r = analyze(fixture(file));
    for (const f of [...r.crash, ...r.config]) {
      for (const e of f.evidence) {
        assert.equal(lines[e.line - 1], e.text, `${file} ${f.id} line ${e.line}`);
      }
    }
  }
});

test('performance: a 15 MB log parses well inside the budget', () => {
  const base = fixture('timer-too-close.log');
  const stat = 'Stats 5003.2: gcodein=0  mcu: mcu_awake=0.001 mcu_task_avg=0.000009 bytes_write=1400 bytes_read=1800 bytes_retransmit=0 freq=72000123 heater_bed: target=60 temp=59.8 pwm=0.250 sysload=0.22 cputime=2.5 memavail=800000\n';
  const filler = stat.repeat(Math.ceil((15 * 1024 * 1024) / stat.length));
  const idx = base.indexOf('Transition to shutdown state');
  const big = base.slice(0, idx) + filler + base.slice(idx);
  assert.ok(big.length > 15 * 1024 * 1024);
  const t0 = performance.now();
  const r = analyze(big);
  const ms = performance.now() - t0;
  assert.deepEqual(ids(r.crash), ['mcu-timer-too-close']);
  assert.ok(ms < 2000, `took ${ms.toFixed(0)} ms`);
});

test('gcode command errors are warnings: Klipper stays up, so they are not crash errors', () => {
  for (const f of ['move-out-of-range.log', 'must-home.log']) {
    const r = analyze(fixture(f));
    assert.equal(r.crash[0].severity, 'warning', f);
  }
  for (const f of ['timer-too-close.log', 'stepcompress.log', 'config-error-invalid-option.log']) {
    assert.equal(analyze(fixture(f)).crash[0].severity, 'error', f);
  }
});

test('a warning-level gcode error does not hide a real unexplained shutdown', () => {
  const r = analyze(fixture('shutdown-after-gcode-error.log'));
  assert.deepEqual(ids(r.crash), ['move-out-of-range', 'crash-unknown-reason']);
  assert.match(r.crash[1].title, /Some future firmware reason/);
});

test('heater-verify matches heater names that contain a space', () => {
  const log = `Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\nHeater heater_generic chamber not heating at expected rate\nTransition to shutdown state: Heater heater_generic chamber not heating at expected rate\n`;
  const r = analyze(log);
  assert.deepEqual(ids(r.crash), ['heater-verify']);
  assert.match(r.crash[0].title, /heater_generic chamber/);
});

test('rotated log: a crash before the restart is not reported as the current session', () => {
  const r = analyze(fixture('rollover-shutdown-restart.log'));
  assert.equal(r.meta.sessions, 2);
  assert.equal(r.meta.analysedSession, 2);
  assert.deepEqual(ids(r.crash), ['no-failure-found']);
});
