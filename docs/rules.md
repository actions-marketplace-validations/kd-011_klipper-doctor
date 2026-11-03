# Rules

Every rule is taken from the Klipper docs or source. The crash rules match message strings copied from the Klipper source, and each rule links the page or file it comes from.

<!-- rules:start -->
| Rule | Report | Severity | What it catches | Source |
| --- | --- | --- | --- | --- |
| `config-error` | crash | error | Klipper rejected the config | [docs](https://www.klipper3d.org/Config_checks.html) |
| `mcu-protocol-mismatch` | crash | error | MCU firmware does not match the host | [docs](https://www.klipper3d.org/Installation.html#building-and-flashing-the-micro-controller) |
| `mcu-connect-failed` | crash | error | Unable to connect to the MCU | [docs](https://www.klipper3d.org/FAQ.html#wheres-my-serial-port) |
| `mcu-config-while-shutdown` | crash | error | MCU is still shut down from an earlier failure | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/mcu.py) |
| `mcu-reset-failed` | crash | error | FIRMWARE_RESTART did not reset the MCU | [docs](https://www.klipper3d.org/Config_Reference.html#mcu) |
| `can-uuid-invalid` | crash | error | canbus_uuid is not a valid uuid | [docs](https://www.klipper3d.org/CANBUS.html#finding-the-canbus_uuid-for-new-micro-controllers) |
| `mcu-linux-bus-open` | crash | error | Linux host MCU could not open an SPI or I2C device | [docs](https://www.klipper3d.org/RPi_microcontroller.html#optional-enabling-spi) |
| `mcu-lost-communication` | crash | error | Lost communication with MCU | [docs](https://www.klipper3d.org/FAQ.html#i-keep-getting-random-lost-communication-with-mcu-errors) |
| `mcu-timer-too-close` | crash | error | Timer too close | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/extras/error_mcu.py) |
| `mcu-missed-scheduling` | crash | error | Missed scheduling of next event | [docs](https://www.klipper3d.org/FAQ.html#i-keep-getting-random-lost-communication-with-mcu-errors) |
| `mcu-max-duration` | crash | error | Output left on too long without an update | [docs](https://www.klipper3d.org/MCU_Commands.html#common-micro-controller-objects) |
| `mcu-step-rate` | crash | error | Stepping faster than the MCU can manage | [docs](https://www.klipper3d.org/Benchmarks.html) |
| `mcu-adc-out-of-range` | crash | error | ADC out of range | [docs](https://github.com/Klipper3d/klipper/blob/master/klippy/extras/error_mcu.py) |
| `mcu-thermocouple-fault` | crash | error | Thermocouple reader fault | [docs](https://github.com/Klipper3d/klipper/blob/master/src/thermocouple.c) |
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
| `command-error` | crash | warning | A G-code command failed | [docs](https://www.klipper3d.org/G-Codes.html) |
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
| `mcu-version-differs` | config | note | MCU firmware is a different version from the host | [docs](https://www.klipper3d.org/FAQ.html#how-do-i-upgrade-to-the-latest-software) |
| `unusable-input` | config | error | Not a Klipper log or config | [docs](https://www.klipper3d.org/FAQ.html) |
<!-- rules:end -->

Message strings were checked against Klipper's `master` branch at commit 0cee841 (28 October 2026). The `command-error` rule's list of messages is generated from the same commit by `scripts/gen-command-errors.mjs`. Older Klipper versions can word a message differently, and the tool says so when no rule matches, instead of guessing.

