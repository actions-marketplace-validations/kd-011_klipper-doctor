# Using klipper-doctor

Install it with `npm i -g klipper-doctor` or run it with `npx klipper-doctor`. It needs Node 18 or newer.

```sh
klipper-doctor klippy.log            # crash report and config report
klipper-doctor printer.cfg           # config report only
klipper-doctor --md klippy.log       # paste-ready for a Reddit or Discord thread
klipper-doctor --json klippy.log     # machine-readable
klipper-doctor --config-only klippy.log
cat klippy.log | klipper-doctor -    # read stdin
```

Exit code is 1 when any finding is an error, 0 otherwise, and 2 for a usage or read error.

Klipper writes the parsed config into `klippy.log` at the start of every run, so one log gives you both reports. When the log holds several Klipper starts, the last one is analysed and the count is reported. If the last one is clean, the report names the latest earlier session that failed, because Klipper has often been restarted by the time you grab the log.

## Several files

```sh
klipper-doctor a.cfg b.cfg   # one report per file, each under a ==> file <== heading
```

With `--json` the output is an array of `{ file, report }`.

## On the printer

With no file, klipper-doctor reads `~/printer_data/logs/klippy.log` if it exists and says so on stderr. If it does not, it prints the usage and exits 2.

```sh
klipper-doctor
```

## From a laptop, through Moonraker

Many printer hosts have no Node. Give klipper-doctor the address of Moonraker and it downloads `klippy.log` through Moonraker's file API and analyses it on your machine. It asks for `/server/files/klippy.log`, and if that answers 404 it asks for `/server/files/logs/klippy.log`. The second route matters when Klipper is down, because the first one only follows Klipper's log file once Klipper has connected.

```sh
klipper-doctor http://voron.local:7125
```

If Moonraker wants authentication, put an API key in an environment variable and add `--api-key`. The key comes from `MOONRAKER_API_KEY`, or from the variable you name with `--api-key=VAR`. It goes to that address only, as the `X-Api-Key` header, and only when `--api-key` is given. It is never printed. Redirects are reported and not followed, so the key can't reach another host. You can also add your computer to `trusted_clients` in the `[authorization]` section of `moonraker.conf`.

```sh
MOONRAKER_API_KEY=... klipper-doctor --api-key https://printer.example.net
```

An unreachable host, a wrong key and a missing log each get a one-line error and exit 2. `--timeout <seconds>` changes the 30 second wait.

This was checked against a real Moonraker (commit b559b9a) on one machine with Klipper not running: a trusted client, a right key, a wrong key and a stopped server. It has not been run against a Moonraker behind a reverse proxy.

## In CI: GitHub Actions

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
      - uses: kd-011/klipper-doctor@v0.4.0
        with:
          files: printer.cfg macros.cfg   # spaces between files, globs allowed
          ignore: no-input-shaper         # optional, comma separated
```

The step fails when a finding is an error. It runs the build committed in the repository, so there is nothing to install. It needs Node 18 or newer, which GitHub's runners have.

## With pre-commit

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/kd-011/klipper-doctor
    rev: v0.4.0
    hooks:
      - id: klipper-doctor
```

The hook checks the `.cfg` files in the commit and blocks it when a finding is an error. pre-commit installs it with npm the first time, which took about 50 seconds on a clean machine.

## Silencing a finding

For one run: `--ignore duplicate-option,no-input-shaper`. An unknown rule id is an error, so a typo can't quietly do nothing.

For one place in a `printer.cfg`, put a comment on the line or in the comment lines directly above it, the way ShellCheck does:

```ini
# klipper-doctor: ignore removed-option
pid_integral_max: 0.2
max_velocity: 300   # klipper-doctor: ignore duplicate-option
```

Several ids go in one comment, separated by commas. A blank line ends the comment block above a line. A finding that points at no line, such as `no-input-shaper`, can only be hidden with `--ignore`. The report says how many findings were hidden. Klipper removes comments before it writes the config into `klippy.log`, so inline comments work on a `printer.cfg` and `--ignore` works on both.

Suppressions never hide a crash finding, and `--ignore` refuses a crash rule id. The same goes for `unusable-input`: a file that could not be read must not look clean.

## Shell completions

```sh
source <(klipper-doctor completions bash)                          # ~/.bashrc
source <(klipper-doctor completions zsh)                           # ~/.zshrc, after compinit
klipper-doctor completions fish > ~/.config/fish/completions/klipper-doctor.fish
```

They complete the options, the `--format` values and the rule ids `--ignore` accepts.

## As a library

ESM, no dependencies, runs in Node and in the browser. Only the CLI touches the filesystem.

```js
import { analyze, toMarkdown } from 'klipper-doctor';

const report = analyze(text, { filename: 'klippy.log' });
report.crash;   // Finding[]: why the session died, or a plain "no failure found"
report.config;  // Finding[]: error, warning and note findings on the config
toMarkdown(report);
```

Each finding has an `id`, a `severity` (`error`, `warning` or `note`), a `title`, a `detail`, a one-line `fix`, a `docs` link and `evidence` lines with their line numbers. `rulesMetadata()` lists every rule. Types ship with the package.

## Limits

- It reads one file. Options in files pulled in by `[include]` are not checked in a raw `printer.cfg`, and it says so. A `klippy.log` has the includes already merged, so prefer that.
- It reads `klippy.log` only. Moonraker's own log is a different file and is not parsed.
- It cannot see a failure that left no trace in the log.

## In the browser

The same engine runs at [hotend.app/klipper-doctor](https://hotend.app/klipper-doctor), free and with no signup. The analysis happens in your browser. The log is not uploaded or stored.

The CLI is the same: it reads the file you name and prints the result. Given a Moonraker URL it asks that address for the log, and nothing else is sent anywhere.
