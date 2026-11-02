# Contributing

Bug reports and rule requests are the most useful thing. Use the issue templates: a wrong diagnosis needs the Klipper version and a redacted log snippet, a new rule needs a link to the Klipper docs or source. Remove anything private from a log before pasting it.

## Add a rule

A rule is a small object: an id, a severity, a title, a detail, a fix, a `docs` link and a `check` function.

1. Find the claim in the Klipper docs or source. No source, no rule. Copy any message string from the source rather than from memory, and put the file or page in a comment above the rule and in `docs`. Do not invent thresholds.
2. Add the rule in `src/core/rules/crash/` (pick the file for the subsystem) or `src/core/rules/config/`, and list it in that folder's `index.ts`.
3. Add a fixture in `scripts/make-fixtures.mjs` and run `npm run fixtures`. Fixtures are built from the message formats in the Klipper source. Never use a real person's log.
4. Add the rule to the expectations in `test/crash.test.mjs` or `test/config.test.mjs`.
5. Run `npm test` (it builds first), then `npm run check` and `npm run docs` to refresh the README rule table. `dist/` is committed, so commit the rebuilt files too.

## Ground rules

- `src/core/` must stay free of Node APIs so it runs in a browser unchanged. Only `src/cli.ts` touches the filesystem.
- No runtime dependencies.
- Wording for findings is plain English: say what happened, the likely cause, and the fix. No em dashes, no marketing words.
- Fewer correct rules beat many shaky ones.

## Images

`npm run assets` regenerates the README and social images from the engine's real output. It needs a headless Chromium (set `CHROME_BIN` if it is not found).

By contributing you agree your work is released under the MIT licence.
