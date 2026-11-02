# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-02

First release.

### Added
- Crash report from a `klippy.log`: 18 rules for MCU shutdowns, lost communication, TMC driver errors, heater verification, out-of-range moves and similar, plus a fallback for a shutdown reason no rule knows.
- Config report: 14 rules, a ShellCheck-style lint of the config for unparseable lines, gcode indentation, duplicate options and sections, removed and deprecated options, missing required options and more. Works on a `klippy.log` (Klipper writes the parsed config into it) or a plain `printer.cfg`.
- CLI with plain text, `--md` and `--json` output, `--config-only`, stdin via `-`, and exit codes 0, 1 and 2.
- Library export: `analyze`, `toMarkdown`, `toText` and `rulesMetadata`. ESM, zero runtime dependencies, runs in Node and in the browser.
- Every rule cites the Klipper docs or source it comes from, and the README rule table is generated from the rules' own metadata.

[0.1.0]: https://github.com/kd-011/klipper-doctor/releases/tag/v0.1.0
