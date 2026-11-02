// Klipper logs one "Transition to shutdown state:" per session, for the first thing that went wrong
// (klippy/klippy.py invoke_shutdown returns straight away once in the shutdown state). Everything
// after it is a consequence or a dump:
//   klippy/mcu.py _shutdown      sends emergency_stop to each MCU, and src/basecmd.c answers
//                                "Command request", so that reason follows ANY shutdown
//   klippy/mcu.py _analyze_shutdown   logs "MCU '%s' shutdown: %s" for every MCU, with an empty reason
//                                for one that had not reported yet, in no particular order
//   klippy/gcode.py, webhooks.py dump recent commands and requests, whose text can quote any message
// Before extras/error_mcu.py the reason was on the Transition line itself, and "is_shutdown" there
// meant what "Previous MCU" means now.
const SHUTDOWN = 'Transition to shutdown state: ';
const MCU_LINE = /^(Previous )?MCU '([^']+)' (is_)?shutdown: (.*)$/;
const SENSOR_LINE = /^Sensor '[^']+' temperature \S+ not in range /;
function fromMcuLine(text, ev) {
    const m = MCU_LINE.exec(text);
    const reason = m?.[4]?.trim();
    if (!m || !reason)
        return undefined;
    return { reason, mcu: m[2], previous: !!m[1] || !!m[3], ev };
}
/** The first reason an MCU gave. Command request is only the answer if no MCU gave another. */
function firstMcuReason(lines, after) {
    let command;
    for (const ev of lines) {
        if (ev.line <= after)
            continue;
        const c = fromMcuLine(ev.text, ev);
        if (!c)
            continue;
        if (!c.reason.startsWith('Command request'))
            return c;
        command ??= c;
    }
    return command;
}
export function findCause(session) {
    const first = session.shutdowns[0];
    if (!first)
        return firstMcuReason(session.notable, 0);
    const reason = first.text.slice(SHUTDOWN.length).trim();
    const onLine = fromMcuLine(reason, first);
    if (onLine)
        return onLine;
    if (reason === 'MCU shutdown') {
        return firstMcuReason(session.notable, first.line) ?? { reason, previous: false, ev: first };
    }
    return { reason, previous: false, ev: first };
}
/**
 * The lines that can explain the failure: everything up to the first shutdown, plus the reason and
 * the sensor clarification that Klipper logs after it. Rules look only here, so a later cascade or a
 * quoted message in a dump cannot add a diagnosis. With no shutdown line every line counts.
 */
export function causalLines(session, cause) {
    const first = session.shutdowns[0];
    if (!first)
        return session.notable;
    const out = [];
    let sensor = false;
    for (const ev of session.notable) {
        if (ev.line <= first.line || ev === cause?.ev) {
            out.push(ev);
        }
        else if (!sensor && SENSOR_LINE.test(ev.text)) {
            sensor = true;
            out.push(ev);
        }
    }
    return out;
}
