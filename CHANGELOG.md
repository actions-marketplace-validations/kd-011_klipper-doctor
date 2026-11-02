# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-02

### Fixed
- Wrong diagnosis: `mcu-command-request` fired on any shutdown, because every MCU reports "Command request" after the host stops it. It now fires only when an emergency stop was the event, and says where it came from. The real cause, or the raw reason, is shown instead.
- Wrong diagnosis: errors logged after the first shutdown, and text quoted in the request dumps, could add findings or name the wrong MCU. Rules now look only at what came before the shutdown and at the reason Klipper gave.
- "No failure found" on a log where Klipper was restarted after the crash. The finding now names the latest earlier session that failed, with its cause, fix and line numbers.
- `Unhandled exception`, `Internal error` and `MCU error during connect` now show the exception from the traceback instead of only the first line.
- TMC: a status of `ffffffff` was read as every fault at once, `cs_actual=0(Reset?)` and `se=0(Reset?)` were missed because of letter case, and `LowSideShort` was not recognised. `failed to init`, which Klipper survives, is now a warning.
- False config errors: indented options were not read, a file with no `[printer]` (one meant for `[include]`) was told it was missing `[printer]` options, a config dump cut off by the end of the file reported missing options, and logs old enough to use `step_distance` or `shared_heater` were told they were missing what replaced them. `gear_ratio` without `rotation_distance` is valid. Option names with unusual characters are no longer parse errors.
- The config parser now follows configparser's indent rules. It was compared with Klipper's reader over all 228 files in Klipper's `config/` directory.
- A blank or hex value is no longer read as a number by `endstop-range`.
- A log pasted with no file name is recognised from more of Klipper's lines. Rotated names such as `klippy.log.2026-11-01` count as logs.

### Added
- `removed-option` covers 20 more options and values from `Config_Changes.md`, back to 2019.
- `unusable-input`: an empty file, a binary or compressed file, or text that is neither a log nor a config gets one finding that says so, not one per line.
- `config-fragment`: a note for a file with no `[printer]`.
- `npm run bench`, and `npm run check-samples` to lint a Klipper checkout's sample configs.

### Changed
- `analyze` never throws, on any input.
- Input handling: BOM, CR, CR CR LF, NUL bytes (a power loss leaves these) and UTF-16 no longer change the result. A `printer.cfg` with a BOM is reported, because Klipper rejects it.
- Findings quote at most a few kB of a line, however long the line is.
- Performance: removed a quadratic regex that took over two minutes on a 500 kB run of spaces in a config line. It now takes milliseconds.

## [0.1.0] - 2026-11-02

First release.

### Added
- Crash report from a `klippy.log`: 18 rules for MCU shutdowns, lost communication, TMC driver errors, heater verification, out-of-range moves and similar, plus a fallback for a shutdown reason no rule knows.
- Config report: 14 rules, a ShellCheck-style lint of the config for unparseable lines, gcode indentation, duplicate options and sections, removed and deprecated options, missing required options and more. Works on a `klippy.log` (Klipper writes the parsed config into it) or a plain `printer.cfg`.
- CLI with plain text, `--md` and `--json` output, `--config-only`, stdin via `-`, and exit codes 0, 1 and 2.
- Library export: `analyze`, `toMarkdown`, `toText` and `rulesMetadata`. ESM, zero runtime dependencies, runs in Node and in the browser.
- Every rule cites the Klipper docs or source it comes from, and the README rule table is generated from the rules' own metadata.

[0.2.0]: https://github.com/kd-011/klipper-doctor/releases/tag/v0.2.0
[0.1.0]: https://github.com/kd-011/klipper-doctor/releases/tag/v0.1.0
