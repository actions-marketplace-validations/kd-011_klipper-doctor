# Contributing

Bug reports and rule requests help most. Use the issue templates. A wrong diagnosis needs the Klipper version and a redacted log snippet. A new rule needs a link to the Klipper docs or source. Take anything private out of a log before you paste it.

## Add a rule

A rule is a small object: an id, a severity, a title, a detail, a fix, a `docs` link and a `check` function.

1. Find the claim in the Klipper docs or source. No source, no rule. Copy message strings from the source, not from memory, and put the file or page in a comment above the rule and in `docs`. Do not invent thresholds.
2. Add the rule in `src/core/rules/crash/` (pick the file for the subsystem) or `src/core/rules/config/`, and list it in that folder's `index.ts`.
3. Add a fixture in `scripts/make-fixtures.mjs` and run `npm run fixtures`. Fixtures are built from the message formats in the Klipper source. Never use a real person's log, even a public one.
4. Add the rule to the expectations in `test/crash.test.mjs` or `test/config.test.mjs`.
5. Run `npm test` (it builds first), then `npm run check` and `npm run docs` to refresh the README rule table. `dist/` is committed, so commit the rebuilt files too.
6. If the rule reads the config, run `npm run check-samples -- <path to a Klipper checkout>`. Every sample config has to come through with no error.

## Ground rules

- `src/core/` must stay free of Node APIs so it runs in a browser unchanged. Only `src/cli.ts` touches the filesystem.
- No runtime dependencies.
- Wording for findings is plain English: say what happened, the likely cause, and the fix. No em dashes, no marketing words.
- Fewer correct rules beat many shaky ones.

## Release

A release happens when a pull request that raises the version is merged. The workflow creates the tag.

1. In a pull request, move the Unreleased notes in `CHANGELOG.md` under a new `## [x.y.z] - date` heading. The GitHub Release notes are taken from that section, and the workflow stops before publishing if it is missing.
2. Run `npm version <patch|minor|major> --no-git-tag-version`. The `version` script writes the number into `src/core/version.ts` and rebuilds and stages `dist/`. Commit the result.
3. Merge. `.github/workflows/publish.yml` runs on the push to `main` that changes `package.json`. If that version is not on npm, it runs `npm run check`, `npm test`, the README table check and the `dist` check, publishes with `npm publish --provenance --access public`, then creates the `v<version>` tag and the GitHub Release. A merge that changes `package.json` without a new version (a dependency bump) does nothing.

`node scripts/release.mjs plan --version 0.3.0 --published 0.2.0 --release-exists false` shows what the workflow would decide, without touching anything. If a run fails after the publish, re-run the failed run from the Actions tab: it sees the version on npm and only finishes the tag and the Release.

npm authentication: the workflow uses the `NPM_TOKEN` repository secret when it is set (a granular token with publish rights on `klipper-doctor` and bypass 2FA on). Otherwise it uses npm trusted publishing over OIDC, which needs no secret. To switch, add a trusted publisher on npmjs.com (package Settings, Trusted publisher, GitHub Actions: repository `kd-011/klipper-doctor`, workflow `publish.yml`) and then delete the secret. The workflow installs npm 11 because trusted publishing needs npm 11.5.1 or later.

## Images

`npm run assets` regenerates the README and social images from the engine's real output. It needs a headless Chromium (set `CHROME_BIN` if it is not found).

By contributing you agree your work is released under the MIT licence.
