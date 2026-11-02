import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze, rulesMetadata, toMarkdown, toText } from '../dist/index.js';
import { fixture, fixturePath, ids, root } from './helpers.mjs';

// Bytes as the CLI reads them, including the invalid sequences a utf8 decode turns into U+FFFD.
const bytes = (name) => readFileSync(fixturePath(name)).toString('utf8');

test('BOM on a log: same diagnosis, same line numbers', () => {
  const plain = analyze(fixture('timer-too-close.log'));
  const bom = analyze(fixture('bom.log'));
  assert.deepEqual(ids(bom.crash), ids(plain.crash));
  assert.deepEqual(bom.crash[0].evidence, plain.crash[0].evidence);
  assert.equal(bom.meta.klipperVersion, plain.meta.klipperVersion);
});

test('a BOM right before the first Klipper line does not hide it', () => {
  const r = analyze("\ufeffStart printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\nMCU 'mcu' shutdown: Timer too close\n");
  assert.equal(r.meta.inputKind, 'klippy.log');
  assert.equal(r.crash[0].id, 'mcu-timer-too-close');
  const session = analyze("\ufeffStart printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\nStats 5010.0: x=1\n");
  assert.match(session.crash[0].detail, /about 10 s/);
});

test('a fork that prefixes each log line gets the same diagnosis', () => {
  const r = analyze(fixture('fork-prefix.log'));
  assert.equal(r.meta.inputKind, 'klippy.log');
  assert.equal(r.meta.sessions, 1);
  assert.deepEqual(ids(r.crash), ['mcu-timer-too-close']);
  assert.ok(r.crash[0].evidence.some((e) => e.text === 'Transition to shutdown state: MCU shutdown'));
  assert.equal(r.meta.klipperVersion, analyze(fixture('timer-too-close.log')).meta.klipperVersion);
});

test('mixed line endings: CRLF, LF, lone CR and CR CR LF all end a line', () => {
  const r = analyze(fixture('mixed-endings.log'));
  assert.deepEqual(ids(r.crash), ['mcu-timer-too-close']);
  assert.deepEqual(r.config, analyze(fixture('timer-too-close.log')).config);
  for (const f of r.crash) for (const e of f.evidence) assert.doesNotMatch(e.text, /\r/);
});

test('invalid UTF-8 in a log does not change the diagnosis', () => {
  const r = analyze(bytes('invalid-utf8.log'));
  assert.deepEqual(ids(r.crash), ['mcu-timer-too-close']);
});

test('NUL bytes from a power loss do not hide the Klipper start written straight after them', () => {
  const r = analyze(bytes('power-loss-nul.log'));
  assert.equal(r.meta.sessions, 2);
  assert.equal(r.meta.analysedSession, 2);
  assert.deepEqual(ids(r.crash), ['mcu-timer-too-close']);
  for (const f of r.crash) for (const e of f.evidence) assert.doesNotMatch(e.text, /\0/);
});

test('a UTF-16 copy of a log gets the same diagnosis', () => {
  const r = analyze(bytes('utf16.log'));
  assert.equal(r.meta.inputKind, 'klippy.log');
  assert.deepEqual(ids(r.crash), ['mcu-timer-too-close']);
  assert.equal(r.meta.klipperVersion, 'v0.12.0-250-g1a2b3c4d');
});

test('a truncated log with no config dump still gets its diagnosis', () => {
  const r = analyze(fixture('truncated.log'));
  assert.deepEqual(ids(r.crash), ['mcu-timer-too-close']);
  assert.deepEqual(ids(r.config), ['no-config-dump']);
});

test('a rotated log in the order Klipper writes it finds its config and version', () => {
  const r = analyze(fixture('rollover-real-order.log'));
  assert.equal(r.meta.sessions, 1);
  assert.equal(r.meta.klipperVersion, 'v0.12.0-250-g1a2b3c4d');
  assert.deepEqual(r.config, []);
});

test('rotated file names are logs even when the text has no marker', () => {
  for (const filename of ['klippy.log.2026-11-01', 'klippy.log.1', 'C:\\Users\\me\\klippy.log', 'KLIPPY.LOG', '/tmp/x/klippy.log.2026-11-01']) {
    assert.equal(analyze("MCU 'mcu' config: a=1\n", { filename }).meta.inputKind, 'klippy.log', filename);
  }
  assert.equal(analyze('[printer]\n', { filename: 'printer.cfg' }).meta.inputKind, 'printer.cfg');
});

test('a pasted snippet with no file name is recognised as a log, with no false parse errors', () => {
  for (const [text, id] of [
    ["MCU 'mcu' shutdown: Timer too close\n", 'mcu-timer-too-close'],
    ["Previous MCU 'mcu' shutdown: Timer too close\n", 'mcu-timer-too-close'],
    ['Heater extruder not heating at expected rate\n', 'heater-verify'],
    ["Unable to read tmc uart 'stepper_x' register IFCNT\n", 'tmc-comm'],
    ["TMC 'stepper_x' reports error: DRV_STATUS: 80070000 ot=1(OvertempError!)\n", 'tmc-reports-error'],
    ["Lost communication with MCU 'mcu'\n", 'mcu-lost-communication'],
    ['Move out of range: 1.000 2.000 3.000 [0.000]\n', 'move-out-of-range'],
  ]) {
    const r = analyze(text);
    assert.equal(r.meta.inputKind, 'klippy.log', text);
    assert.ok(ids(r.crash).includes(id), text);
    assert.deepEqual(r.config.filter((f) => f.severity === 'error'), [], text);
  }
});

test("another program's .log says it may not be a klippy.log", () => {
  const f = analyze(fixture('not-klippy.log'), { filename: 'moonraker.log' }).crash[0];
  assert.equal(f.id, 'no-failure-found');
  assert.match(f.detail, /klippy\.log/);
  assert.doesNotMatch(f.detail, /wrote no Stats lines/);
});

test("another program's log that quotes Klipper warns that it may not be a klippy.log", () => {
  const r = analyze(fixture('other-program-quoting.log'), { filename: 'KlipperScreen.log' });
  assert.match(r.config.find((f) => f.id === 'no-config-dump').title, /may not be a klippy\.log/);
});

test('text that quotes a few [sections] is not linted line by line as a config', () => {
  const lines = ['[preheat PLA]', 'extruder: 200'];
  for (let i = 0; i < 50; i++) lines.push(`2026-11-01 10:00:0${i % 10},000 screen.py - panel ${i} shown`);
  assert.deepEqual(ids(analyze(lines.join('\n') + '\n').config), ['unusable-input']);
});

test('a real config with a few bad lines keeps its line-by-line findings', () => {
  const lines = ['[printer]', 'kinematics: none', 'max_velocity: 1', 'max_accel: 1', '[input_shaper]', 'one bad line', 'another bad line'];
  assert.deepEqual(ids(analyze(lines.join('\n') + '\n').config), ['unparseable-line', 'unparseable-line']);
});

test('an empty input is a warning that says so, for a log and for a config', () => {
  for (const [text, filename] of [['', 'klippy.log'], ['', 'printer.cfg'], ['', undefined], ['\n \t\n', undefined], ['\0\0\0', undefined], ['\ufeff', undefined]]) {
    const r = analyze(text, { filename });
    assert.deepEqual(ids(r.config), ['unusable-input'], JSON.stringify(text));
    assert.equal(r.config[0].severity, 'warning');
    assert.deepEqual(r.crash, []);
  }
});

test('a file of only comments has nothing to check, and says so', () => {
  const r = analyze('# just a comment\n; and another\n', { filename: 'printer.cfg' });
  assert.deepEqual(ids(r.config), ['unusable-input']);
});

test('a binary file is one error finding however large it is', () => {
  const noise = readFileSync(fixturePath('binary.gz')).toString('utf8');
  const r = analyze(noise.repeat(200));
  assert.deepEqual(ids(r.config), ['unusable-input']);
  assert.equal(r.config[0].severity, 'error');
  assert.deepEqual(r.config[0].evidence, []);
  assert.deepEqual(analyze(noise, { filename: 'klippy.log' }).crash, []);
});

test('rule metadata lists the new input finding once', () => {
  const m = rulesMetadata();
  assert.equal(m.filter((r) => r.id === 'unusable-input').length, 1);
  assert.equal(m.filter((r) => r.id === 'config-fragment').length, 1);
  assert.equal(new Set(m.map((r) => r.id)).size, m.length);
});

test('very long lines: the diagnosis stands and no finding carries the whole line', () => {
  const huge = 'x'.repeat(5 * 1024 * 1024);
  const log = `Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\n${huge}\nTransition to shutdown state: MCU shutdown\nMCU 'mcu' shutdown: ${huge}\n`;
  const r = analyze(log, { filename: 'klippy.log' });
  assert.deepEqual(ids(r.crash), ['crash-unknown-reason']);
  assert.ok(JSON.stringify(r).length < 64 * 1024, 'report size');
  assert.ok(toText(r).length < 64 * 1024);
  assert.ok(toMarkdown(r).length < 64 * 1024);
  const cfg = analyze(`[printer]\nkinematics: none\nmax_velocity: 1\nmax_accel: 1\n[input_shaper]\n${huge}\n`, { filename: 'printer.cfg' });
  assert.deepEqual(ids(cfg.config), ['unparseable-line']);
  assert.ok(JSON.stringify(cfg).length < 64 * 1024);
});

test('many restarts: only the last session counts, and the count is right', () => {
  const one = fixture('clean.log');
  const r = analyze(one.repeat(2000) + fixture('timer-too-close.log'));
  assert.equal(r.meta.sessions, 2001);
  assert.equal(r.meta.analysedSession, 2001);
  assert.deepEqual(ids(r.crash), ['mcu-timer-too-close']);
});

// A small xorshift, seeded, so a failure here reproduces exactly.
function rng(seed) {
  let x = seed >>> 0 || 1;
  return (n) => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x % n;
  };
}

const JUNK = ['\0', '\r', '\n', '\ufeff', '\ufffd', '[', ']', "'", '"', ':', '=', ';', '#', ' ', '\t', '\\', '(', ')', '\u2028', '[include ', '===== Config file =====\n', '=======================\n', 'Transition to shutdown state: ', "MCU 'mcu' shutdown: ", 'Start printer at ', 'Traceback (most recent call last):\n', 'Config error\n', '#*# <---------------------- SAVE_CONFIG ---------------------->\n'];

function assertShape(r) {
  assert.ok(['klippy.log', 'printer.cfg'].includes(r.meta.inputKind));
  for (const f of [...r.crash, ...r.config]) {
    assert.doesNotMatch(f.title, /could not read this file/, f.detail);
    assert.ok(typeof f.id === 'string' && typeof f.title === 'string' && typeof f.detail === 'string');
    assert.ok(Array.isArray(f.evidence));
  }
  assert.equal(typeof toText(r), 'string');
  assert.equal(typeof toMarkdown(r), 'string');
}

test('malformed input never throws: seeded damage to every fixture', () => {
  const dir = join(root, 'test', 'fixtures');
  const files = readdirSync(dir).sort();
  const pick = rng(20261102);
  for (const name of files) {
    const base = readFileSync(join(dir, name)).toString('utf8').slice(0, 20000);
    for (let round = 0; round < 12; round++) {
      let s = base;
      const edits = 1 + pick(8);
      for (let e = 0; e < edits; e++) {
        const at = pick(s.length + 1);
        const kind = pick(4);
        if (kind === 0) s = s.slice(0, at);
        else if (kind === 1) s = s.slice(at);
        else if (kind === 2) s = s.slice(0, at) + JUNK[pick(JUNK.length)] + s.slice(at);
        else s = s.slice(0, at) + s.slice(at + pick(200));
      }
      for (const filename of [undefined, 'klippy.log', 'printer.cfg']) {
        assertShape(analyze(s, { filename }));
      }
    }
  }
});

test('random bytes never throw', () => {
  const pick = rng(7);
  for (let i = 0; i < 300; i++) {
    const b = Buffer.alloc(pick(4000));
    for (let j = 0; j < b.length; j++) b[j] = pick(256);
    assertShape(analyze(b.toString('utf8')));
    assertShape(analyze(b.toString('latin1'), { filename: 'klippy.log' }));
  }
});

test('input of the wrong type never throws', () => {
  for (const v of [undefined, null, 5, {}, [], true]) {
    assertShape(analyze(v));
    assertShape(analyze('', v));
  }
  assertShape(analyze('x', { filename: 5 }));
});

test('a value that throws when read as a string cannot take the report down', () => {
  const hostile = { toString() { throw new Error('nope'); } };
  assertShape(analyze(hostile));
});

test('an error inside the engine becomes a finding that says so, and asks for a report', () => {
  const r = analyze('[printer]\n', { get filename() { throw new Error('boom'); } });
  assert.deepEqual(ids(r.config), ['unusable-input']);
  assert.match(r.config[0].detail, /internal error.*boom/);
  assert.match(r.config[0].fix, /issues/);
});
