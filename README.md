# klipper-doctor

[![npm](https://img.shields.io/npm/v/klipper-doctor?color=cb3837)](https://www.npmjs.com/package/klipper-doctor)
[![ci](https://github.com/kd-011/klipper-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/kd-011/klipper-doctor/actions/workflows/ci.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![node: 18 or newer](https://img.shields.io/badge/node-%E2%89%A518-339933)](package.json)

Give it a `klippy.log` or a `printer.cfg`. It tells you in plain English why the print or session died, and lints the config the way ShellCheck lints a shell script.

```sh
npx klipper-doctor klippy.log
```

<picture>
  <source media="(max-width: 600px)" srcset="assets/demo-hero.png">
  <img src="assets/demo.png" alt="klipper-doctor reading a klippy.log: a heater shutdown explained in plain English, then two notes on the config" width="820">
</picture>

Or install it: `npm i -g klipper-doctor`. Node 18 or newer. It also runs in your browser at [hotend.app/klipper-doctor](https://hotend.app/klipper-doctor), and nothing you drop there is uploaded.

## What it catches

Klipper's own messages are terse. These are real outputs, from test logs built out of the message formats in the Klipper source (never from anyone's real log).

**Lost communication**

```text
Timeout with MCU 'mcu' (eventtime=5014.912345)
Transition to shutdown state: Lost communication with MCU 'mcu'
```

```text
error   Lost communication with MCU [mcu-lost-communication]
        Klipper lost contact with MCU 'mcu' and shut down. The Klipper FAQ says this
        is commonly caused by hardware errors on the USB connection: a poor cable or
        loose plugs, a weak power supply for the host (look for "under voltage"
        warnings), an overloaded printer power supply, frayed or crimped stepper,
        heater or sensor wires, or the printer and host 5V supplies being mixed.
        Fix: Use a good USB cable with secure plugs, a good power supply for the host,
        and check the printer wiring and power supply load.
```

**Timer too close**

```text
MCU 'mcu' shutdown: Timer too close
```

```text
error   Timer too close [mcu-timer-too-close]
        MCU 'mcu' shut down with "Timer too close": a command reached it after the
        time it was scheduled to run. Klipper's own hint is that this often indicates
        the host computer is overloaded: other processes using too much CPU, high swap
        use, disk errors, overheating or unstable voltage.
        Fix: Check the host for processes using a lot of CPU, high swap use, disk
        errors, overheating or unstable power, then run FIRMWARE_RESTART.
```

**A TMC driver that will not answer**

```text
Unable to read tmc uart 'stepper_x' register IFCNT
```

```text
error   Cannot talk to a TMC driver [tmc-comm]
        Klipper could not read register IFCNT on the TMC driver for stepper_x over
        UART. The Klipper TMC guide says to make sure motor power is enabled, because
        the driver generally needs it before it will answer. If this started right
        after flashing Klipper for the first time, the driver may have been left in a
        state Klipper cannot use: remove all power, USB and mains, for several
        seconds. Otherwise it is usually wrong UART wiring or wrong UART pin settings
        in the config.
        Fix: Turn motor power on, then power-cycle the printer fully; if it persists,
        check the uart_pin, tx_pin and uart_address settings against the wiring.
```

**An option Klipper removed** (the config report: no crash needed)

```text
[extruder]
...
pid_integral_max = 0.2
```

```text
error   pid_integral_max was removed from Klipper in [extruder] [removed-option]
        Config_Changes lists pid_integral_max as removed on 2021-11-02. This log's
        Klipper (v0.12.0-250-g1a2b3c4d) is newer than that, so it rejects the option.
        Delete the line.
        Fix: Delete the line.
```

Every finding also carries the line numbers it came from and a link to the Klipper docs page or source file behind it.

## How it differs

There are good tools for looking at a `klippy.log` already. [Klipper Log Visualizer](https://klipper.discourse.group/t/klipper-log-visualizer/24281) by Sineos graphs the data in a log in the browser, and [klipper_logs](https://coderus.openrepos.net/klipper_logs/) by CODeRUS collects and graphs logs too. Klipper itself ships `scripts/logextract.py` for pulling the config and shutdown information out of a log. For the config side, [klipper-cfg-linter](https://github.com/chexxor/klipper-cfg-linter) by chexxor is an early project with the same aim as the config report here.

klipper-doctor is a companion to those, not a replacement: use a grapher to see what the temperatures and the load did, and use this to get the cause and the fix in words, plus a lint of the config.

## Use it

```sh
klipper-doctor klippy.log            # crash report and config report
klipper-doctor printer.cfg           # config report only
klipper-doctor --md klippy.log       # paste-ready for a Reddit or Discord thread
klipper-doctor --json klippy.log     # machine-readable
klipper-doctor --config-only klippy.log
cat klippy.log | klipper-doctor -    # read stdin
```

Exit code is 1 when any finding is an error, 0 otherwise, and 2 for a usage or read error.

Klipper writes the parsed config into `klippy.log` at the start of every run, so one log gives you both reports. When the log holds several Klipper starts, the last one is analysed and the count is reported. If the last one is clean, the report names the latest earlier session that failed, since Klipper has often been restarted before the log was grabbed.

### Several files

```sh
klipper-doctor a.cfg b.cfg   # one report per file, each under a ==> file <== heading
```

With `--json` the output is an array of `{ file, report }`.

### On the printer

With no file, klipper-doctor reads `~/printer_data/logs/klippy.log` if it exists and says so on stderr. If it does not, it prints the usage and exits 2.

```sh
klipper-doctor
```

### From a laptop, through Moonraker

Many printer hosts have no Node. Give klipper-doctor the address of Moonraker and it downloads `klippy.log` through Moonraker's file API (`GET /server/files/klippy.log`) and analyses it on your machine.

```sh
klipper-doctor http://voron.local:7125
```

If Moonraker asks for authentication, put an API key in an environment variable and add `--api-key`. The key is read from `MOONRAKER_API_KEY`, or from the variable you name with `--api-key=VAR`. It is sent as the `X-Api-Key` header to that address only, is never printed, and is not sent unless `--api-key` is there. Redirects are reported rather than followed, so the key cannot be passed on to another host. Alternatively add your computer to `trusted_clients` in the `[authorization]` section of `moonraker.conf`.

```sh
MOONRAKER_API_KEY=... klipper-doctor --api-key https://printer.example.net
```

An unreachable host, a wrong key and a missing log each get a one-line error and exit 2. `--timeout <seconds>` changes the 30 second wait.

### In CI: GitHub Actions

`--format github` prints one workflow command per finding (`::error file=printer.cfg,line=12,title=...::`), so GitHub marks the lines in the commit or pull request. The repository is also a composite action, which lints the `.cfg` files of a config backup repo on every push:

```yaml
# .github/workflows/klipper-doctor.yml
name: klipper-doctor
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: kd-011/klipper-doctor@main
        with:
          files: printer.cfg macros.cfg   # spaces between files, globs allowed
          ignore: no-input-shaper         # optional, comma separated
```

The step fails when a finding is an error. It runs the build committed in the repository, so there is nothing to install, and it needs Node 18 or newer (GitHub's runners have it). Use a release tag instead of `main` once a release that includes `action.yml` is out.

### With pre-commit

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/kd-011/klipper-doctor
    rev: vX.Y.Z   # a release tag that includes .pre-commit-hooks.yaml
    hooks:
      - id: klipper-doctor
```

The hook checks the `.cfg` files in the commit and blocks it when a finding is an error.

### Silencing a finding

For one run: `--ignore duplicate-option,no-input-shaper`. A rule id that does not exist is an error, so a typo cannot hide nothing quietly.

For one place in a `printer.cfg`, put a comment on the line or in the comment lines directly above it, the way ShellCheck does:

```ini
# klipper-doctor: ignore removed-option
pid_integral_max: 0.2
max_velocity: 300   # klipper-doctor: ignore duplicate-option
```

Several ids go in one comment, separated by commas. A blank line ends the comment block above a line. A finding that points at no line, such as `no-input-shaper`, can only be hidden with `--ignore`. The report says how many findings were hidden. Klipper removes comments before it writes the config into `klippy.log`, so inline comments work on a `printer.cfg` and `--ignore` works on both.

Suppressions never hide a crash finding, and `--ignore` refuses a crash rule id. The same goes for `unusable-input`: a file that could not be read must not look clean.

### Shell completions

```sh
source <(klipper-doctor completions bash)                          # ~/.bashrc
source <(klipper-doctor completions zsh)                           # ~/.zshrc, after compinit
klipper-doctor completions fish > ~/.config/fish/completions/klipper-doctor.fish
```

They complete the options, the `--format` values and the rule ids `--ignore` accepts.

### As a library

ESM, no dependencies, runs in Node and in the browser. Only the CLI touches the filesystem.

```js
import { analyze, toMarkdown } from 'klipper-doctor';

const report = analyze(text, { filename: 'klippy.log' });
report.crash;   // Finding[]: why the session died, or a plain "no failure found"
report.config;  // Finding[]: error, warning and note findings on the config
toMarkdown(report);
```

Each finding has an `id`, a `severity` (`error`, `warning` or `note`), a `title`, a `detail`, a one-line `fix`, a `docs` link and `evidence` lines with their line numbers. `rulesMetadata()` lists every rule. Types ship with the package.

## Rules

Every rule is taken from the Klipper docs or source. The crash rules match message strings copied from the Klipper source, and each rule links the page or file it comes from.

<!-- rules:start -->
| Rule | Report | Severity | What it catches | Source |
| --- | --- | --- | --- | --- |
| `config-error` | crash | error | Klipper rejected the config | [docs](https://www.klipper3d.org/Config_checks.html) |
| `mcu-protocol-mismatch` | crash | error | MCU firmware does not match the host | [docs](https://www.klipper3d.org/Installation.html#building-and-flashing-the-micro-controller) |
| `mcu-connect-failed` | crash | error | Unable to connect to the MCU | [docs](https://www.klipper3d.org/FAQ.html#wheres-my-serial-port) |
| `can-uuid-invalid` | crash | error | canbus_uuid is not a valid uuid | [docs](https://www.klipper3d.org/CANBUS.html#finding-the-canbus_uuid-for-new-micro-controllers) |
| `mcu-linux-bus-open` | crash | error | Linux host MCU could not open an SPI or I2C device | [docs](https://www.klipper3d.org/RPi_microcontroller.html#optional-enabling-spi) |
| `mcu-lost-communication` | crash | error | Lost communication with MCU | [docs](https://www.klipper3d.org/FAQ.html#i-keep-getting-random-lost-communication-with-mcu-errors) |
| `mcu-timer-too-close` | crash | error | Timer too close | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/extras/error_mcu.py) |
| `mcu-missed-scheduling` | crash | error | Missed scheduling of next event | [docs](https://www.klipper3d.org/FAQ.html#i-keep-getting-random-lost-communication-with-mcu-errors) |
| `mcu-max-duration` | crash | error | Output left on too long without an update | [docs](https://www.klipper3d.org/MCU_Commands.html#common-micro-controller-objects) |
| `mcu-step-rate` | crash | error | Stepping faster than the MCU can manage | [docs](https://www.klipper3d.org/Benchmarks.html) |
| `mcu-adc-out-of-range` | crash | error | ADC out of range | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/extras/error_mcu.py) |
| `mcu-command-request` | crash | error | Shutdown requested by command | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/extras/error_mcu.py) |
| `mcu-spontaneous-restart` | crash | error | MCU restarted by itself | [docs](https://www.klipper3d.org/FAQ.html#i-keep-getting-random-lost-communication-with-mcu-errors) |
| `heater-verify` | crash | error | Heater not heating at expected rate | [docs](https://www.klipper3d.org/Config_Reference.html#verify_heater) |
| `tmc-comm` | crash | error | Cannot talk to a TMC driver | [docs](https://www.klipper3d.org/TMC_Drivers.html#i-keep-getting-unable-to-read-tmc-uart-stepper_x-register-ifcnt-errors) |
| `tmc-reports-error` | crash | error | TMC driver reports an error | [docs](https://www.klipper3d.org/TMC_Drivers.html#why-did-i-get-a-tmc-reports-error-error) |
| `stepcompress-internal-error` | crash | error | Internal error in stepcompress | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/stepper.py) |
| `move-out-of-range` | crash | warning | Move out of range | [docs](https://www.klipper3d.org/FAQ.html#why-cant-i-move-the-stepper-before-homing-the-printer) |
| `must-home-first` | crash | warning | Must home axis first | [docs](https://www.klipper3d.org/FAQ.html#why-cant-i-move-the-stepper-before-homing-the-printer) |
| `homing-no-trigger` | crash | warning | Endstop never triggered while homing | [docs](https://www.klipper3d.org/Config_checks.html#verify-endstops) |
| `homing-still-triggered` | crash | warning | Endstop still triggered after the retract | [docs](https://www.klipper3d.org/Config_checks.html#verify-endstops) |
| `probe-triggered-early` | crash | warning | Probe triggered before it moved | [docs](https://www.klipper3d.org/G-Codes.html#query_probe) |
| `homing-comm-timeout` | crash | warning | Communication timeout during homing | [docs](https://www.klipper3d.org/Multi_MCU_Homing.html) |
| `bltouch-verify` | crash | warning | BLTouch failed its own check | [docs](https://www.klipper3d.org/BLTouch.html#bl-touch-clones) |
| `extrude-cold` | crash | warning | Extruder move refused: too cold | [docs](https://www.klipper3d.org/Config_Reference.html#extruder) |
| `extrude-only-too-long` | crash | warning | Retraction or extrude-only move too long | [docs](https://www.klipper3d.org/Config_Reference.html#extruder) |
| `extrude-cross-section` | crash | warning | Move extrudes too much for its length | [docs](https://www.klipper3d.org/Config_Reference.html#extruder) |
| `crash-unknown-reason` | crash | error | Shutdown with a reason no rule knows | [docs](https://www.klipper3d.org/FAQ.html#why-does-klipper-report-errors-i-lost-my-print) |
| `no-failure-found` | crash | note | No failure found in the log | [docs](https://www.klipper3d.org/FAQ.html) |
| `unparseable-line` | config | error | Line Klipper cannot parse | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/configfile.py) |
| `gcode-unindented` | config | error | Unindented line inside a gcode: block | [docs](https://www.klipper3d.org/Command_Templates.html) |
| `duplicate-option` | config | warning | Option set twice in one section | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/configfile.py) |
| `duplicate-section` | config | warning | Section appears twice | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/configfile.py) |
| `save-config-duplicate` | config | warning | Option is in the main config and the SAVE_CONFIG block | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/configfile.py) |
| `removed-option` | config | warning | Option or value removed from Klipper | [docs](https://www.klipper3d.org/Config_Changes.html) |
| `deprecated-option` | config | warning | Option renamed and deprecated | [docs](https://www.klipper3d.org/Config_Changes.html) |
| `missing-required` | config | error | Required option missing | [docs](https://www.klipper3d.org/Config_Reference.html) |
| `endstop-range` | config | error | position_endstop does not fit the axis | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/stepper.py) |
| `safe-z-home-conflict` | config | error | [safe_z_home] and [homing_override] together | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/extras/safe_z_home.py) |
| `kinematics-missing-section` | config | error | Stepper sections the kinematics needs are missing | [docs](https://www.klipper3d.org/Config_Reference.html#printer) |
| `pin-used-twice` | config | error | Pin used by two sections | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/pins.py) |
| `tmc-microsteps` | config | error | Microsteps value a TMC driver does not accept | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/extras/tmc.py) |
| `tmc-stepper-missing` | config | error | TMC driver for a stepper that is not in the config | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/extras/tmc.py) |
| `tmc-stealthchop-threshold` | config | note | stealthchop_threshold switches modes while moving | [docs](https://www.klipper3d.org/TMC_Drivers.html#setting-spreadcycle-vs-stealthchop-mode) |
| `no-input-shaper` | config | note | No [input_shaper] section | [docs](https://www.klipper3d.org/Resonance_Compensation.html) |
| `includes-not-read` | config | note | Included files were not read | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/configfile.py) |
| `config-fragment` | config | note | File has no [printer] section | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/configfile.py) |
| `no-config-dump` | config | note | No config dump in the log | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/configfile.py) |
| `unusable-input` | config | error | Not a Klipper log or config | [docs](https://www.klipper3d.org/FAQ.html) |
<!-- rules:end -->

Message strings were checked against Klipper's `master` branch on 2026-11-02. Older Klipper versions can word a message differently, and the tool says so when a rule does not match rather than guessing.

## In the browser

The same engine runs at [hotend.app/klipper-doctor](https://hotend.app/klipper-doctor), free and with no signup. The analysis happens in your browser. The log is not uploaded and not stored.

The CLI is the same: it reads the file you name and prints the result. Given a Moonraker URL it makes one request to that address, and nothing else is sent anywhere.

## Limits

- It reads one file. Options in files pulled in by `[include]` are not checked in a raw `printer.cfg`, and it says so. A `klippy.log` has the includes already merged, so prefer that.
- It reads `klippy.log` only. Moonraker's own log is a different file and is not parsed.
- It cannot see a failure that left no trace in the log.

## Contributing

Wrong diagnosis, or a rule you want? Open an issue with a redacted log snippet or a docs link. To add a rule yourself, see [CONTRIBUTING.md](CONTRIBUTING.md): a rule is a small object, and the one hard requirement is a Klipper docs page or source file behind it. No source, no rule.

Releases are automatic: merging a pull request that raises the version in `package.json` publishes it to npm and creates the GitHub Release, with notes from [CHANGELOG.md](CHANGELOG.md). The steps are in CONTRIBUTING.md.

## Built by Hotend

Built by [Hotend](https://hotend.app), which watches your printer from your phone and catches failures live.

## Licence

MIT. See [LICENSE](LICENSE). Release notes are in [CHANGELOG.md](CHANGELOG.md).
