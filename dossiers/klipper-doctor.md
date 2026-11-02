---
slug: klipper-doctor
name: klipper-doctor
repo: .
status: active
last_verified: 2026-11-02
tags: [cli, node, klipper, typescript]
---

A command line tool and library that reads a Klipper `klippy.log` or `printer.cfg`, explains why a print or session died, and lints the config. These claims are the README's main promises, each tied to the code that keeps it.

## Features

- Takes one file, a `klippy.log` or a `printer.cfg`, or reads stdin when given `-`. <!-- src: src/cli.ts:9-13 -->
- Exits 0 when no finding is an error, 1 when at least one is, and 2 for a usage or read error. <!-- src: src/cli.ts:24, src/cli.ts:78 -->
- Only the CLI touches the filesystem, and it reads the one file named or stdin. <!-- src: src/cli.ts:63 -->
- Has no runtime dependencies. <!-- src: CONTRIBUTING.md:19 -->
- Declares Node 18 as the minimum version. <!-- src: package.json:47-49 -->
- Gives every finding a severity of `error`, `warning` or `note`. <!-- src: src/core/types.ts:1 -->
- Gives every finding an id, a title, a detail, a one-line fix, an optional docs link and evidence lines with line numbers. <!-- src: src/core/types.ts:9-19 -->
- Lists errors first, then warnings, then notes. <!-- src: src/core/index.ts:18 -->
- Limits a finding's detail to 4000 characters and each evidence line to 2000, so a damaged file cannot produce a huge report. <!-- src: src/core/index.ts:46-52 -->
- When a log holds several Klipper starts, analyses the last one. <!-- src: src/core/index.ts:255 -->

## Architecture

- The engine is a pure function over text, exported as `analyze`, with `toMarkdown`, `toText` and `rulesMetadata` beside it. <!-- src: src/core/index.ts:14-15, src/core/index.ts:314, src/core/index.ts:333 -->
- The README rule table is generated from the engine's rule metadata. <!-- src: scripts/gen-rules-table.mjs:5-12 -->

## Deploy

- CI typechecks and tests on Node 18 and 22 for every pull request and once a week, and fails when `dist/` or the README rule table is out of date. <!-- src: .github/workflows/ci.yml:13, .github/workflows/ci.yml:28, .github/workflows/ci.yml:36-41 -->
- A version tag publishes to npm with provenance, but only when the tag matches `package.json`. <!-- src: .github/workflows/publish.yml:29-36 -->
