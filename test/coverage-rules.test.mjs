// Rules added for 0.2.0: the crash rules for command errors and MCU reasons, and three config lints.
// Each message is from the Klipper source named in the rule's comment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../dist/index.js';
import { fixture, ids } from './helpers.mjs';

const crash = (file) => analyze(fixture(file), { filename: file }).crash;
const one = (file) => {
  const r = crash(file);
  assert.equal(r.length, 1, `${file}: ${ids(r)}`);
  return r[0];
};
const cfg = (file) => analyze(fixture(file), { filename: file }).config;
const only = (file, id) => cfg(file).filter((f) => f.id === id);

// Command errors: Klipper keeps running, so they are warnings, like move-out-of-range

test('homing-no-trigger: names the endstop and the check that finds a wrong one', () => {
  const f = one('homing-no-trigger.log');
  assert.equal(f.severity, 'warning');
  assert.match(f.detail, /"x"|\bx\b/);
  assert.match(f.detail, /full movement/);
  assert.match(f.fix, /QUERY_ENDSTOPS/);
  assert.equal(f.evidence[0].text, 'No trigger on x after full movement');
});

test('homing-no-trigger: for the probe it also says the Z minimum may be too high', () => {
  const f = one('homing-no-trigger-probe.log');
  assert.match(f.detail, /probe/);
  assert.match(f.detail + f.fix, /position_min/);
});

test('homing-still-triggered: names the endstop and homing_retract_dist', () => {
  const f = one('homing-still-triggered.log');
  assert.equal(f.severity, 'warning');
  assert.match(f.detail, /\by\b/);
  assert.match(f.detail, /homing_retract_dist/);
  assert.match(f.fix, /QUERY_ENDSTOPS/);
});

test('probe-triggered-early: says to check the probe state when it is not touching anything', () => {
  const f = one('probe-triggered-early.log');
  assert.equal(f.severity, 'warning');
  assert.match(f.fix, /QUERY_PROBE/);
});

test('homing-comm-timeout: quotes the 10 ms latency Klipper asks for, plain and wrapped', () => {
  for (const file of ['homing-comm-timeout.log', 'homing-comm-timeout-wrapped.log']) {
    const f = one(file);
    assert.equal(f.severity, 'warning');
    assert.match(f.detail, /10 ?ms/);
    assert.match(f.fix, /same micro-controller/);
  }
});

test('extrude-cold: names min_extrude_temp', () => {
  const f = one('extrude-cold.log');
  assert.equal(f.severity, 'warning');
  assert.match(f.detail, /min_extrude_temp/);
  assert.equal(f.evidence.length, 2, 'both lines of the message');
});

test('extrude-only-too-long: gives the distance and the limit Klipper printed', () => {
  const f = one('extrude-only-too-long.log');
  assert.match(f.detail, /60\.000 ?mm/);
  assert.match(f.detail, /50\.000 ?mm/);
  assert.match(f.detail, /max_extrude_only_distance/);
});

test('extrude-cross-section: gives the area and the limit Klipper printed', () => {
  const f = one('extrude-cross-section.log');
  assert.match(f.detail, /2\.640/);
  assert.match(f.detail, /0\.640/);
  assert.match(f.detail, /max_extrude_cross_section/);
});

test('bltouch-verify: the sensor message and the raise message get their own setting', () => {
  assert.match(one('bltouch-verify-sensor.log').fix, /pin_up_touch_mode_reports_triggered/);
  assert.match(one('bltouch-raise.log').fix, /pin_up_reports_not_triggered/);
});

test('command-error rules ignore the same words in a dump after a shutdown, and part way along a line', () => {
  assert.deepEqual(ids(crash('command-errors-in-dump.log')), ['mcu-lost-communication']);
  assert.deepEqual(ids(crash('command-errors-midline.log')), ['no-failure-found']);
});

test('a command error does not hide a later real shutdown', () => {
  const text = fixture('homing-no-trigger.log') + fixture('timer-too-close.log').replace(/^(?:#.*\n)+/, '');
  const r = analyze(text).crash;
  assert.ok(ids(r).includes('mcu-timer-too-close'), ids(r).join());
});

// MCU shutdown reasons

test('mcu-max-duration: says which kind of output and where the limit is documented', () => {
  const d = one('max-duration-digital.log');
  assert.equal(d.severity, 'error');
  assert.match(d.detail, /digital out/);
  assert.match(d.detail, /max_duration/);
  assert.match(one('max-duration-pwm.log').detail, /pwm/);
});

test('mcu-max-duration does not fire on Missed scheduling, which shares the opening words', () => {
  assert.deepEqual(ids(crash('missed-scheduling.log')), ['mcu-missed-scheduling']);
});

test('mcu-linux-bus-open: points at raspi-config for the bus named', () => {
  const spi = one('linux-spi-open.log');
  assert.match(spi.detail, /SPI/);
  assert.match(spi.fix, /raspi-config/);
  assert.match(one('linux-i2c-open.log').fix, /I2C/);
});

test('mcu-linux-bus-open does not fire on a serial port that will not open, or on the GPIO chip reason', () => {
  assert.deepEqual(ids(crash('connect-failed.log')), ['mcu-connect-failed']);
  assert.deepEqual(ids(crash('linux-gpio-open.log')), ['crash-unknown-reason']);
});

// CAN

test('mcu-connect-failed: a board that answers with another uuid is told apart from a CAN port that is down', () => {
  const mismatch = one('can-uuid-mismatch.log');
  assert.match(mismatch.detail, /canbus_uuid/);
  assert.match(mismatch.detail, /different|not the one|does not match/i);
  assert.match(mismatch.fix, /canbus_query/);
  const down = one('can-port-down.log');
  assert.match(down.detail, /Network is down/);
  assert.doesNotMatch(down.detail, /does not match/i);
});

test('can-uuid-invalid: says what a canbus_uuid looks like', () => {
  const f = one('can-uuid-invalid.log');
  assert.equal(f.severity, 'error');
  assert.match(f.fix, /canbus_query/);
});

// Config errors Klipper raises from pins, choices and drivers

const CONFIG_ERRORS = {
  'config-error-pin-twice.log': [/PB13/, /used multiple times|more than once/i],
  'config-error-chip-name.log': [/toolhead/, /\[mcu toolhead\]/],
  'config-error-pin-description.log': [/!\^PA1/, /\^/],
  'config-error-choice.log': [/microsteps/, /17/],
  'config-error-kinematics.log': [/cartesion/, /kinematics/],
  'config-error-tmc-section.log': [/stepper_q/, /driver/],
  'config-error-sensor.log': [/EPCOS 100k/, /sensor_type/],
};
for (const [file, res] of Object.entries(CONFIG_ERRORS)) {
  test(`config-error explains ${file}`, () => {
    const f = one(file);
    for (const re of res) assert.match(f.detail + ' ' + f.fix, re);
    assert.doesNotMatch(f.detail, /^Klipper stopped at startup with "Config error": [^.]*\.$/, 'a generic fallback');
  });
}

// Config lints

test('pin-used-twice: finds each repeated pin, even with ! or mcu: in front, and not a shareable one', () => {
  const found = only('pin-twice.cfg', 'pin-used-twice');
  assert.equal(found.length, 3, found.map((f) => f.title).join(' | '));
  const titles = found.map((f) => f.title).join(' ');
  for (const pin of ['PB13', 'PB0', 'PC8']) assert.match(titles, new RegExp(pin));
  assert.doesNotMatch(titles, /PB14/);
  assert.ok(found.every((f) => f.severity === 'error' && f.evidence.length >= 2));
});

test('pin-used-twice stays quiet for shared enable pins and for pins on different chips', () => {
  assert.deepEqual(ids(cfg('pin-sharing-ok.cfg')), []);
});

test('pin-used-twice stays quiet for a pin named in duplicate_pin_override', () => {
  assert.deepEqual(ids(cfg('pin-twice-override.cfg')), []);
});

test('pin-used-twice does not read an include as a second use', () => {
  const r = analyze('[include other.cfg]\n[printer]\nkinematics: none\nmax_velocity: 1\nmax_accel: 1\n[input_shaper]\n[stepper_x]\nstep_pin: PA1\ndir_pin: PA2\n');
  assert.ok(!ids(r.config).includes('pin-used-twice'));
});

test('tmc-microsteps: flags a value the TMC code rejects, not 64, and not a stepper with no driver', () => {
  const found = only('tmc-microsteps.cfg', 'tmc-microsteps');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'error');
  assert.match(found[0].title, /stepper_x/);
  assert.match(found[0].detail, /17/);
  assert.match(found[0].fix, /256, 128, 64, 32, 16, 8, 4, 2 or 1/);
});

test('tmc-microsteps: a decimal value is called unparseable, a valid config is quiet', () => {
  const r = analyze(fixture('tmc-ok.cfg').replace('microsteps: 16', 'microsteps: 16.0'));
  const f = r.config.filter((x) => x.id === 'tmc-microsteps');
  assert.equal(f.length, 1);
  assert.match(f[0].detail, /Unable to parse/);
  assert.deepEqual(ids(cfg('tmc-ok.cfg')), []);
});

test('tmc-stepper-missing: names the section Klipper looks for', () => {
  const found = only('tmc-stepper-missing.cfg', 'tmc-stepper-missing');
  assert.equal(found.length, 1);
  assert.match(found[0].title, /stepper_q/);
  assert.equal(found[0].severity, 'error');
});

test('tmc-stepper-missing waits for the whole config when an include may hold the stepper', () => {
  const r = analyze('[include steppers.cfg]\n[tmc2209 stepper_x]\nuart_pin: PA1\nrun_current: 0.5\n');
  assert.ok(!ids(r.config).includes('tmc-stepper-missing'));
});

test('kinematics-missing-section: delta with cartesian sections wants stepper_a, b and c', () => {
  const found = only('kinematics-delta-cartesian-sections.cfg', 'kinematics-missing-section');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'error');
  for (const n of ['stepper_a', 'stepper_b', 'stepper_c']) assert.match(found[0].detail, new RegExp(n));
  assert.match(found[0].detail, /stepper_x/, 'says what it found instead');
});

test('kinematics-missing-section: corexy with no stepper_y', () => {
  const found = only('kinematics-corexy-no-y.cfg', 'kinematics-missing-section');
  assert.equal(found.length, 1);
  assert.match(found[0].title, /stepper_y/);
});

test('kinematics-missing-section: quiet when the sections are there, for none, and with an include', () => {
  for (const f of ['cartesian', 'delta', 'polar', 'deltesian'].map((k) => `kinematics-ok-${k}.cfg`)) {
    assert.deepEqual(ids(cfg(f)), [], f);
  }
  assert.deepEqual(ids(cfg('kinematics-none.cfg')), []);
  const r = analyze('[include steppers.cfg]\n[printer]\nkinematics: delta\nmax_velocity: 1\nmax_accel: 1\n[input_shaper]\n');
  assert.ok(!ids(r.config).includes('kinematics-missing-section'));
});

test('kinematics-missing-section: says nothing for a kinematics it has no list for', () => {
  const r = analyze('[printer]\nkinematics: something_from_a_fork\nmax_velocity: 1\nmax_accel: 1\n[input_shaper]\n');
  assert.ok(!ids(r.config).includes('kinematics-missing-section'));
});
