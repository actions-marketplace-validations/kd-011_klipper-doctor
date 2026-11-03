# klipper-doctor

[![npm](https://img.shields.io/npm/v/klipper-doctor?color=cb3837)](https://www.npmjs.com/package/klipper-doctor)
[![ci](https://github.com/kd-011/klipper-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/kd-011/klipper-doctor/actions/workflows/ci.yml)

klipper-doctor reads a `klippy.log` or `printer.cfg` and tells you in plain English why Klipper stopped and what to try next.

<picture>
  <source media="(max-width: 600px)" srcset="assets/demo-hero.png">
  <img src="assets/demo.png" alt="klipper-doctor reading a klippy.log: a heater shutdown explained in plain English, then two notes on the config" width="820">
</picture>

The picture is real output on `test/fixtures/demo.log`, drawn by `scripts/render-assets.mjs`.

## Try it

You need Node 18 or newer. To see a report without a printer, feed it the sample log from this repo, which is built from Klipper's message formats and isn't anyone's real log:

```sh
curl -s https://raw.githubusercontent.com/kd-011/klipper-doctor/main/test/fixtures/demo.log | npx klipper-doctor -
```

To check your own printer from any computer on the same network, give it the address of Moonraker. It downloads the log and reads it on your machine:

```sh
npx klipper-doctor http://your-printer:7125
```

If you have the log already (Mainsail and Fluidd both list it under their log files):

```sh
npx klipper-doctor klippy.log
```

No Node? The same engine runs at [hotend.app/klipper-doctor](https://hotend.app/klipper-doctor). Drop the file on the page and it stays in your browser.

## What you get

Klipper logs this:

```text
MCU 'mcu' shutdown: Timer too close
```

klipper-doctor says this:

```text
error   Timer too close [mcu-timer-too-close]
        MCU 'mcu' shut down with "Timer too close": a command reached it after the
        time it was scheduled to run. Klipper's own hint is that this often indicates
        the host computer is overloaded: other processes using too much CPU, high swap
        use, disk errors, overheating or unstable voltage.
        Fix: Check the host for processes using a lot of CPU, high swap use, disk
        errors, overheating or unstable power, then run FIRMWARE_RESTART.
```

Each finding also gives the log line numbers and a link to the Klipper docs page or source file behind it. Klipper writes its config into the log at every start, so one log gets you a config lint too. `--md` prints a version to paste into a forum thread. [More examples](docs/examples.md).

## How often it helps

It was run on 292 logs attached to help threads on the Klipper forum, and 40 of those threads were then read against the report. Two attachments weren't klippy logs. Of the other 38, it named the problem the thread was about in 22, and in 13 the log couldn't have answered the question, mostly print quality and how-to. It missed 3, and nothing it said was contradicted by the thread. An AI model did that reading and nobody has second-checked it, so treat it as one reader's judgement. [The method and all the numbers](docs/accuracy.md).

## When not to use this

- Print quality problems such as ringing, poor adhesion or layer shifts leave nothing in the log, so you will get "No failure found".
- Vendor forks and third-party modules: the rules come from mainline Klipper, so an error from Happy Hare or eddy-ng is shown raw with no advice.
- To tell a bad cable from a bad power supply. The fix text is what the Klipper docs suggest for that message, and you still have to test the hardware.
- To prove a config is correct. It has about 20 config rules and Klipper checks far more when it starts.

## Other tools

For graphs of temperature and load, use Sineos's [Klipper Log Visualizer](https://klipper.discourse.group/t/klipper-log-visualizer/24281). If you can read a shutdown dump, Sineos's [Advanced Log Inspector](https://klipper.discourse.group/t/klipper-advanced-log-inspector/24413) puts Klipper's `logextract.py` output in a web page and shows far more detail than this does. CODeRUS's [klipper_logs](https://coderus.openrepos.net/klipper_logs/) collects and graphs logs, and chexxor's [klipper-cfg-linter](https://github.com/chexxor/klipper-cfg-linter) is an early config linter. Pasting a log into ChatGPT can cover things no rule here does, and it [can also be wrong](https://klipper.discourse.group/t/chat-gpt-and-klipper-logs/24945). Every rule here traces to the Klipper docs or source, so klipper-doctor covers less.

## More

- [Using it](docs/usage.md): the options, several files, CI, pre-commit, silencing a finding, shell completions and the library.
- [Rules](docs/rules.md): every rule and where it comes from.
- [Contributing](CONTRIBUTING.md): for a wrong diagnosis or a missing rule, open an issue with a redacted snippet of the log.

Built by [Hotend](https://hotend.app), which watches your printer from your phone and catches failures live. MIT licence. Release notes are in [CHANGELOG.md](CHANGELOG.md).
