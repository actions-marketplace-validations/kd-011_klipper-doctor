import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../dist/index.js';
import { fixture, ids } from './helpers.mjs';

const RAW_RULES = [
  'duplicate-option',
  'duplicate-section',
  'save-config-duplicate',
  'gcode-unindented',
  'removed-option',
  'deprecated-option',
  'missing-required',
  'endstop-range',
  'safe-z-home-conflict',
  'tmc-stealthchop-threshold',
  'no-input-shaper',
];

test('raw printer.cfg: only the config report runs', () => {
  const r = analyze(fixture('clean.cfg'), { filename: 'printer.cfg' });
  assert.equal(r.meta.inputKind, 'printer.cfg');
  assert.deepEqual(r.crash, []);
  assert.equal(r.meta.sessions, 0);
  assert.equal(r.meta.analysedSession, 0);
  assert.deepEqual(r.meta.mcus, []);
});

test('clean.cfg fires no rule (SAVE_CONFIG values merge, comments and blank lines in macros are fine)', () => {
  assert.deepEqual(analyze(fixture('clean.cfg')).config, []);
});

test('all-rules.cfg fires every raw config rule', () => {
  const fired = new Set(ids(analyze(fixture('all-rules.cfg')).config));
  for (const id of RAW_RULES) assert.ok(fired.has(id), `${id} did not fire`);
});

test('includes.cfg gives exactly one note and keeps missing-required quiet', () => {
  const r = analyze(fixture('includes.cfg'));
  assert.deepEqual(ids(r.config), ['includes-not-read']);
  assert.equal(r.config[0].severity, 'note');
  assert.equal(r.config[0].evidence.length, 2);
});

const find = (r, id) => r.config.filter((f) => f.id === id);

test('duplicate-option names the section, option and every line', () => {
  const r = analyze(fixture('all-rules.cfg'));
  const [f] = find(r, 'duplicate-option');
  assert.equal(f.severity, 'warning');
  assert.match(f.title, /max_accel/);
  assert.equal(f.evidence.length, 2);
  assert.match(f.detail, /last/i);
});

test('duplicate-option treats option names case-insensitively, like Klipper', () => {
  const r = analyze('[printer]\nkinematics: cartesian\nMax_Velocity: 100\nmax_velocity: 200\nmax_accel: 1\n[input_shaper]\n');
  assert.deepEqual(ids(find(r, 'duplicate-option')), ['duplicate-option']);
});

test('duplicate-section is a warning that names the section', () => {
  const [f] = find(analyze(fixture('all-rules.cfg')), 'duplicate-section');
  assert.equal(f.severity, 'warning');
  assert.match(f.title, /\[fan\]/);
  assert.equal(f.evidence.length, 2);
});

test('save-config-duplicate says the SAVE_CONFIG value is ignored', () => {
  const [f] = find(analyze(fixture('all-rules.cfg')), 'save-config-duplicate');
  assert.match(f.title, /pid_kp/);
  assert.match(f.detail, /ignored/i);
  assert.equal(f.evidence.length, 2);
});

test('gcode-unindented is an error and points at the column-0 line', () => {
  const [f] = find(analyze(fixture('all-rules.cfg')), 'gcode-unindented');
  assert.equal(f.severity, 'error');
  assert.equal(f.evidence[0].text, 'M117 Homing finished');
});

test('gcode-unindented ignores real options after a macro body', () => {
  const r = analyze('[gcode_macro A]\ngcode:\n    G28\ndescription: hi\nvariable_x: 1\n[printer]\n[input_shaper]\n');
  assert.deepEqual(find(r, 'gcode-unindented'), []);
});

test('removed-option: each removed option gets its own finding with the date and replacement', () => {
  const r = analyze(fixture('all-rules.cfg'));
  const titles = find(r, 'removed-option').map((f) => f.title).join('\n');
  for (const needle of ['pin_map', 'step_distance', 'pid_integral_max', 'NTC 100K beta 3950']) {
    assert.match(titles, new RegExp(needle));
  }
  const pid = find(r, 'removed-option').find((f) => /pid_integral_max/.test(f.title));
  assert.match(pid.detail, /2022-04-07|2021-11-02/);
});

test('removed-option works on the config dumped inside a log', () => {
  const r = analyze(fixture('config-findings.log'));
  assert.ok(ids(r.config).includes('removed-option'));
  const f = find(r, 'removed-option')[0];
  const lines = fixture('config-findings.log').split('\n');
  assert.equal(lines[f.evidence[0].line - 1], f.evidence[0].text);
});

test('deprecated-option: probe_eddy_current z_offset', () => {
  const [f] = find(analyze(fixture('all-rules.cfg')), 'deprecated-option');
  assert.match(f.title, /z_offset/);
  assert.match(f.fix, /descend_z/);
});

test('missing-required names each missing option', () => {
  const titles = find(analyze(fixture('all-rules.cfg')), 'missing-required').map((f) => f.title).join('\n');
  assert.match(titles, /max_velocity/);
  assert.match(titles, /rotation_distance/);
  assert.match(titles, /stepper_z/);
});

test('missing-required does not fire on a probe-based z endstop', () => {
  const cfg = fixture('clean.cfg').replace('endstop_pin: ^PC2', 'endstop_pin: probe:z_virtual_endstop');
  assert.deepEqual(find(analyze(cfg), 'missing-required'), []);
});

test('endstop-range flags position_endstop outside the axis', () => {
  const [f] = find(analyze(fixture('all-rules.cfg')), 'endstop-range');
  assert.equal(f.severity, 'error');
  assert.match(f.title, /stepper_y/);
  assert.match(f.detail, /300/);
});

test('endstop-range: homing_positive_dir contradicting position_endstop', () => {
  const cfg = fixture('clean.cfg').replace('position_endstop: 0\nposition_max: 235\nhoming_speed: 50\n\n[stepper_y]', 'position_endstop: 0\nposition_max: 235\nhoming_positive_dir: true\nhoming_speed: 50\n\n[stepper_y]');
  const f = find(analyze(cfg), 'endstop-range');
  assert.equal(f.length, 1);
  assert.match(f[0].title, /stepper_x/);
});

test('endstop-range: endstop in the middle of the axis with no homing_positive_dir', () => {
  const cfg = fixture('clean.cfg').replace('position_endstop: 0\nposition_max: 235\nhoming_speed: 50\n\n[stepper_y]', 'position_endstop: 100\nposition_max: 235\nhoming_speed: 50\n\n[stepper_y]');
  const f = find(analyze(cfg), 'endstop-range');
  assert.equal(f.length, 1);
  assert.match(f[0].detail, /homing_positive_dir/);
});

test('safe-z-home-conflict is an error', () => {
  const [f] = find(analyze(fixture('all-rules.cfg')), 'safe-z-home-conflict');
  assert.equal(f.severity, 'error');
  assert.equal(f.evidence.length, 2);
});

test('tmc-stealthchop-threshold flags values other than unset/0 and 999999', () => {
  const r = analyze(fixture('all-rules.cfg'));
  const [f] = find(r, 'tmc-stealthchop-threshold');
  assert.equal(f.severity, 'note');
  assert.match(f.title, /stepper_y/);
  assert.deepEqual(find(analyze(fixture('clean.cfg')), 'tmc-stealthchop-threshold'), []);
});

test('no-input-shaper is a note, not a warning', () => {
  const [f] = find(analyze(fixture('all-rules.cfg')), 'no-input-shaper');
  assert.equal(f.severity, 'note');
});

test('a config dumped inside a log is analysed (tab-indented macros, lowercased options)', () => {
  const r = analyze(fixture('clean.log'));
  assert.deepEqual(r.config, []);
});

test('truncated log: one note says there is no config dump to read', () => {
  const r = analyze(fixture('truncated.log'));
  assert.deepEqual(ids(r.config), ['no-config-dump']);
  assert.equal(r.config[0].severity, 'note');
});

test('--config-only style input: a log with no failure still gets a config report', () => {
  const r = analyze(fixture('config-findings.log'));
  assert.deepEqual(ids(r.crash), ['no-failure-found']);
  assert.ok(ids(r.config).length > 0);
});

test('rule text never contains an em dash', () => {
  for (const f of ['all-rules.cfg', 'includes.cfg', 'config-findings.log', 'timer-too-close.log', 'protocol-mismatch.log', 'unknown-reason.log']) {
    const r = analyze(fixture(f));
    for (const x of [...r.config, ...r.crash]) {
      assert.ok(!/[—–]/.test([x.title, x.detail, x.fix].join(' ')), `${f} ${x.id}`);
    }
  }
});

test('unparseable-line: a stray line outside any macro is an error, not a gcode finding', () => {
  const r = analyze('[printer]\nkinematics: cartesian\nthis line has no delimiter\n[input_shaper]\n');
  assert.deepEqual(ids(r.config.filter((f) => f.id === 'unparseable-line')), ['unparseable-line']);
  assert.deepEqual(r.config.filter((f) => f.id === 'gcode-unindented'), []);
});

test('removed-option is an error when the log\'s own Klipper release is newer than the removal', () => {
  const r = analyze(fixture('config-findings.log'));
  assert.equal(find(r, 'removed-option')[0].severity, 'error');
  assert.match(find(r, 'removed-option')[0].detail, /v0\.12\.0-250/);
  const raw = analyze(fixture('all-rules.cfg'));
  assert.equal(find(raw, 'removed-option')[0].severity, 'warning');
});

// Klipper reads the stepper options of an [extruder] section only when one of step_pin, dir_pin or
// rotation_distance is present (klippy/kinematics/extruder.py PrinterExtruder), so an extruder driven
// by an [extruder_stepper] section is valid with none of them.
const EXTRUDER_NO_STEPPER = `[printer]
kinematics: none
max_velocity: 300
max_accel: 3000

[extruder]
nozzle_diameter: 0.4
filament_diameter: 1.75
heater_pin: PA1
sensor_type: EPCOS 100K B57560G104F
sensor_pin: PA2
control: pid
pid_kp: 20
pid_ki: 1
pid_kd: 100
min_temp: 0
max_temp: 270

[extruder_stepper es]
extruder: extruder
step_pin: PB3
dir_pin: PB4
microsteps: 16
rotation_distance: 33.5

[input_shaper]
`;

test('missing-required: an [extruder] with no stepper options at all is valid', () => {
  assert.deepEqual(find(analyze(EXTRUDER_NO_STEPPER), 'missing-required'), []);
});

test('missing-required: the same extruder inside a klippy.log dump is not flagged either', () => {
  const log = `Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\n===== Config file =====\n${EXTRUDER_NO_STEPPER.replace(/: /g, ' = ')}=======================\n`;
  assert.deepEqual(find(analyze(log), 'missing-required'), []);
});

test('missing-required: once an [extruder] sets any stepper option, the others are required', () => {
  for (const [given, want] of [
    ['step_pin: PB3', ['dir_pin', 'microsteps', 'rotation_distance']],
    ['rotation_distance: 33.5', ['step_pin', 'dir_pin', 'microsteps']],
    ['dir_pin: PB4', ['step_pin', 'microsteps', 'rotation_distance']],
  ]) {
    const cfg = EXTRUDER_NO_STEPPER.replace('heater_pin: PA1', `heater_pin: PA1\n${given}`);
    const [f] = find(analyze(cfg), 'missing-required');
    assert.ok(f, given);
    assert.match(f.title, /\[extruder\]/);
    for (const o of want) assert.match(f.title, new RegExp(o), `${given} -> ${o}`);
  }
});

test('missing-required: position_max is still required when the z endstop is the probe', () => {
  const cfg = fixture('clean.cfg')
    .replace('endstop_pin: ^PC2', 'endstop_pin: probe:z_virtual_endstop')
    .replace('position_max: 250\n', '');
  const [f] = find(analyze(cfg), 'missing-required');
  assert.ok(f);
  assert.match(f.title, /\[stepper_z\].*position_max/);
  assert.doesNotMatch(f.title, /position_endstop/);
});
