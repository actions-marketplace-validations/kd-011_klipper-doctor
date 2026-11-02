import { KLIPPER_DOCS, KLIPPER_SRC } from '../types.js';
// Message strings are copied from the Klipper source:
//   src/sched.c            try_shutdown("Timer too close")
//   src/gpiocmds.c         shutdown("Missed scheduling of next digital out event")
//   src/generic/timer_irq.c, src/stepper.c   "Rescheduled timer in the past", "Stepper too far in past"
//   klippy/mcu.py          invoke_shutdown("Lost communication with MCU '%s'"), "MCU '%s' spontaneous restart"
//   klippy/serialhdl.py    _error("Unable to connect"), "Unable to open serial port: %s"
//   klippy/extras/error_mcu.py   the hint text for each MCU shutdown reason
// The wording of each fix starts from the hint in error_mcu.py or the page named in `docs`.
const ERROR_MCU = KLIPPER_SRC + 'klippy/extras/error_mcu.py';
const FAQ = KLIPPER_DOCS + 'FAQ.html';
const uniq = (evs) => {
    const seen = new Set();
    const out = [];
    for (const e of evs) {
        if (e && !seen.has(e.line)) {
            seen.add(e.line);
            out.push(e);
        }
    }
    return out;
};
/** The session's cause, when an MCU reported it and it starts with one of Klipper's own prefixes. */
function mcuCause(ctx, ...prefixes) {
    const c = ctx.cause;
    return c?.mcu && prefixes.some((p) => c.reason.startsWith(p)) ? c : undefined;
}
// extras/error_mcu.py writes "Previous MCU" when the MCU says it was already shut down at connect.
const PREVIOUS = ' The MCU reported this as a previous shutdown, so the fault happened before this Klipper start.';
const PREVIOUS_FIX = ' Then run FIRMWARE_RESTART, as Klipper asks, to clear the old shutdown.';
/** Adds the "already shut down" note to a rule's text, when it applies. */
function aboutCause(c, detail, fix) {
    return c.previous ? { detail: detail + PREVIOUS, fix: fix + PREVIOUS_FIX } : { detail, fix };
}
const timerTooCloseFix = 'Check the host for processes using a lot of CPU, high swap use, disk errors, overheating or unstable power, then run FIRMWARE_RESTART.';
export const timerTooClose = {
    id: 'mcu-timer-too-close',
    severity: 'error',
    title: 'Timer too close',
    detail: 'The micro-controller shut down because a command reached it after the time it was meant to run. Klipper says this often means the host computer is overloaded.',
    fix: timerTooCloseFix,
    docs: ERROR_MCU,
    check(ctx) {
        const c = mcuCause(ctx, 'Timer too close');
        if (!c)
            return null;
        return {
            ...aboutCause(c, `MCU '${c.mcu}' shut down with "Timer too close": a command reached it after the time it was scheduled to run. Klipper's own hint is that this often indicates the host computer is overloaded: other processes using too much CPU, high swap use, disk errors, overheating or unstable voltage.`, timerTooCloseFix),
            evidence: uniq([c.ev, ctx.shutdown]),
        };
    },
};
const missedSchedulingFix = 'Work through the "Lost communication with MCU" hardware checklist: USB cable, power supply, wiring.';
export const missedScheduling = {
    id: 'mcu-missed-scheduling',
    severity: 'error',
    title: 'Missed scheduling of next event',
    detail: 'The micro-controller did not get the next command in time. Klipper says this points to an intermittent communication failure between the micro-controller and the host.',
    fix: missedSchedulingFix,
    docs: FAQ + '#i-keep-getting-random-lost-communication-with-mcu-errors',
    check(ctx) {
        const c = mcuCause(ctx, 'Missed scheduling of next ');
        if (!c)
            return null;
        return {
            ...aboutCause(c, `MCU '${c.mcu}' shut down with "${c.reason}". Klipper's hint is that this is generally an intermittent communication failure between the micro-controller and the host.`, missedSchedulingFix),
            evidence: uniq([c.ev, ctx.shutdown]),
        };
    },
};
export const lostCommunication = {
    id: 'mcu-lost-communication',
    severity: 'error',
    title: 'Lost communication with MCU',
    detail: 'The host stopped hearing from the micro-controller. The Klipper FAQ says this is commonly hardware on the USB link or power.',
    fix: 'Use a good USB cable with secure plugs, a good power supply for the host, and check the printer wiring and power supply load.',
    docs: FAQ + '#i-keep-getting-random-lost-communication-with-mcu-errors',
    check(ctx) {
        const hit = ctx.match(/Lost communication with MCU '([^']+)'/);
        if (!hit)
            return null;
        const timeout = ctx.find(/^Timeout with MCU /);
        return {
            detail: `Klipper lost contact with MCU '${hit.m[1]}' and shut down. The Klipper FAQ says this is commonly caused by hardware errors on the USB connection: a poor cable or loose plugs, a weak power supply for the host (look for "under voltage" warnings), an overloaded printer power supply, frayed or crimped stepper, heater or sensor wires, or the printer and host 5V supplies being mixed.`,
            evidence: uniq([timeout, hit.ev, ctx.shutdown]),
        };
    },
};
export const connectFailed = {
    id: 'mcu-connect-failed',
    severity: 'error',
    title: 'Unable to connect to the MCU',
    detail: 'Klipper tried to open the micro-controller for 90 seconds and gave up.',
    fix: 'Check the board is powered and plugged in, and that serial in [mcu] matches `ls /dev/serial/by-id/*`.',
    docs: FAQ + '#wheres-my-serial-port',
    check(ctx) {
        const hit = ctx.match(/Unable to connect\s*$/);
        if (!hit)
            return null;
        const name = /mcu '([^']+)'/.exec(hit.ev.text)?.[1] ?? 'mcu';
        const opens = ctx.findAll(/Unable to open (?:serial |CAN )?port: /, 500);
        const open = opens[opens.length - 1];
        const missing = !!open && /No such file or directory/.test(open.text);
        const can = !!ctx.find(/Starting CAN connect|Unable to open CAN port: /);
        // serialhdl.py connect_canbus() logs this at info level each time the board's uuid is not the configured one.
        const mismatch = ctx.find(/Failed to match canbus_uuid/);
        let detail = `Klipper could not connect to MCU '${name}' within 90 seconds ("Unable to connect").`;
        let fix = 'Check the board is powered and plugged in, that the serial path in [mcu] matches `ls /dev/serial/by-id/*`, and that the board has Klipper firmware.';
        if (open)
            detail += ` The last port error was: ${open.text.replace(/^mcu '[^']*': /, '').replace(/[.]?$/, '.')}`;
        if (mismatch) {
            detail += ' Something answered on the CAN bus, but the uuid it reported does not match the canbus_uuid in the [mcu] section ("Failed to match canbus_uuid"), and Klipper kept retrying until the 90 seconds were up.';
            fix = 'Run canbus_query.py on the host (see the CANBUS docs) to read the uuid the board reports, and put that in canbus_uuid. The tool lists only boards that are not configured yet, so a board Klipper already holds will not show up there.';
        }
        else if (can) {
            fix = 'Check that the CAN interface is up, the board is powered and on the bus, and that canbus_uuid in the [mcu] section matches the board (see the CANBUS docs).';
        }
        else if (missing) {
            detail += ` That path does not exist, so the board is not showing up under that name.`;
            fix = 'Run `ls /dev/serial/by-id/*` on the host and copy the name it prints into serial: under [mcu]. If nothing is listed, check the USB cable and board power.';
        }
        return { detail, fix, evidence: uniq([mismatch, open, hit.ev]) };
    },
};
const adcFix = 'Check the sensor and its wiring, and that sensor_type and sensor_pin match the sensor.';
export const adcOutOfRange = {
    id: 'mcu-adc-out-of-range',
    severity: 'error',
    title: 'ADC out of range',
    detail: 'A temperature sensor reading went outside its configured min_temp / max_temp, so the micro-controller shut everything down.',
    fix: adcFix,
    docs: ERROR_MCU,
    check(ctx) {
        const c = mcuCause(ctx, 'ADC out of range');
        if (!c)
            return null;
        const clar = ctx.match(/Sensor '([^']+)' temperature (\S+) not in range (\S+):(\S+)/);
        let detail = 'A temperature sensor reading went outside the range set by min_temp and max_temp, so the micro-controller shut down ("ADC out of range"). Klipper says this generally occurs when a heater temperature goes beyond its configured min_temp or max_temp.';
        if (clar) {
            const [, sensor, temp, min, max] = clar.m;
            // extras/adc_temperature.py writes "?" when it cannot turn the reading into a temperature.
            const read = temp === '?' ? 'had a reading Klipper could not turn into a temperature' : `read ${temp} C`;
            detail = `Sensor '${sensor}' ${read}, outside its allowed range ${min}:${max} C, so the micro-controller shut down ("ADC out of range"). Klipper reads min_temp and max_temp from that sensor's section in the config.`;
        }
        return { ...aboutCause(c, detail, adcFix), evidence: uniq([clar?.ev, c.ev, ctx.shutdown]) };
    },
};
const stepRateFix = 'Lower the speed or acceleration limits, or use fewer microsteps on the axis that was moving.';
export const stepRate = {
    id: 'mcu-step-rate',
    severity: 'error',
    title: 'Stepping faster than the MCU can manage',
    detail: '"Rescheduled timer in the past" and "Stepper too far in past" mean the micro-controller was asked to step at a higher rate than it can produce.',
    fix: stepRateFix,
    docs: KLIPPER_DOCS + 'Benchmarks.html',
    check(ctx) {
        const c = mcuCause(ctx, 'Rescheduled timer in the past', 'Stepper too far in past');
        if (!c)
            return null;
        return {
            ...aboutCause(c, `MCU '${c.mcu}' shut down with "${c.reason}". Klipper's hint is that this generally occurs when the micro-controller has been asked to step at a rate higher than it can reach. The step rate is steps per second, which grows with speed and with microsteps.`, stepRateFix),
            evidence: uniq([c.ev, ctx.shutdown]),
        };
    },
};
// src/basecmd.c answers an emergency_stop command with "Command request", and klippy/mcu.py sends that
// command to every MCU on any shutdown. So this rule only fires when the stop itself was the event:
// the MCU named it first, or the host says who asked: gcode.py "Shutdown due to M112 command",
// webhooks.py "Shutdown due to webhooks request" (the emergency_stop endpoint, docs/API_Server.md),
// extras/gcode_macro.py "Shutdown due to %s" and extras/display/menu_keys.py "Shutdown due to kill button!".
const STOP_FIX = 'Find what sent M112 (a macro, a slicer end script, a button), or check the log above for a host error.';
function askedToStop(reason) {
    if (!reason.startsWith('Shutdown due to '))
        return undefined;
    if (reason.includes('M112')) {
        return {
            detail: `Klipper shut down because it received an M112 G-code command, the emergency stop ("${reason}"). The "Command request" the MCUs report after that only confirms the stop.`,
            fix: 'Find what sent M112: a macro, a slicer script or a button.',
        };
    }
    if (reason.includes('webhooks')) {
        return {
            detail: `Klipper shut down because its API received an emergency stop ("${reason}"). That is the request a web interface sends from its emergency stop button. The "Command request" the MCUs report after that only confirms the stop.`,
            fix: 'If nobody pressed emergency stop, look for another program or macro using Klipper\'s API. Then run FIRMWARE_RESTART.',
        };
    }
    return {
        detail: `Klipper shut down on request ("${reason}"). The "Command request" the MCUs report after that only confirms the stop.`,
        fix: 'Find what asked for the emergency stop, then run FIRMWARE_RESTART.',
    };
}
export const commandRequest = {
    id: 'mcu-command-request',
    severity: 'error',
    title: 'Shutdown requested by command',
    detail: 'The micro-controller shut down on request. Klipper says this occurs in response to an M112 G-code command or an internal error in the host software.',
    fix: STOP_FIX,
    docs: ERROR_MCU,
    check(ctx) {
        const c = ctx.cause;
        if (!c)
            return null;
        const asked = c.mcu ? undefined : askedToStop(c.reason);
        if (asked) {
            // Stopping a printer that had already failed to start is not what went wrong with it.
            if (ctx.find(/^(?:Config error|Protocol error|MCU error during connect|Unhandled exception during connect)/))
                return null;
            return { ...asked, evidence: uniq([c.ev, ctx.shutdown]) };
        }
        if (!mcuCause(ctx, 'Command request'))
            return null;
        return {
            ...aboutCause(c, `MCU '${c.mcu}' shut down with "Command request". Klipper's hint is that this occurs in response to an M112 G-code command (emergency stop) or an internal error in the host software, so the cause is in what was sent, not in the hardware.`, STOP_FIX),
            evidence: uniq([c.ev, ctx.shutdown]),
        };
    },
};
export const spontaneousRestart = {
    id: 'mcu-spontaneous-restart',
    severity: 'error',
    title: 'MCU restarted by itself',
    detail: 'The micro-controller announced it had started up again without Klipper asking it to.',
    fix: 'Treat it like a power or USB fault: check the board supply, the host power supply and the cable.',
    docs: FAQ + '#i-keep-getting-random-lost-communication-with-mcu-errors',
    check(ctx) {
        const hit = ctx.match(/MCU '([^']+)' spontaneous restart/);
        if (!hit)
            return null;
        return {
            detail: `MCU '${hit.m[1]}' sent its start-up message in the middle of a session ("spontaneous restart"), so it had reset. The Klipper FAQ notes that power fluctuations to the micro-controller's USB chip can reset it.`,
            evidence: uniq([hit.ev, ctx.shutdown]),
        };
    },
};
// klippy/klippy.py _connect(): msgproto.error -> "Protocol error", then extras/error_mcu.py
// _check_protocol_error() logs "MCU Protocol error", "Your Klipper version is: ...",
// "MCU(s) which should be updated:" and "Up-to-date MCU(s):".
export const protocolMismatch = {
    id: 'mcu-protocol-mismatch',
    severity: 'error',
    title: 'MCU firmware does not match the host',
    detail: 'Klipper could not talk to the micro-controller because its firmware is a different version from the host software. Klipper says this is frequently caused by older firmware on the MCU.',
    fix: 'Recompile and flash the MCU firmware from the same Klipper checkout, then RESTART.',
    docs: KLIPPER_DOCS + 'Installation.html#building-and-flashing-the-micro-controller',
    check(ctx) {
        const hit = ctx.match(/^MCU Protocol error\s*$/) ?? ctx.match(/^Protocol error\s*$/) ?? ctx.match(/\bUnknown command: /);
        if (!hit)
            return null;
        const host = ctx.match(/^Your Klipper version is: (.+)$/);
        const old = [];
        const head = ctx.find(/^MCU\(s\) which should be updated:/);
        if (head) {
            for (const e of ctx.after(head.line, 8)) {
                const m = /^(\S+): Current version (.+)$/.exec(e.text);
                if (m)
                    old.push(`${m[1]} (${m[2]})`);
                else if (/^Up-to-date/.test(e.text))
                    break;
            }
        }
        let detail = 'Klipper could not talk to the micro-controller ("Protocol error"): the MCU firmware and the host software are different versions.';
        if (host)
            detail += ` Host Klipper is ${host.m[1]}.`;
        if (old.length)
            detail += ` MCU(s) Klipper says to update: ${old.join(', ')}.`;
        else {
            const stale = ctx.session.mcus.filter((m) => m.version && ctx.session.klipperVersion && m.version !== ctx.session.klipperVersion);
            if (stale.length)
                detail += ` MCU(s) reporting a different version: ${stale.map((m) => `${m.name} (${m.version})`).join(', ')}.`;
        }
        return { detail, evidence: uniq([hit.ev, host?.ev, head]) };
    },
};
// Shutdown reasons that error_mcu.py has no hint for.
//   src/gpiocmds.c   shutdown("Scheduled digital out event will exceed max_duration")
//   src/pwmcmds.c    shutdown("Scheduled pwm event will exceed max_duration")
// docs/MCU_Commands.md (config_digital_out) describes max_duration as a safety check: the host may leave a pin at
// a non-default value only for that long without another update, "to ensure the host does not enable the heater
// and then go off-line". docs/Config_Reference.md ([output_pin] maximum_mcu_duration) says the MCU shuts down if
// the host can not keep up with an update.
export const maxDuration = {
    id: 'mcu-max-duration',
    severity: 'error',
    title: 'Output left on too long without an update',
    detail: 'The micro-controller shut down because an output pin stayed at a non-default value longer than its max_duration without the host sending another update.',
    fix: 'Treat it as the host not keeping up: look just before the shutdown for host load, "Timeout with MCU" or lost-communication lines, and work through the Lost communication checklist. Then run FIRMWARE_RESTART.',
    docs: KLIPPER_DOCS + 'MCU_Commands.html#common-micro-controller-objects',
    check(ctx) {
        const c = mcuCause(ctx, 'Scheduled digital out event will exceed max_duration', 'Scheduled pwm event will exceed max_duration');
        if (!c)
            return null;
        const kind = c.reason.includes('pwm') ? 'PWM' : 'digital';
        return {
            ...aboutCause(c, `MCU '${c.mcu}' shut down with "${c.reason}". A ${kind} output pin was left at a non-default value for longer than its max_duration without a fresh update from the host. Klipper uses that limit as a safety check so the host cannot switch on a heater and then go off-line, and the Config Reference says the MCU shuts down if the host can not keep up with an update. Klipper has no hint of its own for this reason, so the message does not say which pin it was.`, 'Treat it as the host not keeping up: look just before the shutdown for host load, "Timeout with MCU" or lost-communication lines, and work through the Lost communication checklist. Then run FIRMWARE_RESTART.'),
            evidence: uniq([c.ev, ctx.shutdown]),
        };
    },
};
// src/linux/spidev.c spi_open(): open("/dev/spidevB.D") failing is shutdown("Unable to open spi device").
// src/linux/i2c.c i2c_open(): shutdown("Unable to open i2c device"). Both belong to the Linux host MCU
// (docs/RPi_microcontroller.md), which says to enable each bus with raspi-config.
export const linuxBusOpen = {
    id: 'mcu-linux-bus-open',
    severity: 'error',
    title: 'Linux host MCU could not open an SPI or I2C device',
    detail: 'The Linux host micro-controller shut down because it could not open the SPI or I2C device a config section asked for.',
    fix: 'Enable the bus on the host with sudo raspi-config (Interfacing options), reboot, and check the spi_bus or i2c_bus in the config names a device that exists.',
    docs: KLIPPER_DOCS + 'RPi_microcontroller.html#optional-enabling-spi',
    check(ctx) {
        const c = mcuCause(ctx, 'Unable to open spi device', 'Unable to open i2c device');
        if (!c)
            return null;
        const spi = c.reason.includes('spi');
        const bus = spi ? 'SPI' : 'I2C';
        return {
            ...aboutCause(c, `MCU '${c.mcu}' shut down with "${c.reason}". That is the Linux host micro-controller failing to open a ${bus} device (/dev/spidev for SPI, an I2C bus device for I2C) that a section in the config uses. The Klipper docs for the Linux host MCU say the ${bus} driver has to be enabled on the host first, with sudo raspi-config.`, `Enable ${bus} on the host with sudo raspi-config (Interfacing options) and reboot. Then check that the ${spi ? 'spi_bus' : 'i2c_bus'} in the config names a device that exists, and run FIRMWARE_RESTART.`),
            evidence: uniq([c.ev, ctx.shutdown]),
        };
    },
};
// klippy/serialhdl.py connect_canbus(): int(canbus_uuid, 16) failing, or a value over 12 hex digits, is
// self._error("Invalid CAN uuid"), which klippy.py reports as "MCU error during connect".
export const canUuidInvalid = {
    id: 'can-uuid-invalid',
    severity: 'error',
    title: 'canbus_uuid is not a valid uuid',
    detail: 'Klipper could not read the canbus_uuid in the [mcu] section as a hexadecimal number of at most 12 digits.',
    fix: 'Run canbus_query.py on the host to read the board\'s uuid, and copy it exactly into canbus_uuid in the [mcu] section.',
    docs: KLIPPER_DOCS + 'CANBUS.html#finding-the-canbus_uuid-for-new-micro-controllers',
    check(ctx) {
        const hit = ctx.match(/mcu '([^']+)': Invalid CAN uuid\s*$/);
        if (!hit)
            return null;
        return {
            detail: `Klipper stopped connecting to MCU '${hit.m[1]}' with "Invalid CAN uuid": the canbus_uuid in its section is not a hexadecimal number of at most 12 digits. The CAN bus docs show a uuid like 11aa22bb33cc, which canbus_query.py prints for each board.`,
            evidence: [hit.ev],
        };
    },
};
