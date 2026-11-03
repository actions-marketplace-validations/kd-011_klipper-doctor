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
  'demo.log': ['heater-verify'],
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
  'heater-then-command-request.log': ['heater-verify'],
  'mcu-fault-then-command-request.log': ['crash-unknown-reason'],
  'timer-on-second-mcu.log': ['mcu-timer-too-close'],
  'timer-old-format.log': ['mcu-timer-too-close'],
  'estop-webhooks.log': ['mcu-command-request'],
  'estop-m112.log': ['mcu-command-request'],
  'internal-error-then-command-request.log': ['crash-unknown-reason'],
  'host-reason-no-rule.log': ['crash-unknown-reason'],
  'lost-communication-cascade.log': ['mcu-lost-communication'],
  'adc-then-tmc.log': ['mcu-adc-out-of-range'],
  'dump-noise.log': ['mcu-lost-communication'],
  'tmc-failed-to-init.log': ['tmc-comm'],
  'tmc-init-then-timer.log': ['mcu-timer-too-close'],
  'tmc-all-ones.log': ['tmc-reports-error'],
  'tmc-cs-actual-reset.log': ['tmc-reports-error'],
  'connect-mcu-already-shutdown.log': ['mcu-config-while-shutdown'],
  'connect-crc-mismatch.log': ['crash-unknown-reason'],
  'connect-unhandled.log': ['crash-unknown-reason'],
  'previous-mcu-shutdown.log': ['mcu-adc-out-of-range'],
  'rollover-real-order.log': ['mcu-timer-too-close'],
  'connect-failed-then-estop.log': ['mcu-connect-failed'],
  'homing-no-trigger.log': ['homing-no-trigger'],
  'homing-no-trigger-probe.log': ['homing-no-trigger'],
  'homing-wrapped-other.log': ['move-out-of-range'],
  'homing-still-triggered.log': ['homing-still-triggered'],
  'probe-triggered-early.log': ['probe-triggered-early'],
  'homing-comm-timeout.log': ['homing-comm-timeout'],
  'homing-comm-timeout-wrapped.log': ['homing-comm-timeout'],
  'extrude-cold.log': ['extrude-cold'],
  'extrude-only-too-long.log': ['extrude-only-too-long'],
  'extrude-cross-section.log': ['extrude-cross-section'],
  'bltouch-verify-sensor.log': ['bltouch-verify'],
  'bltouch-raise.log': ['bltouch-verify'],
  'command-errors-in-dump.log': ['mcu-lost-communication'],
  'command-errors-midline.log': ['no-failure-found'],
  'probe-healthy.log': ['no-failure-found'],
  'max-duration-digital.log': ['mcu-max-duration'],
  'max-duration-pwm.log': ['mcu-max-duration'],
  'linux-spi-open.log': ['mcu-linux-bus-open'],
  'linux-i2c-open.log': ['mcu-linux-bus-open'],
  'linux-gpio-open.log': ['crash-unknown-reason'],
  'can-uuid-mismatch.log': ['mcu-connect-failed'],
  'can-port-down.log': ['mcu-connect-failed'],
  'can-uuid-invalid.log': ['can-uuid-invalid'],
  'config-error-pin-twice.log': ['config-error'],
  'config-error-chip-name.log': ['config-error'],
  'config-error-pin-description.log': ['config-error'],
  'config-error-choice.log': ['config-error'],
  'config-error-kinematics.log': ['config-error'],
  'config-error-tmc-section.log': ['config-error'],
  'config-error-sensor.log': ['config-error'],
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

// Command request is what every MCU reports after the host stops it (mcu.py _shutdown sends
// emergency_stop, src/basecmd.c answers "Command request"). It is only the cause when nothing came before it.

test('Command request after a heater shutdown is the effect, not a second diagnosis', () => {
  const r = analyze(fixture('heater-then-command-request.log'));
  assert.equal(r.crash.length, 1);
  assert.doesNotMatch(JSON.stringify(r.crash), /M112/);
});

test('an MCU reason no rule knows is shown, not hidden behind Command request', () => {
  const f = analyze(fixture('mcu-fault-then-command-request.log')).crash[0];
  assert.match(f.title, /MCU 'mcu' shutdown: Some future firmware reason/);
  assert.ok(f.evidence.some((e) => /Some future firmware reason/.test(e.text)));
});

test('the MCU named in a finding is the one that gave the reason, not the first one listed', () => {
  const f = analyze(fixture('timer-on-second-mcu.log')).crash[0];
  assert.match(f.detail, /MCU 'mcu' shut down with "Timer too close"/);
  assert.ok(f.evidence.some((e) => e.text === "MCU 'mcu' shutdown: Timer too close"));
  assert.ok(!f.evidence.some((e) => /toolhead|rpi/.test(e.text)));
});

test('the older format with the reason on the Transition line still works, with a second MCU after it', () => {
  const f = analyze(fixture('timer-old-format.log')).crash[0];
  assert.match(f.detail, /MCU 'mcu' shut down/);
});

test('an emergency stop says where it came from', () => {
  const web = analyze(fixture('estop-webhooks.log')).crash[0];
  assert.match(web.detail, /Shutdown due to webhooks request/);
  assert.match(web.detail, /emergency.stop/i);
  assert.match(web.fix, /emergency.stop/i);
  const m112 = analyze(fixture('estop-m112.log')).crash[0];
  assert.match(m112.detail, /M112/);
});

test('a host exception reports the exception, and the Command request after it is not mentioned as a cause', () => {
  const f = analyze(fixture('internal-error-then-command-request.log')).crash[0];
  assert.match(f.title, /Internal error on command:"BED_SCREWS_ADJUST"/);
  assert.match(f.detail, /AttributeError/);
  assert.doesNotMatch(f.detail, /M112/);
});

test('errors after the first shutdown are consequences, not more diagnoses', () => {
  const r = analyze(fixture('host-reason-no-rule.log'));
  assert.match(r.crash[0].title, /Timeout on wait for 'tmcuart_response' response/);
  assert.equal(analyze(fixture('lost-communication-cascade.log')).crash.length, 1);
  assert.equal(analyze(fixture('adc-then-tmc.log')).crash.length, 1);
});

test('text quoted in the request dumps after a shutdown never fires a rule', () => {
  const r = analyze(fixture('dump-noise.log'));
  assert.deepEqual(ids(r.crash), ['mcu-lost-communication']);
});

test('text in a request dump does not fire a rule even when the log has no shutdown line', () => {
  const r = analyze(`Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\nReceived 5014.2: b'{"params": {"script": "M117 MCU \\'mcu\\' shutdown: Timer too close"}}'\n`);
  assert.deepEqual(ids(r.crash), ['no-failure-found']);
});

// A log with several starts: the user usually restarted Klipper before grabbing the log.

test('no failure in the last session, but an earlier one died: the finding says which, why and where', () => {
  const r = analyze(fixture('multi-session.log'));
  const f = r.crash[0];
  assert.equal(r.meta.analysedSession, 3);
  assert.equal(f.severity, 'warning');
  assert.match(f.title, /session 2 of 3/);
  assert.match(f.title, /Lost communication/);
  assert.match(f.detail, /USB|cable/);
  assert.match(f.fix, /USB cable/);
  const lines = fixture('multi-session.log').split('\n');
  assert.ok(f.evidence.length > 0);
  for (const e of f.evidence) assert.equal(lines[e.line - 1], e.text);
});

test('the earlier failure keeps a rotated log at exit code 0 and a single finding', () => {
  const r = analyze(fixture('rollover-shutdown-restart.log'));
  assert.deepEqual(ids(r.crash), ['no-failure-found']);
  assert.equal(r.crash[0].severity, 'warning');
  assert.match(r.crash[0].title, /Timer too close/);
});

test('a clean log with no earlier failure still says no failure plainly', () => {
  const f = analyze(fixture('clean.log')).crash[0];
  assert.equal(f.severity, 'note');
  assert.match(f.title, /No failure found/);
});

test('an earlier emergency stop stays a note: somebody chose to stop', () => {
  const stop = fixture('estop-webhooks.log');
  const f = analyze(stop + fixture('clean.log')).crash[0];
  assert.equal(f.id, 'no-failure-found');
  assert.equal(f.severity, 'note');
  assert.match(f.detail, /webhooks/);
});

test('warnings in the last session do not hide a failed earlier session', () => {
  const r = analyze(fixture('timer-too-close.log') + fixture('must-home.log'));
  assert.deepEqual(ids(r.crash), ['must-home-first', 'no-failure-found']);
  assert.match(r.crash[1].title, /Timer too close/);
});

// TMC details, against docs/TMC_Drivers.md and the field names in extras/tmc2130.py

test('a TMC driver that failed to init is not a crash when Klipper carried on', () => {
  const f = analyze(fixture('tmc-failed-to-init.log')).crash[0];
  assert.equal(f.severity, 'warning');
  assert.match(f.detail, /startup/);
  assert.match(f.detail, /motor power/);
});

test('a TMC init failure does not join the diagnosis of a later shutdown', () => {
  assert.deepEqual(ids(analyze(fixture('tmc-init-then-timer.log')).crash), ['mcu-timer-too-close']);
});

test('TMC status ffffffff reads as SPI, not as every flag at once', () => {
  const f = analyze(fixture('tmc-all-ones.log')).crash[0];
  assert.match(f.detail, /SPI/);
  assert.doesNotMatch(f.detail, /too hot|very high current/);
  assert.match(f.fix, /SPI/);
});

test('cs_actual=0(Reset?) in lowercase, as the source writes it, reads as a driver reset', () => {
  const f = analyze(fixture('tmc-cs-actual-reset.log')).crash[0];
  assert.match(f.detail, /reset itself/);
});

test('se=0(Reset?) from a tmc2660 reads as a driver reset', () => {
  const r = analyze("Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\nTransition to shutdown state: TMC 'stepper_y' reports error: READRSP@RDSEL2: 00012300 se=0(Reset?)\n");
  assert.match(r.crash[0].detail, /reset itself/);
});

// The rest of the fallback and the MCU rules

test('MCU error during connect shows the message from the traceback and what to do next', () => {
  const f = analyze(fixture('connect-crc-mismatch.log')).crash[0];
  assert.match(f.title, /MCU 'mcu' CRC does not match config/);
  assert.match(f.fix, /FIRMWARE_RESTART/);
  assert.ok(f.evidence.some((e) => /CRC does not match/.test(e.text)));
});

test('Unhandled exception during connect shows the exception', () => {
  const f = analyze(fixture('connect-unhandled.log')).crash[0];
  assert.match(f.title, /ImportError: cannot import name/);
});

test('a Previous MCU shutdown says the fault is older than this start', () => {
  const f = analyze(fixture('previous-mcu-shutdown.log')).crash[0];
  assert.match(f.detail, /before this/);
  assert.match(f.fix, /FIRMWARE_RESTART/);
});

test('ADC out of range does not claim a temperature when Klipper could not compute one', () => {
  const r = analyze("Transition to shutdown state: MCU shutdown\nMCU 'mcu' shutdown: ADC out of range\nSensor 'extruder' temperature ? not in range 0.000:270.000\n");
  assert.doesNotMatch(r.crash[0].detail, /read \? C/);
  assert.match(r.crash[0].detail, /0\.000:270\.000/);
});

test('the heater rule also covers a heater that cannot hold its target', () => {
  const f = analyze(fixture('heater-not-heating.log')).crash[0];
  assert.match(f.detail, /hold/);
});

test('the stepcompress text no longer says it only comes from syncing a position', () => {
  const f = analyze(fixture('stepcompress.log')).crash[0];
  assert.match(f.detail, /motion_queuing\.py/);
  const r = analyze("Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\nTransition to shutdown state: Internal error in MCU 'mcu' stepcompress\n");
  assert.deepEqual(ids(r.crash), ['stepcompress-internal-error']);
});

test('a Section error mentions add-ons, since Klipper only knows sections it has a module for', () => {
  const r = analyze("Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\nConfig error\nTraceback (most recent call last):\n  File \"/k.py\", line 1, in x\nconfigparser.Error: Section 'gcode_shell_command x' is not a valid config section\n");
  assert.match(r.crash[0].detail, /add-on/);
});

test('a CAN MCU that will not connect gets CAN advice, not a USB path', () => {
  const r = analyze("Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\nmcu 'ebb': Starting CAN connect\nmcu 'ebb': Unable to open CAN port: [Errno 19] No such device\nMCU error during connect\nTraceback (most recent call last):\n  File \"/k.py\", line 1, in x\nmcu.error: mcu 'ebb': Unable to connect\n");
  assert.deepEqual(ids(r.crash), ['mcu-connect-failed']);
  assert.match(r.crash[0].fix, /canbus_uuid/);
  assert.doesNotMatch(r.crash[0].fix, /serial\/by-id/);
});

test('an emergency stop after a failed connect is not listed as a second diagnosis', () => {
  const r = analyze(fixture('connect-failed-then-estop.log'));
  assert.equal(r.crash.length, 1);
  assert.doesNotMatch(r.crash[0].detail, /emergency stop/i);
});

test('LowSideShort, the older name for ShortToSupply, reads as a short', () => {
  const r = analyze("Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\nTransition to shutdown state: TMC 'stepper_z' reports error: DRV_STATUS: 40140010 s2vsa=1(LowSideShort_A!) cs_actual=20\n");
  assert.match(r.crash[0].detail, /very high current/);
});
