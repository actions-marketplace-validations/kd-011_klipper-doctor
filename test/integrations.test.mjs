import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, fixturePath } from './helpers.mjs';

const read = (p) => readFileSync(join(root, p), 'utf8');

// The run block of the first step that has one.
function runBlock(yaml) {
  const m = /^( *)run: \|\n((?:\1 {2}.*\n?|\n)+)/m.exec(yaml);
  assert.ok(m, 'no run block');
  return m[2].split('\n').map((l) => l.slice((m[1] ?? '').length + 2)).join('\n');
}

const action = read('action.yml');

test('action.yml is a composite action with files and ignore inputs', () => {
  assert.match(action, /^name: /m);
  assert.match(action, /^description: /m);
  assert.match(action, /^runs:\n  using: composite/m);
  assert.match(action, /^  files:\n    description: .+\n(?:    .+\n)*?    default: printer\.cfg/m);
  assert.match(action, /^  ignore:\n/m);
});

test('action.yml runs the committed build with the inputs passed through env, not spliced into the script', () => {
  const script = runBlock(action);
  assert.doesNotMatch(script, /\$\{\{/, 'inputs must reach the shell through env');
  assert.match(action, /shell: bash/);
  assert.match(action, /INPUT_FILES: \$\{\{ inputs\.files \}\}/);
  assert.match(action, /INPUT_IGNORE: \$\{\{ inputs\.ignore \}\}/);
  assert.match(script, /--format github/);
  assert.match(script, /\$GITHUB_ACTION_PATH\/dist\/cli\.js/);
});

function runAction(env, cwd = root) {
  return spawnSync('bash', ['-c', runBlock(action)], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_ACTION_PATH: root, ...env } });
}

test('the action script annotates a bad config and fails the step', () => {
  const r = runAction({ INPUT_FILES: 'test/fixtures/all-rules.cfg', INPUT_IGNORE: '' });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^::(error|warning) file=test\/fixtures\/all-rules\.cfg,line=\d+,/m);
});

test('the action script passes a clean config', () => {
  const r = runAction({ INPUT_FILES: 'test/fixtures/clean.cfg', INPUT_IGNORE: '' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('the action script takes several files and globs, and the ignore input', () => {
  const two = runAction({ INPUT_FILES: 'test/fixtures/clean.cfg test/fixtures/fragment.cfg', INPUT_IGNORE: '' });
  assert.equal(two.status, 0, two.stderr);
  assert.match(two.stdout, /file=test\/fixtures\/fragment\.cfg/);
  const glob = runAction({ INPUT_FILES: 'test/fixtures/kinematics-ok-*.cfg', INPUT_IGNORE: '' });
  assert.equal(glob.status, 0, glob.stderr);
  const loud = runAction({ INPUT_FILES: 'test/fixtures/all-rules.cfg', INPUT_IGNORE: '' });
  const ids = [...new Set([...loud.stdout.matchAll(/\[([a-z-]+)\]::/g)].map((m) => m[1]))];
  assert.ok(ids.length > 0);
  const quiet = runAction({ INPUT_FILES: 'test/fixtures/all-rules.cfg', INPUT_IGNORE: ids.join(',') });
  assert.equal(quiet.stdout, '');
});

test('the action script fails when a file is missing, not silently passes', () => {
  const r = runAction({ INPUT_FILES: 'nope.cfg', INPUT_IGNORE: '' });
  assert.equal(r.status, 2);
});

test('the action script does not run a shell command smuggled in through an input', () => {
  const r = runAction({ INPUT_FILES: 'test/fixtures/clean.cfg; echo pwned', INPUT_IGNORE: '$(echo pwned)' });
  assert.doesNotMatch(r.stdout, /^pwned$/m);
});

test('ci.yml tests the action by local path: one run that must pass, one that must fail', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /uses: \.\/\n/);
  assert.match(ci, /continue-on-error: true/);
  assert.match(ci, /steps\.\w+\.outcome == 'failure'/);
});

// pre-commit

const hooks = read('.pre-commit-hooks.yaml');

test('.pre-commit-hooks.yaml defines the klipper-doctor hook as a node hook for .cfg files', () => {
  assert.match(hooks, /^- id: klipper-doctor$/m);
  assert.match(hooks, /^ {2}name: klipper-doctor$/m);
  assert.match(hooks, /^ {2}entry: klipper-doctor$/m);
  assert.match(hooks, /^ {2}language: node$/m);
  assert.match(hooks, /^ {2}description: .+/m);
});

test('the hook\'s files pattern matches printer.cfg and other .cfg files, not other files', () => {
  const m = /^ {2}files: ['"]?(.+?)['"]?$/m.exec(hooks);
  assert.ok(m, 'no files: pattern');
  const re = new RegExp(m[1]);
  for (const f of ['printer.cfg', 'config/macros.cfg', 'a/b/mainsail.cfg']) assert.ok(re.test(f), f);
  for (const f of ['README.md', 'cfg', 'printer.cfg.bak', 'src/cfg.py']) assert.ok(!re.test(f), f);
});

test('the hook\'s entry works the way pre-commit calls it: several files at once, no tty', () => {
  const r = spawnSync(process.execPath, [join(root, 'dist', 'cli.js'), fixturePath('clean.cfg'), fixturePath('fragment.cfg')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const bad = spawnSync(process.execPath, [join(root, 'dist', 'cli.js'), fixturePath('clean.cfg'), fixturePath('all-rules.cfg')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});

test('package.json bin matches the hook entry', () => {
  assert.ok(JSON.parse(read('package.json')).bin['klipper-doctor']);
});
