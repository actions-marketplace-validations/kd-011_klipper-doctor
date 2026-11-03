// Builds test/fixtures/*.log from hand-written pieces. Nothing here comes from a
// real user's log: every line is assembled from the message formats in the
// Klipper source (klippy/klippy.py, mcu.py, serialhdl.py, configfile.py,
// extras/error_mcu.py, extras/verify_heater.py, extras/tmc.py, toolhead.py,
// src/*.c). Run: node scripts/make-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
mkdirSync(out, { recursive: true });

const VERSION = 'v0.12.0-250-g1a2b3c4d';

const header = (what, src) =>
  `# fixture: ${what}\n# made by scripts/make-fixtures.mjs from message formats in the Klipper source (${src}). Not a real user's log.\n`;

// What Klipper writes as the config dump: comments stripped, option names
// lowercased, "key = value", continuation lines tab-indented
// (klippy/configfile.py build_config_string, RawConfigParser.write).
const CONFIG_DUMP = `[mcu]
serial = /dev/serial/by-id/usb-Klipper_stm32f103xe_ABC123-if00

[printer]
kinematics = cartesian
max_velocity = 300
max_accel = 3000

[stepper_x]
step_pin = PB13
dir_pin = !PB12
enable_pin = !PB14
microsteps = 16
rotation_distance = 40
endstop_pin = ^PC0
position_endstop = 0
position_max = 235
homing_speed = 50

[stepper_y]
step_pin = PB10
dir_pin = !PB2
enable_pin = !PB11
microsteps = 16
rotation_distance = 40
endstop_pin = ^PC1
position_endstop = 0
position_max = 235
homing_speed = 50

[stepper_z]
step_pin = PB0
dir_pin = PC5
enable_pin = !PB1
microsteps = 16
rotation_distance = 8
endstop_pin = ^PC2
position_endstop = 0.5
position_max = 250

[extruder]
step_pin = PB3
dir_pin = !PB4
enable_pin = !PD2
microsteps = 16
rotation_distance = 33.683
nozzle_diameter = 0.400
filament_diameter = 1.750
heater_pin = PC8
sensor_type = EPCOS 100K B57560G104F
sensor_pin = PA0
control = pid
pid_kp = 26.213
pid_ki = 1.304
pid_kd = 131.721
min_temp = 0
max_temp = 270

[heater_bed]
heater_pin = PC9
sensor_type = ATC Semitec 104GT-2
sensor_pin = PC4
control = watermark
min_temp = 0
max_temp = 130

[tmc2209 stepper_x]
uart_pin = PC11
tx_pin = PC10
uart_address = 0
run_current = 0.580
stealthchop_threshold = 999999

[input_shaper]
shaper_freq_x = 58.2
shaper_type_x = mzv
shaper_freq_y = 41.6
shaper_type_y = mzv

[gcode_macro START_PRINT]
gcode =
\tG28
\tG1 Z10 F600
\tM109 S{params.EXTRUDER|default(200)}`;

const MCU_VERSION_LINES = (v = VERSION) =>
  `Loaded MCU 'mcu' 112 commands (${v} / gcc: (15:7-2018-q2-1) 7.3.1 20180622 (release) [ARM/embedded-7-branch revision 261907] binutils: (2.31.1-0))
MCU 'mcu' config: ADC_MAX=4095 BUS_PINS_i2c1=PB6,PB7 CLOCK_FREQ=72000000 MCU=stm32f103xe PWM_MAX=255 SERIAL_BAUD=250000 STEPPER_BOTH_EDGE=1
MCU 'mcu' kconfig: {'CONFIG_MACH_STM32': 1, 'CONFIG_MCU': 'stm32f103xe'}
Configured MCU 'mcu' (1024 moves)`;

const PREAMBLE = (v = VERSION) => `Starting Klippy...
Args: ['/home/pi/klipper/klippy/klippy.py', '/home/pi/printer_data/config/printer.cfg', '-I', '/home/pi/printer_data/comms/klippy.serial', '-l', '/home/pi/printer_data/logs/klippy.log', '-a', '/home/pi/printer_data/comms/klippy.sock']
Git version: '${v}'
Branch: master
Remote: origin
Tracked URL: https://github.com/Klipper3d/klipper
CPU: 4 core ARMv7 Processor rev 4 (v7l)
Device: Raspberry Pi 3 Model B Rev 1.2
Linux: Linux version 6.1.21-v7+ (dom@buildbot) (arm-linux-gnueabihf-gcc-12 (Raspbian 12.2.0-14+rpi1) 12.2.0) #1642 SMP Mon Apr  3 17:20:52 BST 2023
Python: '3.9.2 (default, Feb 28 2021, 17:03:44) \\n[GCC 10.2.1 20210110]'`;

const START = (t = 'Sun Nov  1 10:00:00 2026', mono = 5000.0) =>
  `Start printer at ${t} (${1793527200 + (mono - 5000)}.0 ${mono.toFixed(1)})`;

const configBlock = (cfg = CONFIG_DUMP) => `===== Config file =====\n${cfg}\n=======================`;

const stats = (t, extra = '') =>
  `Stats ${t.toFixed(1)}: gcodein=0  mcu: mcu_awake=0.001 mcu_task_avg=0.000009 mcu_task_stddev=0.000012 bytes_write=1400 bytes_read=1800 bytes_retransmit=0 bytes_invalid=0 send_seq=100 receive_seq=100 retransmit_seq=0 srtt=0.001 rttvar=0.000 rto=0.025 ready_bytes=0 upcoming_bytes=0 freq=72000123 heater_bed: target=60 temp=59.8 pwm=0.250 sysload=0.22 cputime=2.5 memavail=800000${extra}`;

const goodRun = (from, n) =>
  Array.from({ length: n }, (_, i) => stats(from + i * 1)).join('\n');

const FIRMWARE_RESTART_TAIL = `
Once the underlying issue is corrected, use the
"FIRMWARE_RESTART" command to reset the firmware, reload the
config, and restart the host software.
Printer is shutdown`;

const serialDump = `Dumping serial stats: bytes_write=2400 bytes_read=3100 bytes_retransmit=2 bytes_invalid=0 send_seq=140 receive_seq=140 retransmit_seq=1 srtt=0.002 rttvar=0.000 rto=0.025 ready_bytes=0 upcoming_bytes=0
Dumping send queue 3 messages
Send: 4 1793.5 1793.5 7: seq: 1c, queue_step oid=2 interval=4000 count=10 add=0
Dumping receive queue 2 messages
Receive: 0 5410.2 5410.2 5: seq: 1d, status clock=1234567 status_clock=1234500`;

const mcuShutdown = (reason, hint) =>
  `Transition to shutdown state: MCU shutdown
MCU 'mcu' shutdown: ${reason}${hint ? '\n' + hint : ''}${FIRMWARE_RESTART_TAIL}
${serialDump}`;

const hostShutdown = (msg) =>
  `Transition to shutdown state: ${msg}\n${msg}${FIRMWARE_RESTART_TAIL}`;

const HINT_TIMER = `
This often indicates the host computer is overloaded. Check
for other processes consuming excessive CPU time, high swap
usage, disk errors, overheating, unstable voltage, or
similar system problems on the host computer.
`;

const session = (body, { cfg = CONFIG_DUMP, v = VERSION, t, mono = 5000.0, preamble = true, config = true, mcu = true } = {}) =>
  [
    preamble ? PREAMBLE(v) : '',
    START(t, mono),
    config ? configBlock(cfg) : '',
    mcu ? MCU_VERSION_LINES(v) : '',
    body,
  ]
    .filter(Boolean)
    .join('\n') + '\n';

const files = {};
const add = (name, what, src, text) => {
  files[name] = header(what, src) + text;
};

add('clean.log', 'one complete session with no failure and a clean config', 'klippy.py, configfile.py, mcu.py, statistics.py',
  session(goodRun(5010, 6)));

add('timer-too-close.log', 'MCU shutdown: Timer too close', 'src/sched.c, extras/error_mcu.py',
  session(goodRun(5010, 4) + '\n' + mcuShutdown('Timer too close', HINT_TIMER)));

add('missed-scheduling.log', 'MCU shutdown: Missed scheduling of next digital out event', 'src/gpiocmds.c, extras/error_mcu.py',
  session(goodRun(5010, 4) + '\n' + mcuShutdown('Missed scheduling of next digital out event',
    `\nThis is generally indicative of an intermittent\ncommunication failure between micro-controller and host.\n`)));

add('lost-communication.log', 'Lost communication with MCU', 'mcu.py check_timeout, extras/error_mcu.py',
  session(goodRun(5010, 4) + `\nTimeout with MCU 'mcu' (eventtime=5014.912345)\n` + hostShutdown("Lost communication with MCU 'mcu'") + '\n' + serialDump));

add('connect-failed.log', 'Unable to connect to the MCU (serial device missing)', 'serialhdl.py connect_uart, klippy.py _connect',
  session(
    `mcu 'mcu': Starting serial connect
mcu 'mcu': Unable to open serial port: [Errno 2] could not open port /dev/serial/by-id/usb-Klipper_stm32f103xe_ABC123-if00: [Errno 2] No such file or directory: '/dev/serial/by-id/usb-Klipper_stm32f103xe_ABC123-if00'
mcu 'mcu': Unable to open serial port: [Errno 2] could not open port /dev/serial/by-id/usb-Klipper_stm32f103xe_ABC123-if00: [Errno 2] No such file or directory: '/dev/serial/by-id/usb-Klipper_stm32f103xe_ABC123-if00'
MCU error during connect
Traceback (most recent call last):
  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect
    cb()
  File "/home/pi/klipper/klippy/mcu.py", line 800, in _connect
    self._serial.connect_uart(self._serialport, self._baud, rts)
  File "/home/pi/klipper/klippy/serialhdl.py", line 192, in connect_uart
    self._error("Unable to connect")
mcu.error: mcu 'mcu': Unable to connect`,
    { mcu: false }));

add('adc-out-of-range.log', 'MCU shutdown: ADC out of range with the sensor clarification line', 'src/adccmds.c, extras/adc_temperature.py, extras/error_mcu.py',
  session(goodRun(5010, 3) + '\n' + mcuShutdown('ADC out of range',
    `\nSensor 'extruder' temperature -273.150 not in range 0.000:270.000\n\nThis generally occurs when a heater temperature exceeds\nits configured min_temp or max_temp.\n`)));

add('heater-not-heating.log', 'Heater extruder not heating at expected rate', 'extras/verify_heater.py',
  session(goodRun(5010, 3) + `\nHeater extruder not heating at expected rate
${hostShutdown('Heater extruder not heating at expected rate\nSee the \'verify_heater\' section in docs/Config_Reference.md\nfor the parameters that control this check.')}`));

add('tmc-uart.log', "Unable to read tmc uart 'stepper_x' register IFCNT", 'extras/tmc_uart.py',
  session(`Unable to read tmc uart 'stepper_x' register IFCNT
Unhandled exception during connect
Traceback (most recent call last):
  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect
    cb()
  File "/home/pi/klipper/klippy/extras/tmc_uart.py", line 242, in _do_get_register
    "Unable to read tmc uart '%s' register %s" % (self.name, reg_name))
gcode.CommandError: Unable to read tmc uart 'stepper_x' register IFCNT`));

add('tmc-error.log', 'TMC reports error with an overtemperature flag', 'extras/tmc.py',
  session(goodRun(5010, 3) + `\nTMC 'stepper_y' reports DRV_STATUS: 80070000 otpw=1(OvertempWarning!) ot=1(OvertempError!)
${hostShutdown("TMC 'stepper_y' reports error: DRV_STATUS: 80070000 otpw=1(OvertempWarning!) ot=1(OvertempError!)")}`));

add('tmc-spi.log', "Unable to write tmc spi 'stepper_x' register GCONF", 'extras/tmc2130.py',
  session(`Unable to write tmc spi 'stepper_x' register GCONF
Unhandled exception during connect
Traceback (most recent call last):
  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect
    cb()
gcode.CommandError: Unable to write tmc spi 'stepper_x' register GCONF`));

add('move-out-of-range.log', 'Move out of range after G1 beyond position_max', 'toolhead.py move_error, gcode.py _respond_error',
  session(goodRun(5010, 3) + `\nMove out of range: 250.000 100.000 10.000 [5.000]`));

add('must-home.log', 'Must home axis first', 'kinematics/cartesian.py, toolhead.py move_error',
  session(goodRun(5010, 2) + `\nMust home axis first: 100.000 100.000 10.000 [0.000]`));

add('shutdown-after-gcode-error.log', 'A Move out of range command error, then a real shutdown no rule recognises', 'toolhead.py move_error, mcu.py _handle_shutdown, extras/error_mcu.py',
  session(goodRun(5010, 2) + `\nMove out of range: 250.000 100.000 10.000 [5.000]\n` + goodRun(5020, 2) + '\n' + mcuShutdown('Some future firmware reason', '')));

add('rescheduled-timer.log', 'MCU shutdown: Rescheduled timer in the past', 'src/generic/timer_irq.c, extras/error_mcu.py',
  session(goodRun(5010, 3) + '\n' + mcuShutdown('Rescheduled timer in the past',
    `\nThis generally occurs when the micro-controller has been\nrequested to step at a rate higher than it is capable of\nobtaining.\n`)));

add('stepper-too-far.log', 'MCU shutdown: Stepper too far in past', 'src/stepper.c, extras/error_mcu.py',
  session(goodRun(5010, 3) + '\n' + mcuShutdown('Stepper too far in past',
    `\nThis generally occurs when the micro-controller has been\nrequested to step at a rate higher than it is capable of\nobtaining.\n`)));

add('protocol-mismatch.log', 'Protocol error from an MCU running older firmware than the host', 'klippy.py _connect, extras/error_mcu.py _check_protocol_error',
  session(
    `Protocol error
Traceback (most recent call last):
  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect
    cb()
  File "/home/pi/klipper/klippy/mcu.py", line 800, in _connect
    self._serial.connect_uart(self._serialport, self._baud, rts)
msgproto.error: mcu 'mcu': Unknown command: set_next_step_dir
MCU Protocol error

This is frequently caused by running an older version of the
firmware on the MCU(s). Fix by recompiling and flashing the
firmware.

Your Klipper version is: ${VERSION}
MCU(s) which should be updated:
mcu: Current version v0.11.0-33-g99aabbcc
Up-to-date MCU(s):
<none>

Once the underlying issue is corrected, use the "RESTART"
command to reload the config and restart the host software.

mcu 'mcu': Unknown command: set_next_step_dir`,
    { mcu: false }));

add('stepcompress.log', 'Internal error in stepcompress while syncing stepper position', 'stepper.py note_homing_end',
  session(goodRun(5010, 3) + `\nInternal error on command:"G28"
Traceback (most recent call last):
  File "/home/pi/klipper/klippy/gcode.py", line 222, in _process_commands
    handler(gcmd)
  File "/home/pi/klipper/klippy/stepper.py", line 208, in note_homing_end
    raise error("Internal error in stepcompress")
stepper.error: Internal error in stepcompress
${hostShutdown('Internal error on command:"G28"')}`));

add('command-request.log', 'M112 emergency stop (shutdown reason: Command request)', 'extras/error_mcu.py',
  session(goodRun(5010, 3) + '\n' + mcuShutdown('Command request',
    `\nThis generally occurs in response to an M112 G-Code command\nor in response to an internal error in the host software.\n`)));

add('spontaneous-restart.log', "MCU 'mcu' spontaneous restart", 'mcu.py _handle_starting',
  session(goodRun(5010, 3) + `\n${hostShutdown("MCU 'mcu' spontaneous restart")}`));

add('config-error-invalid-option.log', "Config error: Option 'pid_integral_max' is not valid in section 'extruder'", 'klippy.py _connect, configfile.py check_unused',
  session(`Config error
Traceback (most recent call last):
  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect
    self._read_config()
  File "/home/pi/klipper/klippy/klippy.py", line 124, in _read_config
    pconfig.check_unused_options(config)
  File "/home/pi/klipper/klippy/configfile.py", line 440, in check_unused
    raise error("Option '%s' is not valid in section '%s'"
configparser.Error: Option 'pid_integral_max' is not valid in section 'extruder'`,
    { cfg: CONFIG_DUMP.replace('pid_kd = 131.721', 'pid_kd = 131.721\npid_integral_max = 0.2'), mcu: false }));

add('config-error-missing-option.log', "Config error: Option 'rotation_distance' in section 'stepper_z' must be specified", 'klippy.py _connect, configfile.py _get_wrapper',
  session(`Config error
Traceback (most recent call last):
  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect
    self._read_config()
configparser.Error: Option 'rotation_distance' in section 'stepper_z' must be specified`,
    { mcu: false }));

add('unknown-reason.log', 'MCU shutdown with a reason no rule knows, to exercise the fallback', 'mcu.py _handle_shutdown, extras/error_mcu.py',
  session(goodRun(5010, 3) + '\n' + mcuShutdown('Some future firmware reason', '')));

add('multi-session.log', 'Three Klipper starts in one file: the last one is clean, the first two died', 'klippy.py run',
  [
    session(goodRun(5010, 2) + '\n' + mcuShutdown('Timer too close', HINT_TIMER), { mono: 5000.0 }),
    `Restarting printer\n` + session(goodRun(6010, 2) + `\n` + hostShutdown("Lost communication with MCU 'mcu'"), { mono: 6000.0, preamble: false, t: 'Sun Nov  1 11:00:00 2026' }),
    `Restarting printer\n` + session(goodRun(7010, 5), { mono: 7000.0, preamble: false, t: 'Sun Nov  1 12:00:00 2026' }),
  ].join(''));

add('multi-session-last-crashed.log', 'Two Klipper starts: the first is clean, the last died with Timer too close', 'klippy.py run',
  [
    session(goodRun(5010, 4), { mono: 5000.0 }),
    `Restarting printer\n` + session(goodRun(6010, 2) + '\n' + mcuShutdown('Timer too close', HINT_TIMER), { mono: 6000.0, preamble: false, t: 'Sun Nov  1 11:00:00 2026' }),
  ].join(''));

add('truncated.log', 'A log cut off before the config dump (starts mid-session, as after rotation)', 'queuelogger.py doRollover',
  `Stats 9000.1: gcodein=0  mcu: mcu_awake=0.001 mcu_task_avg=0.000009 bytes_retransmit=0 freq=72000123 sysload=0.30 cputime=40.5 memavail=790000
${goodRun(9001, 2)}
${mcuShutdown('Timer too close', HINT_TIMER)}
`);

add('rollover-header.log', 'A rotated log: starts with the rollover block (versions, config) instead of Start printer at', 'queuelogger.py doRollover',
  `${PREAMBLE()}
${configBlock()}
${MCU_VERSION_LINES()}
=============== Log rollover at Mon Nov  2 00:00:00 2026 ===============
${goodRun(90000, 3)}
`);

add('rollover-shutdown-restart.log', 'A log rotated at midnight: the rollover block, a run that ended in a shutdown, then a restart and a clean run', 'queuelogger.py doRollover, klippy.py run',
  `${PREAMBLE()}
${configBlock()}
${MCU_VERSION_LINES()}
=============== Log rollover at Mon Nov  2 00:00:00 2026 ===============
${goodRun(90000, 3)}
${mcuShutdown('Timer too close', HINT_TIMER)}
Restarting printer
` + session(goodRun(91000, 4), { mono: 91000.0, preamble: false, t: 'Mon Nov  2 00:30:00 2026' }));

add('config-findings.log', 'A clean session whose dumped config has removed options and a mixed stealthchop threshold', 'configfile.py, TMC_Drivers.md',
  session(goodRun(5010, 3), {
    cfg: CONFIG_DUMP
      .replace('pid_kd = 131.721', 'pid_kd = 131.721\npid_integral_max = 0.2')
      .replace('stealthchop_threshold = 999999', 'stealthchop_threshold = 500'),
  }));

add('demo.log', 'A heater verify shutdown, with a mixed stealthchop threshold and no input_shaper in the dumped config (the README demo image)', 'extras/verify_heater.py, TMC_Drivers.md, Resonance_Compensation.md',
  session(goodRun(5010, 3) + `\nHeater extruder not heating at expected rate
${hostShutdown('Heater extruder not heating at expected rate\nSee the \'verify_heater\' section in docs/Config_Reference.md\nfor the parameters that control this check.')}`, {
    cfg: CONFIG_DUMP
      .replace(/\[input_shaper\][\s\S]*?\n\n/, '')
      .replace('stealthchop_threshold = 999999', 'stealthchop_threshold = 500'),
  }));

// Shapes seen in publicly posted logs. Rebuilt here from the message formats, never copied.

const HOST_TRACE = (exception) => `Traceback (most recent call last):
  File "/home/pi/klipper/klippy/gcode.py", line 212, in _process_commands
    handler(gcmd)
${exception}`;

add('heater-then-command-request.log', 'A heater shutdown. The host stops the MCU, which then reports Command request: an effect, not the cause', 'extras/verify_heater.py, mcu.py _shutdown, src/basecmd.c',
  session(goodRun(5010, 2) + `\nHeater extruder not heating at expected rate\n${hostShutdown('Heater extruder not heating at expected rate')}\nMCU 'mcu' shutdown: Command request\n${serialDump}`));

add('mcu-fault-then-command-request.log', 'An MCU reason no rule knows, with the second MCU reporting Command request first (current log format)', 'src/thermocouple.c, mcu.py _analyze_shutdown, extras/error_mcu.py',
  session(goodRun(5010, 2) + `\nTransition to shutdown state: MCU shutdown\nDumping gcode input 0 blocks\nMCU 'rpi' shutdown: Command request\n${serialDump}\nMCU 'mcu' shutdown: Some future firmware reason\n${serialDump}${FIRMWARE_RESTART_TAIL}`));

add('timer-on-second-mcu.log', 'Timer too close on the main MCU, listed after an MCU with no reason and one reporting Command request', 'src/sched.c, mcu.py _analyze_shutdown',
  session(goodRun(5010, 2) + `\nTransition to shutdown state: MCU shutdown\nDumping gcode input 0 blocks\nMCU 'toolhead' shutdown: \n${serialDump}\nMCU 'rpi' shutdown: Command request\n${serialDump}\nMCU 'mcu' shutdown: Timer too close\n${HINT_TIMER}${FIRMWARE_RESTART_TAIL}`));

add('timer-old-format.log', 'The format before extras/error_mcu.py: the reason is on the Transition line, and a second MCU follows', 'older klippy/mcu.py',
  session(goodRun(5010, 2) + `\nTransition to shutdown state: MCU 'mcu' shutdown: Timer too close\nMCU 'mcu' shutdown: Timer too close\n${serialDump}\nMCU 'rpi' shutdown: Command request\n${serialDump}`));

add('estop-webhooks.log', 'Emergency stop through the API, which every MCU then reports as Command request', 'webhooks.py, docs/API_Server.md',
  session(goodRun(5010, 2) + `\n${hostShutdown('Shutdown due to webhooks request')}\nMCU 'mcu' shutdown: Command request\n${serialDump}`));

add('estop-m112.log', 'M112, which every MCU then reports as Command request', 'gcode.py cmd_M112',
  session(goodRun(5010, 2) + `\n${hostShutdown('Shutdown due to M112 command')}\nMCU 'mcu' shutdown: Command request\n${serialDump}`));

add('internal-error-then-command-request.log', 'A Python exception in a G-code command: the traceback names the fault, Command request follows it', 'gcode.py _process_commands',
  session(goodRun(5010, 2) + `\nInternal error on command:"BED_SCREWS_ADJUST"\n${HOST_TRACE("AttributeError: 'NoneType' object has no attribute 'get_status'")}\n${hostShutdown('Internal error on command:"BED_SCREWS_ADJUST"')}\nMCU 'mcu' shutdown: Command request\n${serialDump}`));

add('host-reason-no-rule.log', 'A host shutdown reason no rule knows, followed by stepcompress errors and Command request', 'mcu.py send_with_response, stepper.py',
  session(goodRun(5010, 2) + `\n${hostShutdown("Timeout on wait for 'tmcuart_response' response")}\nMCU 'mcu' shutdown: Command request\n${serialDump}\nInternal error on command:"G1"\n${HOST_TRACE('stepper.error: Internal error in stepcompress')}`));

add('lost-communication-cascade.log', 'Lost communication, then the errors it causes: stepcompress, TMC reads, Command request', 'mcu.py check_timeout, stepper.py, extras/tmc_uart.py',
  session(goodRun(5010, 2) + `\nTimeout with MCU 'mcu' (eventtime=5014.912345)\n${hostShutdown("Lost communication with MCU 'mcu'")}\n${serialDump}\nMCU 'rpi' shutdown: Command request\nstepcompress o=6 i=0 c=29 a=0: Invalid sequence\nInternal error on command:"G1"\n${HOST_TRACE('stepper.error: Internal error in stepcompress')}\nUnable to read tmc uart 'stepper_x' register GSTAT`));

add('adc-then-tmc.log', 'ADC out of range, then a TMC read failing because the MCU is already shut down', 'src/adccmds.c, extras/tmc_uart.py',
  session(goodRun(5010, 2) + `\n${mcuShutdown('ADC out of range', `\nSensor 'extruder' temperature 19.120 not in range 180.000:350.000\n`)}\nUnable to read tmc uart 'stepper_x' register GSTAT`));

add('dump-noise.log', 'A shutdown followed by the request dumps, whose text quotes other failure messages', 'mcu.py check_timeout, webhooks.py, gcode.py dump_debug',
  session(goodRun(5010, 2) + `\nTimeout with MCU 'mcu' (eventtime=5014.912345)\n${hostShutdown("Lost communication with MCU 'mcu'")}\nDumping gcode input 1 blocks\nRead 5014.1: 'M117 Timer too close\\n'\nDumping 2 requests for client 1\nReceived 5014.2: b'{"method": "gcode/script", "params": {"script": "M117 ADC out of range"}}'\nSent 5014.3: b'{"result": "TMC \\'stepper_x\\' reports error: DRV_STATUS: 00000000"}'\nHeater extruder not heating at expected rate\nInternal error in stepcompress\nMCU 'mcu' shutdown: Timer too close`));

add('tmc-failed-to-init.log', 'A TMC driver that did not answer at startup, then a healthy run: logged at info level and not fatal', 'extras/tmc.py _handle_connect',
  session(`TMC stepper_x failed to init: Unable to read tmc uart 'stepper_x' register IFCNT\n${goodRun(5010, 4)}`));

add('tmc-init-then-timer.log', 'The same startup message, then an unrelated Timer too close', 'extras/tmc.py _handle_connect, src/sched.c',
  session(`TMC stepper_x failed to init: Unable to read tmc uart 'stepper_x' register IFCNT\n${goodRun(5010, 2)}\n${mcuShutdown('Timer too close', HINT_TIMER)}`));

add('tmc-all-ones.log', 'A TMC status of ffffffff, where every flag reads as set: docs/TMC_Drivers.md says this points at SPI', 'extras/tmc.py, docs/TMC_Drivers.md',
  session(goodRun(5010, 2) + `\n${hostShutdown("TMC 'stepper_x' reports error: DRV_STATUS: ffffffff reset=1(Reset) ot=1(OvertempError!) otpw=1(OvertempWarning!) s2ga=1(ShortToGND_A!) s2gb=1(ShortToGND_B!) cs_actual=31")}`));

add('tmc-cs-actual-reset.log', 'A TMC driver reset, in the lowercase field name extras/tmc2130.py writes', 'extras/tmc2130.py FieldFormatters, docs/TMC_Drivers.md',
  session(goodRun(5010, 2) + `\n${hostShutdown("TMC 'stepper_y' reports error: DRV_STATUS: 80100000 stst=1 cs_actual=0(Reset?)")}`));

add('connect-mcu-already-shutdown.log', 'MCU error during connect where the reason is only in the traceback', 'klippy.py _connect, mcu.py',
  session(`MCU error during connect\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect\n    cb()\nmcu.error: Can not update MCU 'mcu' config as it is shutdown\nCan not update MCU 'mcu' config as it is shutdown\n\nOnce the underlying issue is corrected, use the\n"FIRMWARE_RESTART" command to reset the firmware, reload the\nconfig, and restart the host software.\nError configuring printer`, { mcu: false }));
add('connect-crc-mismatch.log', 'MCU error during connect with a message no rule knows, where the reason is only in the traceback', 'klippy.py _connect, mcu.py',
  session(`MCU error during connect\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect\n    cb()\nmcu.error: MCU 'mcu' CRC does not match config\nMCU 'mcu' CRC does not match config\n\nOnce the underlying issue is corrected, use the\n"FIRMWARE_RESTART" command to reset the firmware, reload the\nconfig, and restart the host software.\nError configuring printer`, { mcu: false }));

add('connect-unhandled.log', 'Unhandled exception during connect with an ImportError on the last traceback line', 'klippy.py _connect',
  session(`Unhandled exception during connect\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect\n    cb()\nImportError: cannot import name 'soft_unicode' from 'markupsafe'`, { mcu: false }));

add('previous-mcu-shutdown.log', 'An MCU still shut down from before this Klipper start', 'extras/error_mcu.py _check_mcu_shutdown',
  session(`Transition to shutdown state: MCU shutdown\nPrevious MCU 'mcu' shutdown: ADC out of range\n\nThis generally occurs when a heater temperature exceeds\nits configured min_temp or max_temp.${FIRMWARE_RESTART_TAIL}`));

add('dump-cut-off.log', 'A log that ends part way through the config dump, so most of the config is missing', 'configfile.py log_config',
  `${START()}\n===== Config file =====\n[mcu]\nserial = /dev/serial/by-id/usb-Klipper_stm32f103xe_ABC123-if00\n\n[stepper_x]\nstep_pin = PB13\n`);

add('dump-cut-off-then-start.log', 'A config dump with no end marker, then a complete Klipper start (two logs joined together)', 'configfile.py log_config, klippy.py run',
  `${START()}\n===== Config file =====\n[mcu]\nserial = /dev/ttyACM0\n` + session(goodRun(6010, 3), { mono: 6000.0, preamble: false }));

add('old-step-distance.log', 'A running Klipper from before step_distance was removed: the options that replaced it are not required there', 'docs/Config_Changes.md 20211102',
  session(goodRun(5010, 3), {
    v: 'v0.9.1-616-g28f60f7e',
    cfg: CONFIG_DUMP.replace(/microsteps = 16\nrotation_distance = [\d.]+/g, 'step_distance = 0.0125'),
  }));

add('shared-heater.log', 'A second extruder sharing a heater, valid before shared_heater was removed', 'docs/Config_Changes.md 20240215',
  session(goodRun(5010, 3), {
    v: 'v0.10.0-100-g1a2b3c4d',
    cfg: CONFIG_DUMP + `\n\n[extruder1]\nstep_pin = PA1\ndir_pin = PA2\nmicrosteps = 16\nrotation_distance = 33\nnozzle_diameter = 0.4\nfilament_diameter = 1.75\nshared_heater = extruder`,
  }));

add('rollover-real-order.log', 'A rotated log in the order queuelogger.py writes it: names sorted, so the config comes before the versions', 'queuelogger.py doRollover, klippy.py _read_config',
  `${configBlock()}\n${MCU_VERSION_LINES()}\n${PREAMBLE()}\n=============== Log rollover at Mon Nov  2 00:00:00 2026 ===============\n${goodRun(90000, 3)}\n${mcuShutdown('Timer too close', HINT_TIMER)}`);

add('connect-failed-then-estop.log', 'A failed connect, then the user pressing emergency stop: the stop is not what went wrong', 'serialhdl.py connect_uart, webhooks.py',
  session(`mcu 'mcu': Starting serial connect\nMCU error during connect\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect\n    cb()\nmcu.error: mcu 'mcu': Unable to connect\nTransition to shutdown state: Shutdown due to webhooks request`, { mcu: false }));

add('other-program-quoting.log', "A log from another program quoting Klipper's messages part way along its lines", 'none, this is not a Klipper log',
  `2026-11-01 10:00:00,000 [printer.py:state()] - mcu 'mcu': Unable to connect\n2026-11-01 10:00:01,000 [printer.py:state()] - Lost communication with MCU 'mcu'\n`);

add('not-klippy.log', "Another program's log with a .log name: none of the lines Klipper writes", 'none, this is not a Klipper log',
  `2026-11-01 10:00:00,000 [server.py:main()] - Starting Moonraker...\n2026-11-01 10:00:01,000 [app.py:listen()] - Server listening on port 7125\n`);

add('notes.txt', 'Plain text passed by mistake', 'none, this is not a Klipper file',
  `Shopping list\nnozzles, 0.4 mm\nmore PLA\nthe bed needs levelling again\n`);

add('fragment.cfg', 'A file meant for [include]: no [printer], and an [extruder] whose other options live in the main config, like config/sample-huvud-v0.61.cfg', 'config/sample-*.cfg',
  `# fragment\n[mcu toolhead]\nserial: /dev/ttyACM1\n\n[extruder]\nstep_pin: toolhead:PA1\ndir_pin: toolhead:PA2\nrotation_distance: 22\n`);

add('indented.cfg', 'Every option indented: configparser treats equal indents as new options, so this is a valid config', 'lib/configparser RawConfigParser._read',
  `[printer]\n  kinematics: none\n  max_velocity: 300\n  max_accel: 3000\n\n[input_shaper]\n\tshaper_freq_x: 50\n\tshaper_type_x: mzv\n\n[extruder]\n  step_pin: PA1\n  dir_pin: PA2\n  microsteps: 16\n  rotation_distance: 33\n  nozzle_diameter: 0.4\n  filament_diameter: 1.75\n  heater_pin: PA3\n  sensor_type: EPCOS 100K B57560G104F\n  sensor_pin: PA4\n  control: watermark\n  min_temp: 0\n  max_temp: 250\n`);

add('includes-save.cfg', 'An [include] and a SAVE_CONFIG block in one file, with a repeated option across the two', 'configfile.py',
  `[include macros.cfg]\n[include hardware/*.cfg]\n\n[printer]\nkinematics: none\nmax_velocity: 300\nmax_accel: 3000\n\n[extruder]\npid_Kp: 10\n\n#*# <---------------------- SAVE_CONFIG ---------------------->\n#*# DO NOT EDIT THIS BLOCK OR BELOW. The contents are auto-generated.\n#*#\n#*# [extruder]\n#*# pid_kp = 26.213\n#*#\n#*# [bed_mesh default]\n#*# version = 1\n#*# points =\n#*# \t  0.1, 0.2\n#*# \t  0.3, 0.4\n`);

add('removed-old-options.cfg', 'One option from every Config_Changes removal added in this audit', 'docs/Config_Changes.md',
  `[printer]\nkinematics: none\nmax_velocity: 300\nmax_accel: 3000\n[input_shaper]\n\n[neopixel a]\npin: PA1\ncolor_order_GRB: False\n\n[servo a]\npin: PA2\nenable: True\n\n[bed_mesh]\nmesh_min: 1, 1\nmesh_max: 2, 2\nmin_point: 1, 1\nmax_point: 2, 2\nbed_radius: 100\nradius: 100\nbed_shape: round\nsamples: 2\nsample_retract_dist: 2\nsamples_result: average\n\n[z_tilt]\nsamples: 2\n\n[extruder]\nactivate_gcode: T0\ndeactivate_gcode: T1\npressure_advance_lookahead_time: 0.01\n\n[firmware_retraction]\nz_hop: 1\n\n[skew_correction]\nxy_skew: 0.1\n\n[sx1509 a]\naddress: 62\n\n[tmc2660 stepper_x]\ndriver_VSENSE: 1\n\n[tmc2130 stepper_y]\ndriver_BLANK_TIME_SELECT: 1\n\n[endstop_phase stepper_z]\nendstop_phase: 1\n\n[display]\nlcd_type: st7567\n`);

// Rules added in 0.2.0. Message strings are from Klipper at the commit named in CHANGELOG.md.

// klippy/gcode.py _respond_error() logs a command error as a plain warning line, so each of these is
// one line (or two, where the message has a "See the ... option" second line) in the middle of a healthy log.
const commandError = (what, text) => add(what.file, what.title, what.src, session(goodRun(5010, 3) + `\n${text}\n` + goodRun(5020, 2)));

commandError({ file: 'homing-no-trigger.log', title: 'No trigger on an endstop after full movement', src: 'extras/homing.py homing_move' }, 'No trigger on x after full movement');
commandError({ file: 'homing-no-trigger-probe.log', title: 'No trigger on the probe after full movement', src: 'extras/homing.py homing_move' }, 'No trigger on probe after full movement');
commandError({ file: 'homing-wrapped-other.log', title: 'The "Error during homing move" wrapper in front of a different message, which is not a missing trigger', src: 'extras/homing.py homing_move' }, 'Error during homing move: Move out of range: 250.000 100.000 10.000 [0.000]');
commandError({ file: 'homing-still-triggered.log', title: 'Endstop still triggered after retract', src: 'extras/homing.py _do_home_rails' }, 'Endstop y still triggered after retract');
commandError({ file: 'probe-triggered-early.log', title: 'Probe triggered prior to movement', src: 'extras/homing.py probing_move' }, 'Probe triggered prior to movement');
commandError({ file: 'homing-comm-timeout.log', title: 'Communication timeout during homing', src: 'mcu.py MCU_endstop.home_wait' }, 'Communication timeout during homing');
commandError({ file: 'homing-comm-timeout-wrapped.log', title: 'Communication timeout during homing, in the wrapper homing_move adds', src: 'extras/homing.py homing_move, mcu.py MCU_endstop.home_wait' }, 'Error during homing z: Communication timeout during homing');
commandError({ file: 'extrude-cold.log', title: 'Extrude below minimum temp', src: 'kinematics/extruder.py check_move' }, "Extrude below minimum temp\nSee the 'min_extrude_temp' config option for details");
commandError({ file: 'extrude-only-too-long.log', title: 'Extrude only move too long', src: 'kinematics/extruder.py check_move' }, "Extrude only move too long (60.000mm vs 50.000mm)\nSee the 'max_extrude_only_distance' config option for details");
commandError({ file: 'extrude-cross-section.log', title: 'Move exceeds maximum extrusion', src: 'kinematics/extruder.py check_move' }, "Move exceeds maximum extrusion (2.640mm^2 vs 0.640mm^2)\nSee the 'max_extrude_cross_section' config option for details");
commandError({ file: 'bltouch-verify-sensor.log', title: 'BLTouch failed to verify sensor state', src: 'extras/bltouch.py _test_sensor' }, 'BLTouch failed to verify sensor state');
commandError({ file: 'bltouch-raise.log', title: 'BLTouch failed to raise probe', src: 'extras/bltouch.py _verify_raise_probe' }, 'BLTouch failed to raise probe');

add('command-errors-in-dump.log', 'A shutdown followed by the request dumps, whose text quotes the new command errors, and the same errors as the cascade after the shutdown', 'mcu.py check_timeout, webhooks.py, gcode.py dump_debug, extras/homing.py',
  session(goodRun(5010, 2) + `\nTimeout with MCU 'mcu' (eventtime=5014.912345)\n${hostShutdown("Lost communication with MCU 'mcu'")}\nDumping gcode input 5 blocks\n` +
    ["No trigger on x after full movement", "Endstop y still triggered after retract", "Probe triggered prior to movement", "Communication timeout during homing", "Extrude below minimum temp", "BLTouch failed to verify sensor state", "Scheduled digital out event will exceed max_duration", "Unable to open spi device"]
      .map((m, i) => `Read 5014.${i}: '${m}\\n'`).join('\n') +
    `\nMCU 'mcu' shutdown: Command request\n${serialDump}\nNo trigger on x after full movement\nEndstop y still triggered after retract\nProbe triggered prior to movement\nError during homing z: Communication timeout during homing\nExtrude below minimum temp\nSee the 'min_extrude_temp' config option for details\nBLTouch failed to raise probe`));

add('command-errors-midline.log', 'A healthy session where the new command errors are quoted at the end of a line, not at its start as Klipper writes them', 'none, a near miss for the command-error rules',
  session(goodRun(5010, 3) + `\nwebhooks: client 1: received No trigger on x after full movement\nmacro note: earlier error was Endstop y still triggered after retract\nthe words in a comment: Probe triggered prior to movement\nsaw this in the console: Extrude below minimum temp\nand: BLTouch failed to verify sensor state\n` + goodRun(5020, 2)));

add('probe-healthy.log', 'A healthy session whose probe and homing lines are all normal info output', 'extras/probe.py, extras/homing.py',
  session(goodRun(5010, 3) + `\nprobe at 100.000,100.000 is z=1.512500\nprobe at 100.000,100.000 is z=1.510000\nprobe: open\nEndstop x is now at 0.000\n` + goodRun(5020, 2)));

// Command errors a rule has no special advice for: each is raised in the Klipper source named in src.
commandError({ file: 'command-error-bed-mesh.log', title: 'A command error from the Klipper source that no specific rule knows', src: 'extras/bed_mesh.py generate_points' }, 'bed_mesh: min/max points too close together');
add('command-error-many.log', 'Several command errors in a session, one of them repeated by a macro: the last is what stopped things', 'extras/bed_mesh.py, extras/virtual_sdcard.py, extras/probe.py',
  session(goodRun(5010, 3) + `\nMust home before probe\n` + goodRun(5020, 1) + `\nbed_mesh: min/max points too close together\n` + goodRun(5030, 1) + `\nSDCARD_RESET_FILE cannot be run from the sdcard\nSDCARD_RESET_FILE cannot be run from the sdcard\n` + goodRun(5040, 1)));
add('command-error-near-miss.log', 'A healthy session whose lines only look like command errors: quoted in a request dump, in the middle of a line, or in a macro message', 'none, a near miss for command-error',
  session(goodRun(5010, 3) + `\nRead 5014.1: 'bed_mesh: min/max points too close together\\n'\nmy macro said: Must home before probe\n  Must home before probe\n` + goodRun(5020, 1)));
add('command-error-before-shutdown.log', 'A command error, then a shutdown, then the same kind of error as a consequence of the shutdown', 'extras/bed_mesh.py, extras/homing.py',
  session(goodRun(5010, 3) + `\nbed_mesh: min/max points too close together\n` + `\nTimeout with MCU 'mcu' (eventtime=5014.912345)\n${hostShutdown("Lost communication with MCU 'mcu'")}\nMust home before probe\n`));

// MCU errors at connect, from klippy/mcu.py _send_get_config and _connect, as logged by klippy/klippy.py.
const connectError = (msg) => `MCU error during connect\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 131, in _connect\n    self.send_event("klippy:mcu_identify")\nmsgproto.error: ${msg}\n\nDuring handling of the above exception, another exception occurred:\n\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 145, in _connect\nmcu.error: ${msg}\n${msg}\nOnce the underlying issue is corrected, use the\n"FIRMWARE_RESTART" command to reset the firmware, reload the\nconfig, and restart the host software.\nError configuring printer\n`;
add('mcu-config-shutdown.log', "MCU error during connect: Can not update MCU 'mcu' config as it is shutdown", 'mcu.py _send_get_config',
  session(connectError("Can not update MCU 'mcu' config as it is shutdown")));
add('mcu-reset-failed.log', "MCU error during connect: Failed automated reset of MCU 'mcu'", 'mcu.py _connect',
  session(connectError("Failed automated reset of MCU 'mcu'")));
add('shutdown-then-config-shutdown.log', "A Timer too close shutdown, a RESTART that hits Can not update MCU config, then a clean session", 'extras/error_mcu.py, mcu.py _send_get_config',
  session(goodRun(5010, 2) + '\n' + mcuShutdown('Timer too close', HINT_TIMER), { mono: 5000.0 }) +
  `Restarting printer\n` + session(connectError("Can not update MCU 'mcu' config as it is shutdown"), { mono: 6000.0, preamble: false, t: 'Sun Nov  1 11:00:00 2026' }) +
  `Restarting printer\n` + session(goodRun(7010, 5), { mono: 7000.0, preamble: false, t: 'Sun Nov  1 12:00:00 2026' }));
add('thermocouple-fault.log', 'MCU shutdown: Thermocouple reader fault', 'src/thermocouple.c',
  session(goodRun(5010, 3) + `\nTransition to shutdown state: MCU shutdown\nMCU 'mcu' shutdown: Thermocouple reader fault${FIRMWARE_RESTART_TAIL}\n${serialDump}`));

// serialhdl.py: Klipper retries for 90 seconds, so a log saved in that time has no "Unable to connect" line yet.
const retrying = (mcu) => `mcu '${mcu}': Starting serial connect\nmcu '${mcu}': Timeout on connect\nmcu '${mcu}': Wait for identify_response\nmcu '${mcu}': Timeout on connect\nmcu '${mcu}': Wait for identify_response\n`;
add('connect-still-retrying.log', 'A log saved while Klipper was still retrying its connection to the MCU', 'serialhdl.py _get_identify_data',
  session(retrying('mcu'), { mcu: false }));
add('connect-still-retrying-port.log', 'A log saved while Klipper was still retrying a serial port that does not exist', 'serialhdl.py connect_uart',
  session(`mcu 'mcu': Starting serial connect\nmcu 'mcu': Unable to open serial port: [Errno 2] could not open port /dev/serial/by-id/usb-Klipper-if00: No such file or directory\n`, { mcu: false }));
add('connect-retried-then-ok.log', 'One retry at startup, then the MCU answered and the session ran', 'serialhdl.py, mcu.py',
  session(goodRun(5010, 2), { preamble: true }).replace('Start printer', `mcu 'mcu': Timeout on connect\nStart printer`));
add('log-starts-with-failed-connect.log', 'A log that begins mid-run with a failed connect and no Start printer line, then a real run that dies with Timer too close, then a clean run', 'queuelogger.py doRollover, klippy.py _connect',
  connectError("mcu 'mcu': Unable to connect") + session(goodRun(5010, 2) + '\n' + mcuShutdown('Timer too close', HINT_TIMER), { mono: 5000.0 }) +
  `Restarting printer\n` + session(goodRun(7010, 5), { mono: 7000.0, preamble: false, t: 'Sun Nov  1 12:00:00 2026' }));

// MCU shutdown reasons from the C source. error_mcu.py has no hint for these, so there is no hint block.
const mcuShutdownOn = (mcu, reason) => `Transition to shutdown state: MCU shutdown\nMCU '${mcu}' shutdown: ${reason}${FIRMWARE_RESTART_TAIL}\n${serialDump}`;
add('max-duration-digital.log', 'MCU shutdown: Scheduled digital out event will exceed max_duration', 'src/gpiocmds.c',
  session(goodRun(5010, 3) + '\n' + mcuShutdownOn('mcu', 'Scheduled digital out event will exceed max_duration')));
add('max-duration-pwm.log', 'MCU shutdown: Scheduled pwm event will exceed max_duration', 'src/pwmcmds.c',
  session(goodRun(5010, 3) + '\n' + mcuShutdownOn('mcu', 'Scheduled pwm event will exceed max_duration')));
add('linux-spi-open.log', "MCU shutdown on the Linux host MCU: Unable to open spi device", 'src/linux/spidev.c',
  session(goodRun(5010, 3) + '\n' + mcuShutdownOn('rpi', 'Unable to open spi device')));
add('linux-gpio-open.log', "MCU shutdown on the Linux host MCU: Unable to open GPIO chip device, a sibling reason with a different cause", 'src/linux/gpio.c',
  session(goodRun(5010, 3) + '\n' + mcuShutdownOn('rpi', 'Unable to open GPIO chip device')));
add('linux-i2c-open.log', "MCU shutdown on the Linux host MCU: Unable to open i2c device", 'src/linux/i2c.c',
  session(goodRun(5010, 3) + '\n' + mcuShutdownOn('rpi', 'Unable to open i2c device')));

// klippy/serialhdl.py connect_canbus(): warn_prefix is "mcu 'name': ".
const CAN_PREFIX = "mcu 'mcu': ";
add('can-uuid-mismatch.log', 'CAN connect where the board answers but its canbus_uuid is not the configured one', 'serialhdl.py connect_canbus',
  session(`${CAN_PREFIX}Starting CAN connect\n` + `${CAN_PREFIX}Failed to match canbus_uuid - retrying..\n`.repeat(3) +
    `MCU error during connect\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect\n    cb()\n  File "/home/pi/klipper/klippy/serialhdl.py", line 130, in connect_canbus\n    self._error("Unable to connect")\nmcu.error: mcu 'mcu': Unable to connect`,
    { mcu: false }));
add('can-port-down.log', 'CAN connect where the CAN interface cannot be opened', 'serialhdl.py connect_canbus',
  session(`${CAN_PREFIX}Starting CAN connect\n` + `${CAN_PREFIX}Unable to open CAN port: [Errno 100] Network is down\n`.repeat(3) +
    `MCU error during connect\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect\n    cb()\nmcu.error: mcu 'mcu': Unable to connect`,
    { mcu: false }));
add('can-uuid-invalid.log', 'A canbus_uuid that is not a 12 digit hex number', 'serialhdl.py connect_canbus',
  session(`MCU error during connect\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect\n    cb()\n  File "/home/pi/klipper/klippy/serialhdl.py", line 129, in connect_canbus\n    self._error("Invalid CAN uuid")\nmcu.error: mcu 'mcu': Invalid CAN uuid\nmcu 'mcu': Invalid CAN uuid\n\nOnce the underlying issue is corrected, use the\n"FIRMWARE_RESTART" command to reset the firmware, reload the\nconfig, and restart the host software.\nError configuring printer`,
    { mcu: false }));

// Config errors klippy/klippy.py logs as "Config error" with the exception as the last traceback line.
const configErrorLog = (file, what, src, last, cfg) => add(file, what, src,
  session(`Config error\nTraceback (most recent call last):\n  File "/home/pi/klipper/klippy/klippy.py", line 135, in _connect\n    self._read_config()\n${last}`, { mcu: false, ...(cfg ? { cfg } : {}) }));
configErrorLog('config-error-pin-twice.log', 'Config error: pin used multiple times', 'pins.py lookup_pin', 'pins.error: pin PB13 used multiple times in config');
configErrorLog('config-error-chip-name.log', 'Config error: unknown pin chip name', 'pins.py parse_pin', "pins.error: Unknown pin chip name 'toolhead'");
configErrorLog('config-error-pin-description.log', 'Config error: invalid pin description', 'pins.py parse_pin', "pins.error: Invalid pin description '!^PA1'\nFormat is: [^~] [!] [chip_name:] pin_name");
configErrorLog('config-error-choice.log', 'Config error: not a valid choice', 'configfile.py getchoice', "configparser.Error: Choice '17' for option 'microsteps' in section 'stepper_x' is not a valid choice");
configErrorLog('config-error-kinematics.log', 'Config error: kinematics could not load', 'toolhead.py', "configparser.Error: Error loading kinematics 'cartesion'");
configErrorLog('config-error-tmc-section.log', 'Config error: tmc driver without its stepper section', 'extras/tmc.py TMCMicrostepHelper', "configparser.Error: Could not find config section '[stepper_q]' required by tmc driver");
configErrorLog('config-error-sensor.log', 'Config error: unknown temperature sensor', 'extras/heaters.py setup_sensor', "configparser.Error: Unknown temperature sensor 'EPCOS 100k'");

// Config lints added in 0.2.0

add('pin-twice.cfg', 'A pin set on two steppers, a heater and a fan, which Klipper refuses', 'pins.py lookup_pin',
  `[mcu]\nserial: /dev/serial/by-id/usb-Klipper_example\n\n[printer]\nkinematics: cartesian\nmax_velocity: 300\nmax_accel: 3000\n\n[stepper_x]\nstep_pin: PB13\ndir_pin: PB12\nenable_pin: !PB14\nmicrosteps: 16\nrotation_distance: 40\nendstop_pin: ^PC0\nposition_endstop: 0\nposition_max: 235\n\n[stepper_y]\nstep_pin: !PB13\ndir_pin: PB2\nenable_pin: !PB14\nmicrosteps: 16\nrotation_distance: 40\nendstop_pin: ^PC1\nposition_endstop: 0\nposition_max: 235\n\n[stepper_z]\nstep_pin: mcu:PB0\ndir_pin: PC5\nmicrosteps: 16\nrotation_distance: 8\nendstop_pin: ^PC2\nposition_endstop: 0.5\nposition_max: 250\n\n[extruder]\nstep_pin: PB0\ndir_pin: PB4\nmicrosteps: 16\nrotation_distance: 33\nnozzle_diameter: 0.4\nfilament_diameter: 1.75\nheater_pin: PC8\nsensor_type: EPCOS 100K B57560G104F\nsensor_pin: PA0\ncontrol: watermark\nmin_temp: 0\nmax_temp: 250\n\n[heater_bed]\nheater_pin: PC8\nsensor_type: ATC Semitec 104GT-2\nsensor_pin: PC4\ncontrol: watermark\nmin_temp: 0\nmax_temp: 130\n\n[heater_fan hotend_fan]\npin: PC8\n\n[input_shaper]\n`);

add('pin-sharing-ok.cfg', 'Pins Klipper lets two sections share (enable_pin) and the same pin name on different chips', 'pins.py lookup_pin, extras/stepper_enable.py',
  `[mcu]\nserial: /dev/serial/by-id/usb-Klipper_example\n\n[mcu toolhead]\ncanbus_uuid: 11aa22bb33cc\n\n[printer]\nkinematics: cartesian\nmax_velocity: 300\nmax_accel: 3000\n\n[stepper_x]\nstep_pin: PB13\ndir_pin: PB12\nenable_pin: !PB14\nmicrosteps: 16\nrotation_distance: 40\nendstop_pin: ^PC0\nposition_endstop: 0\nposition_max: 235\n\n[stepper_y]\nstep_pin: PB10\ndir_pin: PB2\nenable_pin: !PB14\nmicrosteps: 16\nrotation_distance: 40\nendstop_pin: ^PC1\nposition_endstop: 0\nposition_max: 235\n\n[stepper_z]\nstep_pin: PB0\ndir_pin: PC5\nmicrosteps: 16\nrotation_distance: 8\nendstop_pin: ^PC2\nposition_endstop: 0.5\nposition_max: 250\n\n[extruder]\nstep_pin: toolhead:PB0\ndir_pin: toolhead:PB1\nmicrosteps: 16\nrotation_distance: 33\nnozzle_diameter: 0.4\nfilament_diameter: 1.75\nheater_pin: toolhead:PA0\nsensor_type: EPCOS 100K B57560G104F\nsensor_pin: toolhead:PA1\ncontrol: watermark\nmin_temp: 0\nmax_temp: 250\n\n[heater_fan hotend_fan]\npin: PA0\n\n[input_shaper]\n`);

add('pin-twice-override.cfg', 'The same pin on two steppers, with every repeat named in duplicate_pin_override (Klipper allows it)', 'extras/duplicate_pin_override.py',
  `[mcu]\nserial: /dev/ttyACM0\n\n[printer]\nkinematics: none\nmax_velocity: 300\nmax_accel: 3000\n\n[stepper_z]\nstep_pin: PB0\ndir_pin: PC5\nmicrosteps: 16\nrotation_distance: 8\nendstop_pin: ^PC2\nposition_endstop: 0.5\nposition_max: 250\n\n[stepper_z1]\nstep_pin: !PB0\ndir_pin: PC6\nmicrosteps: 16\nrotation_distance: 8\n\n[duplicate_pin_override]\npins: PB0, PC9\n\n[input_shaper]\n`);

const TMC_BASE = (x, y, z) => `[mcu]\nserial: /dev/ttyACM0\n\n[printer]\nkinematics: cartesian\nmax_velocity: 300\nmax_accel: 3000\n\n[stepper_x]\nstep_pin: PB13\ndir_pin: PB12\nmicrosteps: ${x}\nrotation_distance: 40\nendstop_pin: ^PC0\nposition_endstop: 0\nposition_max: 235\n\n[stepper_y]\nstep_pin: PB10\ndir_pin: PB2\nmicrosteps: ${y}\nrotation_distance: 40\nendstop_pin: ^PC1\nposition_endstop: 0\nposition_max: 235\n\n[stepper_z]\nstep_pin: PB0\ndir_pin: PC5\nmicrosteps: ${z}\nrotation_distance: 8\nendstop_pin: ^PC2\nposition_endstop: 0.5\nposition_max: 250\n\n[input_shaper]\n`;
add('tmc-microsteps.cfg', 'TMC drivers whose stepper has a microsteps value the TMC code rejects, one it accepts, and a stepper with no TMC driver', 'extras/tmc.py TMCMicrostepHelper, stepper.py',
  TMC_BASE(17, 64, 12) + `\n[tmc2209 stepper_x]\nuart_pin: PC11\nrun_current: 0.6\n\n[tmc2130 stepper_y]\ncs_pin: PC12\nrun_current: 0.6\n`);
add('tmc-stepper-missing.cfg', 'A TMC driver section that names a stepper section the config does not have', 'extras/tmc.py TMCMicrostepHelper',
  TMC_BASE(16, 16, 16) + `\n[tmc2209 stepper_q]\nuart_pin: PC11\nrun_current: 0.6\n\n[tmc2209 stepper_x]\nuart_pin: PC11\nuart_address: 1\nrun_current: 0.6\n`);
add('tmc-ok.cfg', 'TMC drivers on steppers that exist, every microsteps value one the TMC code accepts', 'extras/tmc.py TMCMicrostepHelper',
  TMC_BASE(256, 16, 1) + `\n[tmc2209 stepper_x]\nuart_pin: PC11\nrun_current: 0.6\n\n[tmc2209 stepper_y]\nuart_pin: PC11\nuart_address: 1\nrun_current: 0.6\n\n[tmc5160 stepper_z]\ncs_pin: PC12\nrun_current: 0.6\n`);

const KIN = (kin, sections) => `[mcu]\nserial: /dev/ttyACM0\n\n[printer]\nkinematics: ${kin}\nmax_velocity: 300\nmax_accel: 3000\n\n${sections.map((s) => `[stepper_${s}]\nstep_pin: PB${s.charCodeAt(0) % 16}\ndir_pin: PC${s.charCodeAt(0) % 16}\nmicrosteps: 16\nrotation_distance: 40\nendstop_pin: ^PD${s.charCodeAt(0) % 16}\nposition_endstop: 0\nposition_max: 200\n`).join('\n')}\n[input_shaper]\n`;
add('kinematics-delta-cartesian-sections.cfg', 'kinematics: delta with the stepper_x, stepper_y and stepper_z sections of a cartesian config', 'kinematics/delta.py',
  KIN('delta', ['x', 'y', 'z']));
add('kinematics-corexy-no-y.cfg', 'kinematics: corexy with no stepper_y', 'kinematics/corexy.py',
  KIN('corexy', ['x', 'z']));
for (const [k, sec] of [['cartesian', ['x', 'y', 'z']], ['delta', ['a', 'b', 'c']], ['polar', ['bed', 'arm', 'z']], ['deltesian', ['left', 'right', 'y']]]) {
  add(`kinematics-ok-${k}.cfg`, `kinematics: ${k} with the stepper sections it reads`, `kinematics/${k}.py`, KIN(k, sec));
}
add('kinematics-none.cfg', 'kinematics: none needs no stepper sections', 'kinematics/none.py',
  KIN('none', []));

for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);

// Input that is damaged or is not what it claims to be. These are not assembled by add() because
// they must hold exact bytes, or because the header comment would change what they test.
const clean = files['timer-too-close.log'];

writeFileSync(join(out, 'fork-prefix.log'), clean.split('\n').map((l) => (l && !l.startsWith('#') ? `[INFO] 2026-11-01 10:00:00,000 [root] [klippy:run:265] ${l}` : l)).join('\n'));
writeFileSync(join(out, 'empty.log'), '');
writeFileSync(join(out, 'empty.cfg'), '');
writeFileSync(join(out, 'blank.cfg'), '\n   \n\t\n');
writeFileSync(join(out, 'bom.log'), '\ufeff' + clean);
writeFileSync(join(out, 'bom.cfg'), '\ufeff[printer]\nkinematics: none\nmax_velocity: 1\nmax_accel: 1\n[input_shaper]\n');
writeFileSync(join(out, 'crlf.cfg'), '[printer]\r\nkinematics: none\r\nmax_velocity: 1\r\nmax_accel: 1\r\n[input_shaper]\r\n[gcode_macro A]\r\ngcode:\r\n  G28\r\n\r\n  G1 X1\r\n');
// A log edited on several systems: CRLF, LF, a lone CR, and CR CR LF from a double conversion.
writeFileSync(join(out, 'mixed-endings.log'), clean.split('\n').map((l, i) => l + ['\r\n', '\n', '\r', '\r\r\n'][i % 4]).join(''));
writeFileSync(join(out, 'invalid-utf8.log'), Buffer.concat([Buffer.from(clean.slice(0, clean.indexOf('Transition to'))), Buffer.from([0xff, 0xfe, 0x80, 0xc3, 0x28, 0x0a]), Buffer.from(clean.slice(clean.indexOf('Transition to')))]));
// Power loss on an SD card leaves a run of NUL bytes where the tail of the file was, and the next
// start is written straight after it on the same line.
writeFileSync(join(out, 'power-loss-nul.log'), files['clean.log'] + '\0'.repeat(8192) + files['timer-too-close.log'].replace(/^#.*\n/gm, ''));
// PowerShell's "Get-Content klippy.log > copy.log" writes UTF-16 with a BOM.
writeFileSync(join(out, 'utf16.log'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(clean, 'utf16le')]));
// Deterministic noise, so the fixture never changes between runs: a gzip header, and raw bytes.
const noise = Buffer.alloc(4096);
for (let i = 0, x = 12345; i < noise.length; i++) {
  x = (x * 1103515245 + 12345) & 0x7fffffff;
  noise[i] = x >> 16 & 255;
}
writeFileSync(join(out, 'binary.gz'), Buffer.concat([Buffer.from([0x1f, 0x8b, 0x08, 0x00]), noise]));
writeFileSync(join(out, 'binary-named.log'), noise);
writeFileSync(join(out, 'nul-only.cfg'), Buffer.alloc(1024));


// CRLF copy of the clean log (Windows editors, some download paths).
writeFileSync(join(out, 'crlf.log'), files['clean.log'].replace(/\n/g, '\r\n').replace('# fixture: one complete', '# fixture: CRLF copy of clean.log, one complete'));
console.log(`wrote the fixtures to ${out}`);
