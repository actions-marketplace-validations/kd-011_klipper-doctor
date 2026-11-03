// Acceptance tests for the maintenance kit: Dependabot config, the auto-merge
// gate, CI shape, the weekly upkeep job, hygiene files and the dossier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { root } from './helpers.mjs';

const read = (f) => readFileSync(join(root, f), 'utf8');
const WORKFLOWS = readdirSync(join(root, '.github/workflows')).filter((f) => f.endsWith('.yml'));
const GATE = join(root, '.github/scripts/automerge-eligible.mjs');

test('dependabot: npm and actions, weekly, grouped minor and patch, with a cooldown', () => {
  const y = read('.github/dependabot.yml');
  assert.match(y, /package-ecosystem: npm/);
  assert.match(y, /package-ecosystem: github-actions/);
  assert.doesNotMatch(y, /package-ecosystem: gomod/);
  assert.equal([...y.matchAll(/interval: weekly/g)].length, 2);
  assert.doesNotMatch(y, /interval: (daily|monthly)/);
  assert.equal([...y.matchAll(/cooldown:\s*\n\s+default-days: 7/g)].length, 2);
  assert.equal([...y.matchAll(/update-types:\s*\n\s+- minor\s*\n\s+- patch/g)].length, 2);
});

test('automerge workflow: pull_request only, dependabot author, same-repo head', () => {
  const y = read('.github/workflows/dependabot-automerge.yml').replace(/^\s*#.*$/gm, '');
  assert.match(y, /^on:\s*\n\s+pull_request:/m);
  assert.doesNotMatch(y, /pull_request_target/);
  assert.match(y, /github\.event\.pull_request\.user\.login == 'dependabot\[bot\]'/);
  assert.match(y, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(y, /gh pr merge --auto --squash/);
  assert.match(y, /^permissions: \{\}/m, 'top-level permissions must be empty');
});

test('no workflow expands attacker-controlled PR or issue text', () => {
  const UNTRUSTED = /\$\{\{\s*github\.(head_ref|event\.(pull_request\.(title|body|head\.(ref|label))|issue\.(title|body)|comment\.body|review\.body))/;
  for (const f of WORKFLOWS) assert.doesNotMatch(read(`.github/workflows/${f}`), UNTRUSTED, f);
});

test('every third-party action is pinned by full SHA', () => {
  for (const f of WORKFLOWS) {
    for (const m of read(`.github/workflows/${f}`).matchAll(/uses:\s*([^\s#]+)/g)) {
      const ref = m[1];
      if (ref.startsWith('actions/') || ref.startsWith('./')) continue;
      assert.match(ref, /@[0-9a-f]{40}$/, `${f}: ${ref}`);
    }
  }
});

test('every workflow declares least-privilege permissions', () => {
  for (const f of WORKFLOWS) {
    const y = read(`.github/workflows/${f}`);
    assert.match(y, /^permissions:/m, `${f} needs top-level permissions`);
    assert.doesNotMatch(y, /permissions:\s*write-all/);
  }
});

const gate = (deps) => spawnSync(process.execPath, [GATE], { env: { ...process.env, DEPS: JSON.stringify(deps) }, encoding: 'utf8' });
const dep = (packageEcosystem, dependencyName, updateType) => ({ packageEcosystem, dependencyName, updateType });

test('gate: npm patch and minor merge, majors wait for a human', () => {
  assert.equal(gate([dep('npm_and_yarn', 'typescript', 'version-update:semver-patch')]).status, 0);
  assert.equal(gate([dep('npm_and_yarn', 'typescript', 'version-update:semver-minor')]).status, 0);
  assert.notEqual(gate([dep('npm_and_yarn', 'typescript', 'version-update:semver-major')]).status, 0);
});

test('gate: github-actions merge only from the actions/ org, majors included', () => {
  assert.equal(gate([dep('github_actions', 'actions/checkout', 'version-update:semver-major')]).status, 0);
  assert.equal(gate([dep('github_actions', 'actions/setup-node', 'version-update:semver-minor')]).status, 0);
  assert.notEqual(gate([dep('github_actions', 'someone/else', 'version-update:semver-patch')]).status, 0);
  assert.notEqual(gate([dep('github_actions', 'actions-evil/checkout', 'version-update:semver-major')]).status, 0);
  assert.notEqual(gate([dep('github_actions', 'dependabot/fetch-metadata', 'version-update:semver-major')]).status, 0);
});

test('gate: one ineligible dependency in a group blocks the whole PR', () => {
  const mixed = [dep('npm_and_yarn', 'a', 'version-update:semver-patch'), dep('npm_and_yarn', 'b', 'version-update:semver-major')];
  assert.notEqual(gate(mixed).status, 0);
});

test('gate: empty, malformed or missing metadata never merges', () => {
  assert.notEqual(gate([]).status, 0);
  assert.notEqual(spawnSync(process.execPath, [GATE], { env: { ...process.env, DEPS: 'not json' }, encoding: 'utf8' }).status, 0);
  const noEnv = { ...process.env };
  delete noEnv.DEPS;
  assert.notEqual(spawnSync(process.execPath, [GATE], { env: noEnv, encoding: 'utf8' }).status, 0);
  assert.notEqual(gate([dep('npm_and_yarn', 'a', '')]).status, 0);
  assert.notEqual(gate([{ packageEcosystem: 'docker', dependencyName: 'node', updateType: 'version-update:semver-patch' }]).status, 0);
});

test('ci: weekly schedule, and the matrix names match the ruleset', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /schedule:\s*\n\s+- cron:/);
  assert.match(ci, /name: npm test \(\$\{\{ matrix\.os \}\}, node \$\{\{ matrix\.node \}\}\)/);
  assert.match(ci, /dist is up to date/, 'the dist check stays');
  assert.match(ci, /Rule table is up to date/, 'the rule table check stays');
  const os = ci.match(/os: \[([^\]]+)\]/)[1].split(',').map((s) => s.trim());
  const node = ci.match(/node: \[([^\]]+)\]/)[1].split(',').map((s) => s.trim());
  const names = os.flatMap((o) => node.map((n) => `npm test (${o}, node ${n})`)).sort();
  const ruleset = JSON.parse(read('.github/rulesets/main.json'));
  const rule = ruleset.rules.find((r) => r.type === 'required_status_checks');
  assert.deepEqual(rule.parameters.required_status_checks.map((c) => c.context).sort(), names);
  assert.deepEqual(ruleset.bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]);
  assert.equal(ruleset.target, 'branch');
  assert.deepEqual(ruleset.conditions.ref_name.include, ['refs/heads/main']);
  assert.match(read('README.md'), /actions\/workflows\/ci\.yml\/badge\.svg/);
});

test('publish workflow runs only for a push to main that changes package.json: no tag, nothing scheduled, nothing dispatched', () => {
  const y = read('.github/workflows/publish.yml').replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(y, /tags:/);
  assert.match(y, /branches: \[main\]\n\s+paths: \[package\.json\]/);
  assert.doesNotMatch(y, /schedule:/);
  assert.doesNotMatch(y, /workflow_dispatch/);
});

test('upkeep: weekly, link check plus drift, pinned install, one issue each', () => {
  const y = read('.github/workflows/upkeep.yml');
  assert.match(y, /schedule:\s*\n\s+- cron: "[^"]+ \* \* \d"/);
  assert.match(y, /lycheeverse\/lychee-action@[0-9a-f]{40}/);
  assert.match(y, /--max-retries/);
  assert.match(y, /npm install -g github:kd-011\/dossier-scribe#v\d+\.\d+\.\d+\b/);
  assert.doesNotMatch(y, /dossier-scribe#(main|master)\b/);
  assert.match(y, /sync-issue\.sh link-rot/);
  assert.match(y, /sync-issue\.sh dossier-drift/);
  assert.ok(existsSync(join(root, '.github/scripts/sync-issue.sh')));
});

test('hygiene files and templates exist, and SECURITY.md has no email address', () => {
  for (const f of ['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', '.github/PULL_REQUEST_TEMPLATE.md', '.github/ISSUE_TEMPLATE/config.yml']) {
    assert.ok(existsSync(join(root, f)), f);
  }
  const sec = read('SECURITY.md');
  assert.match(sec, /private vulnerability reporting/i);
  assert.doesNotMatch(sec, /[\w.+-]+@[\w-]+\.[\w.]+/);
});

test('kit files carry no private detail and no em dashes', () => {
  const files = [
    'CODE_OF_CONDUCT.md', 'dossier-scribe.json', 'dossiers/klipper-doctor.md', 'dossiers/.dossier-lock.json',
    '.github/dependabot.yml', '.github/PULL_REQUEST_TEMPLATE.md', '.github/rulesets/main.json',
    '.github/scripts/automerge-eligible.mjs', '.github/scripts/sync-issue.sh',
    ...WORKFLOWS.map((f) => `.github/workflows/${f}`),
  ];
  for (const f of files) {
    const t = read(f);
    assert.doesNotMatch(t, /—/, `${f}: em dash`);
    assert.doesNotMatch(t, new RegExp(['ky' + 'le', 'de' + 'boo', 'gmail', '/home/', 'cor' + 'tex', 'Co-Authored-By'].join('|'), 'i'), `${f}: private detail`);
  }
});

test('social preview is a 1280x640 PNG', () => {
  const b = readFileSync(join(root, '.github/social-preview.png'));
  assert.equal(b.subarray(1, 4).toString(), 'PNG');
  assert.equal(b.readUInt32BE(16), 1280);
  assert.equal(b.readUInt32BE(20), 640);
});

test('dossier: 5 to 15 claims, each cites a real file and a line range that exists, and the lock is present', () => {
  const doc = read('dossiers/klipper-doctor.md');
  assert.match(doc, /^---\nslug: klipper-doctor\n/);
  assert.match(doc, /last_verified: \d{4}-\d{2}-\d{2}/);
  const claims = doc.split('\n').filter((l) => /^- .*<!-- src: .* -->\s*$/.test(l));
  assert.ok(claims.length >= 5 && claims.length <= 15, `claims: ${claims.length}`);
  assert.deepEqual(JSON.parse(read('dossier-scribe.json')).collectors, ['package']);
  assert.ok(JSON.stringify(JSON.parse(read('dossiers/.dossier-lock.json'))).length > 100, 'lock is not empty');
  for (const line of claims) {
    const cites = line.match(/<!-- src: (.*) -->/)[1].split(',').map((s) => s.trim());
    for (const cite of cites) {
      const [path, range] = cite.split(':');
      assert.ok(existsSync(join(root, path)), `${cite}: no such file`);
      if (range) {
        const [a, b = a] = range.split('-').map(Number);
        const n = read(path).split('\n').length;
        assert.ok(a >= 1 && b >= a && b <= n, `${cite}: range outside the file (${n} lines)`);
      }
    }
  }
});

// sync-issue.sh against a stub `gh`: the stub reports one existing open issue (or none)
// and records every call it receives.
function runSync({ existing, existingBody = '', args }) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-issue-'));
  const log = join(dir, 'calls.log');
  const stub = `#!/bin/sh
echo "$*" >> "${log}"
case "$1 $2" in
  "label create") exit 0 ;;
  "issue list") echo '${JSON.stringify(existing ? [{ number: 7, title: 'T' }] : [])}' ;;
  "issue view") printf '%s' '${existingBody}' ;;
esac
`;
  writeFileSync(join(dir, 'gh'), stub, { mode: 0o755 });
  writeFileSync(join(dir, 'body.md'), 'problem text\n');
  const r = spawnSync('sh', [join(root, '.github/scripts/sync-issue.sh'), 'lbl', 'T', ...args.map((a) => (a === 'BODY' ? join(dir, 'body.md') : a))], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => /^issue (create|edit|close)/.test(l)) : [];
  return { status: r.status, calls };
}

const HAS_JQ = spawnSync('jq', ['--version']).status === 0;

test('sync-issue: opens one issue for a problem, never duplicates, closes when clean', { skip: !HAS_JQ && 'jq not installed' }, () => {
  assert.deepEqual(runSync({ existing: false, args: ['BODY'] }).calls.map((c) => c.split(' ').slice(0, 2).join(' ')), ['issue create']);
  assert.deepEqual(runSync({ existing: true, existingBody: 'old', args: ['BODY'] }).calls.map((c) => c.split(' ').slice(0, 3).join(' ')), ['issue edit 7']);
  assert.deepEqual(runSync({ existing: true, existingBody: 'problem text', args: ['BODY'] }).calls, [], 'unchanged body is left alone');
  assert.deepEqual(runSync({ existing: true, args: [] }).calls.map((c) => c.split(' ').slice(0, 3).join(' ')), ['issue close 7']);
  assert.deepEqual(runSync({ existing: false, args: [] }).calls, [], 'a clean run with no issue does nothing');
});
