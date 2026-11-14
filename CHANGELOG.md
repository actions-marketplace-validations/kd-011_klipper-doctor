# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.2] - 2026-11-14

No change to what the tool reports. This release is the first published through npm trusted publishing, with no stored token, and it carries the comment cleanup and dependency bumps made since 0.5.0.

## [0.5.0] - 2026-11-03

From reading 80 help threads on the Klipper forum against the report. The method and the results are in [docs/accuracy.md](docs/accuracy.md).

### Added
- `command-error`: a line that matches a message Klipper's source raises as a command error, such as `bed_mesh: min/max points too close together`, is now named, with the source file it comes from. The list has 219 messages, generated from Klipper at commit 0cee841 by `scripts/gen-command-errors.mjs`. These used to read as no failure.
- `mcu-version-differs`: a note when an MCU runs a different build from the host, which is what the `has deprecated code` warning is about. Builds of the same commit don't count as different.
- `mcu-config-while-shutdown`, `mcu-reset-failed` and `mcu-thermocouple-fault`, for the three unmatched messages seen most in the forum logs.

### Changed
- When the last session is clean, a command error in an earlier session is now reported, and the no-failure finding lists what the other sessions logged.
- An earlier session stuck on `Can not update MCU config as it is shutdown` now points back at the session that caused it.
- A log that ends while Klipper is still retrying its connection now says so, as a warning, where it used to say no failure.
- The README is short now. Usage, the rule table and examples moved to `docs/`, and `npm run docs` writes the rule table to `docs/rules.md`.

### Fixed
- `klipper-doctor http://host:7125` now also tries Moonraker's `logs` root when `/server/files/klippy.log` answers 404. On a real Moonraker that route answers 404 until Klipper connects, so the tool reported no log at the moment one was needed.
- A failed connect above the first `Start printer` line of a log is now its own session. It used to merge with the next run and could hide that run's shutdown.
- `moonraker.log` is now recognised and sent back with a pointer to `klippy.log`. Moonraker quotes Klipper's messages, so it could produce a misleading finding.
- A missing `klippy.log` and a directory argument get a plain message that says where the log is, in place of a raw `ENOENT` or `EISDIR`.

## [0.4.0] - 2026-11-02

### Added
- With no file argument, `klipper-doctor` reads `~/printer_data/logs/klippy.log` if it exists and says so on stderr, and otherwise prints the usage and exits 2.
- `klipper-doctor http://host:7125` downloads `klippy.log` through Moonraker's file API (`GET /server/files/klippy.log`), so a laptop can diagnose a printer whose host has no Node. `--api-key` sends the key from `MOONRAKER_API_KEY` (or `--api-key=VAR`) as `X-Api-Key` and never prints it. An unreachable host, authentication required, a rejected key, a redirect, a 404 and a timeout each get a plain error and exit 2. `--timeout` sets the wait.
- `--format text|json|md|github`. `--format github` prints `::error file=,line=::` workflow commands (and `::warning`, `::notice`) so GitHub annotates the file. `--json` and `--md` work as before. The library exports `toGithub`.
- `action.yml`: a composite GitHub Action that lints `.cfg` files with `--format github`, with `files` and `ignore` inputs. It is tested in `ci.yml` by local path.
- `.pre-commit-hooks.yaml`: a `klipper-doctor` hook for pre-commit.
- Suppressions: `--ignore id,id` and, in a `printer.cfg`, `# klipper-doctor: ignore <rule-id>` on the offending line or in the comment lines directly above it. Crash findings and `unusable-input` are never hidden. The library takes `ignore` in `analyze` options, reports `meta.suppressed`, and `rulesMetadata()` entries carry `suppressible`. The text and markdown reports say how many findings were hidden.
- Several files in one run (`klipper-doctor a.cfg b.cfg`), and `--` to end the options. With several files, text and markdown get a `==> file <==` heading each and JSON is an array of `{ file, report }`. One file keeps the output it had.
- `klipper-doctor completions bash|zsh|fish` prints a completion script. `--help` and the scripts are generated from one option table, and a test checks they agree.

### Changed
- Releases are automatic. `publish.yml` no longer waits for a tag. When a push to `main` changes `package.json` to a version npm doesn't have, it runs the checks, publishes with provenance, then creates the `v<version>` tag and a GitHub Release using that version's section of this file as the notes. It uses the `NPM_TOKEN` secret if there is one, and npm trusted publishing (OIDC) if not. `scripts/release.mjs` holds the version comparison and the changelog extraction.

## [0.3.0] - 2026-11-02

Messages in the new rules are from Klipper at commit 0cee841 (28 October 2026).

### Added
- Crash rules for command errors that stop a print while Klipper keeps running, reported as warnings: `homing-no-trigger` ("No trigger on ... after full movement"), `homing-still-triggered` ("Endstop ... still triggered after retract"), `probe-triggered-early` ("Probe triggered prior to movement"), `homing-comm-timeout` ("Communication timeout during homing"), `bltouch-verify` ("BLTouch failed to verify sensor state" and "BLTouch failed to raise probe"), `extrude-cold` ("Extrude below minimum temp"), `extrude-only-too-long` and `extrude-cross-section`.
- Crash rules for MCU shutdown reasons that used to land in `crash-unknown-reason`: `mcu-max-duration` (a digital out or PWM output left on without an update from the host) and `mcu-linux-bus-open` ("Unable to open spi device" and "Unable to open i2c device" on the Linux host MCU). Also `can-uuid-invalid` ("Invalid CAN uuid").
- `mcu-connect-failed` tells apart a CAN board that answered with a different `canbus_uuid` ("Failed to match canbus_uuid") from a CAN interface that cannot be opened.
- `config-error` explains seven more startup errors from Klipper's source: a pin used more than once, an unknown pin chip name, an invalid pin description, a value that is not a valid choice, a kinematics that failed to load, a TMC driver whose stepper section is missing, and an unknown temperature sensor.
- Config rules for what Klipper rejects at startup: `pin-used-twice` (step, dir, heater and fan pins, honouring `[duplicate_pin_override]`), `tmc-microsteps` (a stepper with a TMC driver and a microsteps value the driver code does not accept), `tmc-stepper-missing` and `kinematics-missing-section` (a `cartesian`, `corexy`, `delta`, `polar` or similar printer without the stepper sections that kinematics reads).

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

[0.4.0]: https://github.com/kd-011/klipper-doctor/releases/tag/v0.4.0
[0.3.0]: https://github.com/kd-011/klipper-doctor/releases/tag/v0.3.0
[0.2.0]: https://github.com/kd-011/klipper-doctor/releases/tag/v0.2.0
[0.1.0]: https://github.com/kd-011/klipper-doctor/releases/tag/v0.1.0
