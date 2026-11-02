import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, fixturePath, fixture } from './helpers.mjs';
import { toGithub, analyze } from '../dist/index.js';

const cli = join(root, 'dist', 'cli.js');
const CFG = '[printer]\nkinematics: none\nmax_velocity: 300\nmax_accel: 3000\nmax_velocity: 200\n\n[extruder]\npid_integral_max: 0.2\n\n[gcode_macro X]\ngcode:\nM117 hi\n';

// A HOME with no printer_data in it, so a printer host's real log never leaks into a test.
const emptyHome = mkdtempSync(join(tmpdir(), 'kd-home-'));
const baseEnv = { ...process.env, HOME: emptyHome, USERPROFILE: emptyHome };
delete baseEnv.MOONRAKER_API_KEY;
delete baseEnv.NO_COLOR;

const run = (args, { input, env } = {}) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input, env: { ...baseEnv, ...env } });

// The stub server lives in this process, so the CLI must run without blocking the event loop.
function runAsync(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { env: { ...baseEnv, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function tmpCfg(name = 'printer.cfg', text = CFG) {
  const dir = mkdtempSync(join(tmpdir(), 'kd-cfg-'));
  const file = join(dir, name);
  writeFileSync(file, text);
  return { dir, file, done: () => rmSync(dir, { recursive: true }) };
}

// 1. Default path

test('no file: uses ~/printer_data/logs/klippy.log when it exists, and says so on stderr', () => {
  const home = mkdtempSync(join(tmpdir(), 'kd-home-'));
  mkdirSync(join(home, 'printer_data', 'logs'), { recursive: true });
  copyFileSync(fixturePath('timer-too-close.log'), join(home, 'printer_data', 'logs', 'klippy.log'));
  const r = run(['--json'], { env: { HOME: home, USERPROFILE: home } });
  rmSync(home, { recursive: true });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).crash[0].id, 'mcu-timer-too-close');
  assert.match(r.stderr, /using .*printer_data.*klippy\.log/i);
});

test('no file and no default log: usage on stderr and exit 2', () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage:/);
  assert.match(r.stderr, /printer_data[\\/]logs[\\/]klippy\.log/);
  assert.equal(r.stdout, '');
});

test('the default log is not used when a file is given', () => {
  const home = mkdtempSync(join(tmpdir(), 'kd-home-'));
  mkdirSync(join(home, 'printer_data', 'logs'), { recursive: true });
  copyFileSync(fixturePath('timer-too-close.log'), join(home, 'printer_data', 'logs', 'klippy.log'));
  const r = run(['--json', fixturePath('clean.log')], { env: { HOME: home, USERPROFILE: home } });
  rmSync(home, { recursive: true });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /using/i);
});

// 2. Moonraker

function stub(handler) {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    handler(req, res);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })),
  );
}
const close = (s) => new Promise((resolve) => { s.server.close(resolve); s.server.closeAllConnections?.(); });
const KEY = 'sekrit-key-0123456789';

test('a Moonraker URL fetches klippy.log through the file API and analyses it', async () => {
  const s = await stub((req, res) => { res.setHeader('content-type', 'text/plain'); res.end(fixture('timer-too-close.log')); });
  const r = await runAsync(['--json', s.url]);
  await close(s);
  assert.equal(s.seen[0].url, '/server/files/klippy.log');
  assert.equal(r.status, 1, r.stderr);
  assert.equal(JSON.parse(r.stdout).crash[0].id, 'mcu-timer-too-close');
  assert.equal(s.seen[0].headers['x-api-key'], undefined);
});

test('a trailing slash and a path prefix on the URL are kept', async () => {
  const s = await stub((req, res) => res.end(fixture('clean.log')));
  const a = await runAsync(['--json', s.url + '/']);
  const b = await runAsync(['--json', s.url + '/printer1/']);
  await close(s);
  assert.equal(a.status, 0, a.stderr);
  assert.deepEqual(s.seen.map((x) => x.url), ['/server/files/klippy.log', '/printer1/server/files/klippy.log']);
  assert.equal(b.status, 0, b.stderr);
});

test('--api-key sends X-Api-Key from MOONRAKER_API_KEY and never prints it', async () => {
  const s = await stub((req, res) => {
    if (req.headers['x-api-key'] !== KEY) { res.statusCode = 401; res.end('{"error":{"code":401,"message":"Unauthorized"}}'); return; }
    res.end(fixture('clean.log'));
  });
  const r = await runAsync(['--api-key', '--json', s.url], { MOONRAKER_API_KEY: KEY });
  const bad = await runAsync(['--api-key', s.url], { MOONRAKER_API_KEY: KEY + 'x' });
  await close(s);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(s.seen[0].headers['x-api-key'], KEY);
  for (const out of [r, bad]) assert.ok(!(out.stdout + out.stderr).includes(KEY), 'the key was echoed');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /rejected the API key/i);
});

test('--api-key=NAME reads the key from another variable', async () => {
  const s = await stub((req, res) => res.end(fixture('clean.log')));
  const r = await runAsync(['--api-key=PRINTER_KEY', '--json', s.url], { PRINTER_KEY: KEY });
  await close(s);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(s.seen[0].headers['x-api-key'], KEY);
});

test('the key is not sent unless --api-key is given', async () => {
  const s = await stub((req, res) => res.end(fixture('clean.log')));
  await runAsync(['--json', s.url], { MOONRAKER_API_KEY: KEY });
  await close(s);
  assert.equal(s.seen[0].headers['x-api-key'], undefined);
});

test('--api-key with the variable unset names the variable and exits 2 without connecting', async () => {
  const s = await stub((req, res) => res.end(fixture('clean.log')));
  const r = await runAsync(['--api-key', s.url]);
  const named = await runAsync(['--api-key=PRINTER_KEY', s.url]);
  await close(s);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /MOONRAKER_API_KEY/);
  assert.match(named.stderr, /PRINTER_KEY/);
  assert.equal(s.seen.length, 0);
});

test('--api-key=<the key itself> is refused without printing it', async () => {
  const s = await stub((req, res) => res.end(fixture('clean.log')));
  const r = await runAsync([`--api-key=${KEY}`, s.url]);
  await close(s);
  assert.equal(r.status, 2);
  assert.ok(!(r.stdout + r.stderr).includes(KEY), 'the key was echoed');
  assert.match(r.stderr, /name of an environment variable/);
  assert.equal(s.seen.length, 0);
});

test('401 without a key says authentication is needed and how to give a key', async () => {
  const s = await stub((req, res) => { res.statusCode = 401; res.end('{"error":{"code":401,"message":"Unauthorized"}}'); });
  const r = await runAsync([s.url]);
  await close(s);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /authentication/i);
  assert.match(r.stderr, /--api-key/);
  assert.match(r.stderr, /MOONRAKER_API_KEY/);
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/);
});

test('403 is reported as an auth failure too', async () => {
  const s = await stub((req, res) => { res.statusCode = 403; res.end('no'); });
  const r = await runAsync([s.url]);
  await close(s);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /authentication/i);
});

test('an unreachable host says it could not connect, with the address', async () => {
  const s = await stub(() => {});
  const url = s.url;
  await close(s);
  const r = await runAsync([url]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /could not reach/i);
  assert.ok(r.stderr.includes(url.replace('http://', '')), r.stderr);
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/);
});

test('a host name that does not exist gives the same kind of error', async () => {
  const r = await runAsync(['http://no-such-host.invalid:7125']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /could not reach/i);
});

test('404 says Moonraker has no klippy.log to give', async () => {
  const s = await stub((req, res) => { res.statusCode = 404; res.end('{}'); });
  const r = await runAsync([s.url]);
  await close(s);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /404/);
  assert.match(r.stderr, /klippy\.log/);
});

test('a redirect is reported, not followed, so the key cannot travel to another host', async () => {
  const other = await stub((req, res) => res.end(fixture('clean.log')));
  const s = await stub((req, res) => { res.statusCode = 301; res.setHeader('location', other.url + '/server/files/klippy.log'); res.end(); });
  const r = await runAsync(['--api-key', s.url], { MOONRAKER_API_KEY: KEY });
  await close(s);
  await close(other);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /redirect/i);
  assert.equal(other.seen.length, 0);
  assert.ok(!r.stderr.includes(KEY));
});

test('credentials inside the URL are refused and not echoed', async () => {
  const r = await runAsync(['http://user:hunter2@127.0.0.1:1']);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout + r.stderr, /hunter2/);
  assert.match(r.stderr, /--api-key/);
});

test('a server that never answers times out with a message, not a hang', async () => {
  const s = await stub(() => {});
  const r = await runAsync(['--timeout', '0.3', s.url]);
  await close(s);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /did not answer|timed out/i);
});

test('host:port without http:// gets a hint, since it would be read as a file', () => {
  const r = run(['voron.local:7125']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /http:\/\/voron\.local:7125/);
});

// 3. GitHub output

test('--format github prints workflow commands for the findings', () => {
  const t = tmpCfg();
  const r = run(['--format', 'github', t.file]);
  t.done();
  assert.equal(r.status, 1);
  const lines = r.stdout.trim().split('\n');
  assert.ok(lines.every((l) => /^::(error|warning|notice) /.test(l)), r.stdout);
  assert.ok(lines.some((l) => l.startsWith(`::error file=${t.file},line=7,title=`) && l.includes('missing-required')), r.stdout);
  assert.ok(lines.some((l) => l.startsWith('::warning ') && l.includes('line=3,') && l.includes('duplicate-option')));
  assert.ok(lines.some((l) => l.startsWith('::notice ') && l.includes('no-input-shaper') && !l.includes('line=')));
  assert.doesNotMatch(r.stdout, /\n\n|CONFIG|Result:/);
});

test('--format github output is one line per finding, with the fix in the message', () => {
  const t = tmpCfg();
  const r = run(['--format', 'github', t.file]);
  t.done();
  const n = analyze(CFG).config.length;
  assert.equal(r.stdout.trim().split('\n').length, n);
  assert.match(r.stdout, /Fix: /);
});

test('--format github escapes what GitHub treats as syntax', () => {
  const t = tmpCfg('a,b:c%d.cfg');
  const r = run(['--format', 'github', t.file]);
  t.done();
  assert.match(r.stdout, /file=[^,]*a%2Cb%3Ac%25d\.cfg,line=/);
  for (const line of r.stdout.trim().split('\n')) assert.ok(line.startsWith('::'), line);
});

test('toGithub: newlines and percent signs in a message are escaped, a property keeps no comma', () => {
  const report = analyze(CFG);
  report.config[0].detail = '100% sure\nsecond line';
  report.config[0].title = 'a, b: c';
  const out = toGithub(report, { file: 'x.cfg' });
  assert.match(out, /100%25 sure%0Asecond line/);
  assert.match(out, /title=a%2C b%3A c \[missing-required\]/);
  assert.equal(out.split('\n').length, report.config.length + report.crash.length);
});

test('toGithub without a file leaves file= out', () => {
  assert.doesNotMatch(toGithub(analyze(CFG)), /file=/);
});

test('--format github on a clean file prints nothing and exits 0', () => {
  const r = run(['--format', 'github', fixturePath('clean.cfg')]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('--format github also reports a crash in a log, with the log line', () => {
  const r = run(['--format', 'github', fixturePath('timer-too-close.log')]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^::error file=.*timer-too-close\.log,line=\d+,title=Timer too close/m);
});

test('--md and --json still work, --format accepts them, and conflicts are refused', () => {
  const f = fixturePath('timer-too-close.log');
  assert.match(run(['--md', f]).stdout, /\*\*Errors/);
  assert.equal(JSON.parse(run(['--format', 'json', f]).stdout).crash[0].id, 'mcu-timer-too-close');
  assert.match(run(['--format=md', f]).stdout, /\*\*Errors/);
  assert.match(run(['--format', 'text', '--no-color', f]).stdout, /Result:/);
  assert.equal(run(['--json', '--format', 'github', f]).status, 2);
  assert.equal(run(['--md', '--json', f]).status, 2);
  const bad = run(['--format', 'xml', f]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /github/);
});

// 5. Suppressions in the CLI

test('--ignore hides the named config findings and the exit code follows', () => {
  const t = tmpCfg();
  const loud = run(['--json', t.file]);
  const quiet = run(['--json', '--ignore', 'missing-required,gcode-unindented', t.file]);
  const eq = run(['--json', '--ignore=missing-required', '--ignore', 'gcode-unindented', t.file]);
  t.done();
  assert.equal(loud.status, 1);
  assert.equal(quiet.status, 0);
  const j = JSON.parse(quiet.stdout);
  assert.ok(!j.config.some((f) => f.id === 'missing-required'));
  assert.equal(j.meta.suppressed, 2);
  assert.equal(eq.status, 0);
});

test('the text report says how many findings were suppressed', () => {
  const t = tmpCfg();
  const r = run(['--no-color', '--ignore', 'no-input-shaper', t.file]);
  t.done();
  assert.match(r.stdout, /1 suppressed/);
});

test('--ignore with an unknown rule id exits 2 and names it', () => {
  const r = run(['--ignore', 'duplicate-optoin', fixturePath('clean.cfg')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /duplicate-optoin/);
});

test('--ignore refuses a crash rule and unusable-input, since those are never hidden', () => {
  for (const id of ['mcu-timer-too-close', 'crash-unknown-reason', 'unusable-input']) {
    const r = run(['--ignore', id, fixturePath('timer-too-close.log')]);
    assert.equal(r.status, 2, id);
    assert.match(r.stderr, new RegExp(id));
    assert.match(r.stderr, /cannot be ignored|never hidden/i);
  }
  assert.equal(run(['--ignore', 'mcu-timer-too-close', fixturePath('timer-too-close.log')]).status, 2);
});

test('--ignore without a value exits 2', () => {
  assert.equal(run([fixturePath('clean.cfg'), '--ignore']).status, 2);
});

test('an inline comment suppresses through the CLI, in every format', () => {
  const text = CFG.replace('pid_integral_max: 0.2', 'pid_integral_max: 0.2 # klipper-doctor: ignore removed-option');
  const t = tmpCfg('printer.cfg', text);
  const gh = run(['--format', 'github', t.file]).stdout;
  const md = run(['--md', t.file]).stdout;
  t.done();
  assert.doesNotMatch(gh, /removed-option|pid_integral_max/);
  assert.doesNotMatch(md, /pid_integral_max/);
});

// Several files, and --

test('several files: text gets a heading per file, the exit code is the worst', () => {
  const r = run(['--no-color', fixturePath('clean.cfg'), fixturePath('timer-too-close.log')]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /==> .*clean\.cfg <==/);
  assert.match(r.stdout, /==> .*timer-too-close\.log <==/);
});

test('several files: JSON is an array of file and report', () => {
  const r = run(['--json', fixturePath('clean.cfg'), fixturePath('timer-too-close.log')]);
  const j = JSON.parse(r.stdout);
  assert.equal(j.length, 2);
  assert.match(j[0].file, /clean\.cfg$/);
  assert.equal(j[1].report.crash[0].id, 'mcu-timer-too-close');
});

test('one file keeps the single-report JSON shape', () => {
  assert.equal(JSON.parse(run(['--json', fixturePath('clean.cfg')]).stdout).meta.inputKind, 'printer.cfg');
});

test('several files: github output names each file', () => {
  const a = tmpCfg('one.cfg');
  const b = tmpCfg('two.cfg');
  const r = run(['--format', 'github', a.file, b.file]);
  a.done();
  b.done();
  assert.ok(r.stdout.includes(`file=${a.file},`) && r.stdout.includes(`file=${b.file},`));
});

test('a file that cannot be read stops the run with exit 2, even among good ones', () => {
  const r = run([fixturePath('clean.cfg'), fixturePath('nope.cfg')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nope\.cfg/);
});

test('-- ends the options, so a file can start with a dash', () => {
  const t = tmpCfg('-odd.cfg');
  const r = run(['--json', '--', t.file]);
  t.done();
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).meta.inputKind, 'printer.cfg');
});

// 6. Completions

const SHELLS = ['bash', 'zsh', 'fish'];
// fish spells a long option as "-l name".
const flagsIn = (text) => new Set([...(text.match(/--[a-z][a-z-]*/g) ?? []), ...[...text.matchAll(/ -l ([a-z][a-z-]*)/g)].map((m) => '--' + m[1])]);

test('completions prints a script for bash, zsh and fish', () => {
  for (const sh of SHELLS) {
    const r = run(['completions', sh]);
    assert.equal(r.status, 0, `${sh}: ${r.stderr}`);
    assert.ok(r.stdout.length > 200, sh);
    assert.match(r.stdout, /klipper-doctor/);
  }
});

test('every option in --help is in every completion script, and the reverse', () => {
  const help = flagsIn(run(['--help']).stdout);
  assert.ok(help.has('--format') && help.has('--ignore') && help.has('--api-key'));
  for (const sh of SHELLS) {
    const got = flagsIn(run(['completions', sh]).stdout);
    for (const f of help) assert.ok(got.has(f), `${sh} is missing ${f}`);
    for (const f of got) assert.ok(help.has(f), `${sh} has ${f}, which --help does not list`);
  }
});

test('completions offer the format values, the shells and the config rule ids', () => {
  for (const sh of SHELLS) {
    const out = run(['completions', sh]).stdout;
    for (const word of ['github', 'json', 'md', 'text', 'bash', 'zsh', 'fish', 'duplicate-option', 'removed-option']) {
      assert.ok(out.includes(word), `${sh}: ${word}`);
    }
    assert.ok(!out.includes('mcu-timer-too-close'), `${sh} offers a rule --ignore refuses`);
  }
});

test('completions with no or an unknown shell exits 2 and lists the shells', () => {
  for (const args of [['completions'], ['completions', 'powershell']]) {
    const r = run(args);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /bash.*zsh.*fish/);
    assert.equal(r.stdout, '');
  }
});

test('the generated scripts parse in their own shell', (t) => {
  for (const [sh, args] of [['bash', ['-n']], ['zsh', ['-n']], ['fish', ['--no-execute']]]) {
    const out = run(['completions', sh]).stdout;
    const probe = spawnSync(sh, ['--version'], { encoding: 'utf8' });
    if (probe.error) { t.diagnostic(`${sh} is not installed, skipped`); continue; }
    const r = spawnSync(sh, [...args], { input: out, encoding: 'utf8' });
    assert.equal(r.status, 0, `${sh}: ${r.stderr}`);
  }
});

test('the bash script completes an option and a shell name', () => {
  const script = run(['completions', 'bash']).stdout;
  const probe = (line) => spawnSync('bash', ['-c', `${script}\nCOMP_WORDS=(${line}); COMP_CWORD=$((\${#COMP_WORDS[@]}-1)); _klipper_doctor; printf '%s\\n' "\${COMPREPLY[@]}"`], { encoding: 'utf8' });
  assert.match(probe('klipper-doctor --for').stdout, /^--format$/m);
  assert.match(probe('klipper-doctor --format ""').stdout, /^github$/m);
  assert.match(probe('klipper-doctor completions ""').stdout, /^zsh$/m);
  assert.match(probe('klipper-doctor --ignore dup').stdout, /^duplicate-option$/m);
});

test.after(() => rmSync(emptyHome, { recursive: true, force: true }));
