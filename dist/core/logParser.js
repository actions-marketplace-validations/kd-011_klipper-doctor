// Markers and line formats below were checked against the Klipper source:
//   klippy/klippy.py       "Starting Klippy...", "Args: ", "Git version: ", "Start printer at ",
//                          "Transition to shutdown state: "
//   klippy/configfile.py   log_config(): "===== Config file =====" ... "======================="
//   klippy/mcu.py          "Loaded MCU '%s' %d commands (%s / %s)"
//   klippy/extras/statistics.py  "Stats %.1f: ..."
//   klippy/queuelogger.py  doRollover() repeats the version and config blocks at the top of a new file
//   klippy/mcu.py, extras/error_mcu.py, extras/verify_heater.py, extras/tmc.py, extras/tmc_uart.py,
//   extras/tmc2130.py, toolhead.py   the line starts in LOG_LINE
const CONFIG_START = '===== Config file =====';
const START_PRINTER = 'Start printer at ';
const STARTING_KLIPPY = 'Starting Klippy...';
const SHUTDOWN = 'Transition to shutdown state: ';
const ROLLOVER = '=============== Log rollover';
/** Evidence and rule matching never need more of a line than this. Longer lines are damage or dumps. */
const MAX_LINE = 16 * 1024;
const LOG_START = [STARTING_KLIPPY, START_PRINTER, 'Git version: ', 'Stats ', SHUTDOWN, ROLLOVER, 'Loaded MCU ', 'Timeout with MCU ', 'Lost communication with MCU ', 'Unable to read tmc ', 'Unable to write tmc ', 'Move out of range: ', 'Must home axis first: ', 'MCU error during connect', 'Unhandled exception'];
const LOG_LINE = /^(?:(?:Previous )?MCU '[^']+' (?:is_)?shutdown: |Heater .+ not heating at expected rate|TMC '[^']+' reports error: |TMC \S+ failed to init: |mcu '[^']+': |(?:Config|Protocol) error\s*$)/;
/**
 * Line ends as they turn up in logs that have been through other systems: LF, CR LF, a lone CR and
 * the CR CR LF of a double conversion. A log file is mostly LF, so that path stays a plain split.
 */
export function splitLines(text) {
    if (!text.includes('\r')) {
        const lines = text.split('\n');
        if (lines[lines.length - 1] === '')
            lines.pop();
        return lines;
    }
    const lines = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c !== 10 && c !== 13)
            continue;
        lines.push(text.slice(start, i));
        if (c === 13) {
            const j = text.charCodeAt(i + 1) === 13 ? i + 2 : i + 1;
            if (text.charCodeAt(j) === 10)
                i = j;
        }
        start = i + 1;
    }
    if (start < text.length)
        lines.push(text.slice(start));
    return lines;
}
// Some vendor forks log with a format string that puts this in front of every message.
const FORK_PREFIX = /^\[(?:[A-Z]+|Level None)\] \d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d+ \[[^\]]*\] \[[^\]]*\] /;
/** Removes the fork's prefix, in place, so the rest of the engine sees the lines Klipper's source writes. */
export function stripForkPrefix(lines) {
    if (!lines.slice(0, 400).some((l) => FORK_PREFIX.test(l)))
        return;
    for (let i = 0; i < lines.length; i++)
        lines[i] = lines[i].replace(FORK_PREFIX, '');
}
export function looksLikeLog(lines) {
    for (const l of lines) {
        if (l === CONFIG_START || LOG_START.some((m) => l.startsWith(m)))
            return true;
        if (l.length < MAX_LINE && LOG_LINE.test(l))
            return true;
    }
    return false;
}
function newSession(index, startLine) {
    return {
        index,
        startLine,
        endLine: startLine,
        mcus: [],
        statsCount: 0,
        notable: [],
        shutdowns: [],
    };
}
const evidence = (line, text) => ({
    line,
    text: text.length > MAX_LINE ? text.slice(0, MAX_LINE) : text,
});
const endsCutOffDump = (line) => line === CONFIG_START ||
    line.startsWith(START_PRINTER) ||
    line.startsWith(STARTING_KLIPPY) ||
    line.startsWith('Stats ') ||
    line.startsWith(SHUTDOWN) ||
    line.startsWith(ROLLOVER);
function parseStatsTime(line) {
    // "Stats 5003.2: gcodein=0 ..."
    const colon = line.indexOf(':', 6);
    if (colon < 0)
        return undefined;
    const t = Number(line.slice(6, colon));
    return Number.isFinite(t) ? t : undefined;
}
export function parseLog(lines) {
    const sessions = [];
    let cur = newSession(1, 1);
    let curHasStart = false;
    let starts = 0;
    let inConfig = false;
    // A segment that already holds runtime activity belongs to an earlier Klipper start. A bare
    // preamble or version block (no Start line, Stats or shutdown yet) stays attached to its own start.
    // This matters for a log rotated at midnight, which opens with the rollover block instead of
    // "Start printer at" (klippy/queuelogger.py doRollover).
    const hasRuntime = () => curHasStart || cur.statsCount > 0 || cur.shutdowns.length > 0;
    const close = (endLine) => {
        cur.endLine = endLine;
        sessions.push(cur);
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const no = i + 1;
        if (inConfig) {
            // The dump ends at a line made only of "=" characters. Config text never has one.
            if (line.length >= 3 && /^=+$/.test(line)) {
                inConfig = false;
                continue;
            }
            if (!endsCutOffDump(line)) {
                if (cur.config)
                    cur.config.lines.push(line);
                continue;
            }
            // No end marker, and Klipper's own lines have started again: two logs joined together.
            if (cur.config)
                cur.config.cutOff = true;
            inConfig = false;
        }
        if (line.startsWith('Stats ')) {
            const t = parseStatsTime(line);
            cur.statsCount++;
            if (t !== undefined) {
                const p = { line: no, time: t };
                if (!cur.firstStats)
                    cur.firstStats = p;
                cur.lastStats = p;
            }
            continue;
        }
        if (line.startsWith(STARTING_KLIPPY)) {
            if (hasRuntime()) {
                close(no - 1);
                cur = newSession(sessions.length + 1, no);
                curHasStart = false;
            }
            cur.notable.push(evidence(no, line));
            continue;
        }
        if (line.startsWith(START_PRINTER)) {
            if (hasRuntime()) {
                close(no - 1);
                cur = newSession(sessions.length + 1, no);
            }
            curHasStart = true;
            starts++;
            const m = line.length < MAX_LINE ? /^Start printer at (.+) \((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)\)\s*$/.exec(line) : null;
            if (m) {
                cur.startedAt = m[1];
                cur.monotonicStart = Number(m[3]);
            }
            cur.notable.push(evidence(no, line));
            continue;
        }
        if (line === CONFIG_START) {
            cur.config = { startLine: no + 1, lines: [] };
            inConfig = true;
            continue;
        }
        // Klipper logs nothing that starts with "#" except lines of dumped build files; skip them.
        if (line.charCodeAt(0) === 35)
            continue;
        if (line.startsWith('Git version: ')) {
            const m = /^Git version: '([^']{0,200})'/.exec(line);
            if (m)
                cur.klipperVersion = m[1];
        }
        else if (line.startsWith('Loaded MCU ')) {
            const m = /^Loaded MCU '([^']{1,200})' \d+ commands \((\S{1,200}) \/ /.exec(line);
            if (m)
                cur.mcus.push({ name: m[1], version: m[2] });
        }
        else if (line.startsWith(SHUTDOWN)) {
            cur.shutdowns.push(evidence(no, line));
        }
        cur.notable.push(evidence(no, line));
    }
    if (inConfig && cur.config)
        cur.config.cutOff = true;
    close(lines.length);
    // A Klipper RESTART keeps the process, so the version block is only logged once.
    let version;
    for (const s of sessions) {
        if (s.klipperVersion)
            version = s.klipperVersion;
        else if (version)
            s.klipperVersion = version;
    }
    return { lines, sessions, startCount: Math.max(starts, 1) };
}
/** Whole seconds the session ran, from the Stats lines, or undefined. */
export function sessionUptime(s) {
    if (!s.lastStats)
        return undefined;
    const from = s.monotonicStart ?? s.firstStats?.time;
    if (from === undefined)
        return undefined;
    const sec = s.lastStats.time - from;
    return sec >= 0 ? Math.round(sec) : undefined;
}
