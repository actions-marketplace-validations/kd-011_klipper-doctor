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
/** "MCU 'mcu' shutdown: <reason>" names the MCU that stopped. */
function mcuName(ctx, fallback = 'mcu') {
    const hit = ctx.match(/\bMCU '([^']+)' shutdown: /);
    return hit?.m[1] ?? fallback;
}
export const timerTooClose = {
    id: 'mcu-timer-too-close',
    severity: 'error',
    title: 'Timer too close',
    detail: 'The micro-controller shut down because a command reached it after the time it was meant to run. Klipper says this often means the host computer is overloaded.',
    fix: 'Check the host for processes using a lot of CPU, high swap use, disk errors, overheating or unstable power, then run FIRMWARE_RESTART.',
    docs: ERROR_MCU,
    check(ctx) {
        const hit = ctx.match(/\bTimer too close\b/);
        if (!hit)
            return null;
        return {
            detail: `MCU '${mcuName(ctx)}' shut down with "Timer too close": a command reached it after the time it was scheduled to run. Klipper's own hint is that this often indicates the host computer is overloaded: other processes using too much CPU, high swap use, disk errors, overheating or unstable voltage.`,
            evidence: uniq([hit.ev, ctx.shutdown]),
        };
    },
};
export const missedScheduling = {
    id: 'mcu-missed-scheduling',
    severity: 'error',
    title: 'Missed scheduling of next event',
    detail: 'The micro-controller did not get the next command in time. Klipper says this points to an intermittent communication failure between the micro-controller and the host.',
    fix: 'Work through the "Lost communication with MCU" hardware checklist: USB cable, power supply, wiring.',
    docs: FAQ + '#i-keep-getting-random-lost-communication-with-mcu-errors',
    check(ctx) {
        const hit = ctx.match(/Missed scheduling of next (.+)$/);
        if (!hit)
            return null;
        return {
            detail: `MCU '${mcuName(ctx)}' shut down with "Missed scheduling of next ${hit.m[1]}". Klipper's hint is that this is generally an intermittent communication failure between the micro-controller and the host.`,
            evidence: uniq([hit.ev, ctx.shutdown]),
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
        let detail = `Klipper could not connect to MCU '${name}' within 90 seconds ("Unable to connect").`;
        let fix = 'Check the board is powered and plugged in, that the serial path in [mcu] matches `ls /dev/serial/by-id/*`, and that the board has Klipper firmware.';
        if (open)
            detail += ` The last port error was: ${open.text.replace(/^mcu '[^']*': /, '').replace(/[.]?$/, '.')}`;
        if (missing) {
            detail += ` That path does not exist, so the board is not showing up under that name.`;
            fix = 'Run `ls /dev/serial/by-id/*` on the host and copy the name it prints into serial: under [mcu]. If nothing is listed, check the USB cable and board power.';
        }
        return { detail, fix, evidence: uniq([open, hit.ev]) };
    },
};
export const adcOutOfRange = {
    id: 'mcu-adc-out-of-range',
    severity: 'error',
    title: 'ADC out of range',
    detail: 'A temperature sensor reading went outside its configured min_temp / max_temp, so the micro-controller shut everything down.',
    fix: 'Check the sensor and its wiring, and that sensor_type and sensor_pin match the sensor.',
    docs: ERROR_MCU,
    check(ctx) {
        const hit = ctx.match(/\bADC out of range\b/);
        if (!hit)
            return null;
        const clar = ctx.match(/Sensor '([^']+)' temperature (\S+) not in range (\S+):(\S+)/);
        let detail = 'A temperature sensor reading went outside the range set by min_temp and max_temp, so the micro-controller shut down ("ADC out of range"). Klipper says this generally occurs when a heater temperature goes beyond its configured min_temp or max_temp.';
        if (clar) {
            const [, sensor, temp, min, max] = clar.m;
            detail = `Sensor '${sensor}' read ${temp} C, outside its allowed range ${min}:${max} C, so the micro-controller shut down ("ADC out of range"). Klipper reads min_temp and max_temp from that sensor's section in the config.`;
        }
        return { detail, evidence: uniq([clar?.ev, hit.ev, ctx.shutdown]) };
    },
};
export const stepRate = {
    id: 'mcu-step-rate',
    severity: 'error',
    title: 'Stepping faster than the MCU can manage',
    detail: '"Rescheduled timer in the past" and "Stepper too far in past" mean the micro-controller was asked to step at a higher rate than it can produce.',
    fix: 'Lower the speed or acceleration limits, or use fewer microsteps on the axis that was moving.',
    docs: KLIPPER_DOCS + 'Benchmarks.html',
    check(ctx) {
        const hit = ctx.match(/\b(Rescheduled timer in the past|Stepper too far in past)\b/);
        if (!hit)
            return null;
        return {
            detail: `MCU '${mcuName(ctx)}' shut down with "${hit.m[1]}". Klipper's hint is that this generally occurs when the micro-controller has been asked to step at a rate higher than it can reach. The step rate is steps per second, which grows with speed and with microsteps.`,
            evidence: uniq([hit.ev, ctx.shutdown]),
        };
    },
};
export const commandRequest = {
    id: 'mcu-command-request',
    severity: 'error',
    title: 'Shutdown requested by command',
    detail: 'The micro-controller shut down on request. Klipper says this occurs in response to an M112 G-code command or an internal error in the host software.',
    fix: 'Find what sent M112 (a macro, a slicer end script, a button), or check the log above for a host error.',
    docs: ERROR_MCU,
    check(ctx) {
        const hit = ctx.match(/shutdown: Command request\b/);
        if (!hit)
            return null;
        return {
            detail: `MCU '${mcuName(ctx)}' shut down with "Command request". Klipper's hint is that this occurs in response to an M112 G-code command (emergency stop) or an internal error in the host software, so the cause is in what was sent, not in the hardware.`,
            evidence: uniq([hit.ev, ctx.shutdown]),
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
