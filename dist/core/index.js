import { causalLines, findCause } from './cause.js';
import { parseConfig } from './configParser.js';
import { looksLikeLog, parseLog, splitLines, stripForkPrefix } from './logParser.js';
import { configRules } from './rules/config/index.js';
import { crashRules } from './rules/crash/index.js';
import { unparseableLine } from './rules/config/structure.js';
import { failureEvidence, noFailure, noFailureMeta, unknownReason, unknownReasonMeta } from './rules/crash/fallback.js';
import { KLIPPER_DOCS, KLIPPER_SRC } from './rules/types.js';
export { toMarkdown, toText, verdict, countBySeverity } from './report.js';
export { VERSION } from './version.js';
const SEVERITY_RANK = { error: 0, warning: 1, note: 2 };
const noConfigDumpMeta = {
    id: 'no-config-dump',
    severity: 'note',
    title: 'No config dump in the log',
    detail: 'Klipper writes the full config into klippy.log near the top of each start, between "===== Config file =====" and a line of "=". This session has none, usually because the log was cut off or only part of it was pasted.',
    fix: 'Run klipper-doctor on the whole klippy.log, or on printer.cfg itself.',
    docs: KLIPPER_SRC + 'klippy/configfile.py',
};
const unusableInputMeta = {
    id: 'unusable-input',
    severity: 'error',
    title: 'Not a Klipper log or config',
    detail: 'The input is not a klippy.log or a printer.cfg, so there is nothing to check.',
    fix: 'Give klipper-doctor a klippy.log or a printer.cfg.',
    docs: KLIPPER_DOCS + 'FAQ.html',
};
// A finding quotes its input, and a damaged file can hold one line of many megabytes.
const clip = (s, max) => (s.length > max ? s.slice(0, max - 3) + '...' : s);
function toFinding(meta, hit) {
    return {
        id: meta.id,
        severity: hit.severity ?? meta.severity,
        title: clip(hit.title ?? meta.title, 300),
        detail: clip(hit.detail ?? meta.detail, 4000),
        fix: hit.fix ?? meta.fix,
        docs: hit.docs ?? meta.docs,
        evidence: [...hit.evidence]
            .sort((a, b) => a.line - b.line)
            .map((e) => (e.text.length > 2000 ? { line: e.line, text: clip(e.text, 2000) } : e)),
    };
}
function sortFindings(list) {
    // Stable: severity first, then position in the input, then rule order.
    return list
        .map((f, i) => ({ f, i }))
        .sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] ||
        (a.f.evidence[0]?.line ?? 1e12) - (b.f.evidence[0]?.line ?? 1e12) ||
        a.i - b.i)
        .map((x) => x.f);
}
function analyzeConfigLines(cfgLines, firstLine, raw, lineText, klipperVersion, cutOff = false) {
    const cfg = parseConfig(cfgLines, firstLine, raw);
    const ctx = { cfg, raw, lineText, klipperVersion };
    // A raw file can be one part of a config. A complete dump in a log is the whole of it.
    const partial = cutOff || (raw && (cfg.includes.length > 0 || !cfg.hasSection('printer')));
    const findings = [];
    for (const rule of configRules) {
        if (rule.scope === 'raw' && !raw)
            continue;
        if (rule.needsComplete && partial)
            continue;
        for (const hit of rule.check(ctx))
            findings.push(toFinding(rule, hit));
    }
    return { cfg, findings: sortFindings(findings) };
}
function makeCrashContext(session, sessionCount, config) {
    const notable = session.notable;
    const cause = findCause(session);
    const causal = causalLines(session, cause);
    const indexAfter = (line) => {
        let lo = 0;
        let hi = notable.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (notable[mid].line <= line)
                lo = mid + 1;
            else
                hi = mid;
        }
        return lo;
    };
    const match = (re) => {
        for (const ev of causal) {
            const m = re.exec(ev.text);
            if (m)
                return { m, ev };
        }
        return undefined;
    };
    return {
        session,
        sessionCount,
        config,
        notable,
        cause,
        shutdown: session.shutdowns[0],
        match,
        find: (re) => match(re)?.ev,
        findAll(re, limit = 20) {
            const out = [];
            for (const ev of causal) {
                if (re.test(ev.text)) {
                    out.push(ev);
                    if (out.length >= limit)
                        break;
                }
            }
            return out;
        },
        after: (line, count) => notable.slice(indexAfter(line), indexAfter(line) + count),
    };
}
function runCrashRules(ctx) {
    const crash = [];
    for (const rule of crashRules) {
        const hit = rule.check(ctx);
        if (hit)
            crash.push(toFinding(rule, hit));
    }
    return crash;
}
/** The latest session before the last one that failed, with what the rules make of it. */
function findEarlierFailure(parsed) {
    for (let i = parsed.sessions.length - 2; i >= 0; i--) {
        const session = parsed.sessions[i];
        const ctx = makeCrashContext(session, parsed.sessions.length, undefined);
        if (failureEvidence(ctx).length === 0)
            continue;
        const unknown = unknownReason(ctx);
        const finding = runCrashRules(ctx).find((f) => f.severity === 'error') ?? (unknown ? toFinding(unknownReasonMeta, unknown) : undefined);
        if (finding)
            return { index: session.index, finding };
    }
    return undefined;
}
/** A BOM, and the NUL bytes of a power loss or of a UTF-16 file read as UTF-8, get in the way of every match. */
function cleanInput(text) {
    let out = text;
    if (out.includes('\0')) {
        out = out.replace(/\0+/g, '');
        // A UTF-16 BOM read as UTF-8 is two replacement characters.
        if (out.startsWith('\ufffd\ufffd'))
            out = out.slice(2);
    }
    const bom = out.charCodeAt(0) === 0xfeff;
    return { text: bom ? out.slice(1) : out, bom };
}
/** Control characters and failed decodes, which a text file has few of, in the first 64 kB. */
function looksBinary(text) {
    const n = Math.min(text.length, 65536);
    let odd = 0;
    for (let i = 0; i < n; i++) {
        const c = text.charCodeAt(i);
        if (c === 0xfffd || c === 127 || (c < 32 && c !== 9 && c !== 10 && c !== 12 && c !== 13))
            odd++;
    }
    return odd * 10 > n;
}
const LOG_NAME = /\.log(\.\d[\w-]*)?$/i;
function unusable(kind, linesRead, hit) {
    return {
        meta: { inputKind: kind, mcus: [], sessions: 0, linesRead, analysedSession: 0 },
        config: [toFinding(unusableInputMeta, hit)],
        crash: [],
    };
}
function analyzeText(input, filename) {
    const { text, bom } = cleanInput(input);
    const lines = splitLines(text);
    stripForkPrefix(lines);
    const named = filename !== undefined && LOG_NAME.test(filename);
    const lineText = (n) => lines[n - 1] ?? '';
    const namedKind = named ? 'klippy.log' : 'printer.cfg';
    if (!/\S/.test(text)) {
        return unusable(namedKind, lines.length, {
            severity: 'warning',
            title: 'The file is empty',
            detail: 'There is no text to check. If this is a klippy.log, Klipper may not have started since the log was cleared, or the copy was cut short.',
            fix: 'Check the file, and copy it again if it should have text in it.',
            evidence: [],
        });
    }
    const recognised = looksLikeLog(lines);
    if (!recognised && looksBinary(text)) {
        return unusable(namedKind, lines.length, {
            title: 'This looks like a binary or compressed file',
            detail: 'klipper-doctor reads text, and this is mostly bytes that are not text. A .zip or .gz has to be unpacked first.',
            fix: 'Unpack it if it is an archive, then give klipper-doctor the klippy.log or printer.cfg inside.',
            evidence: [],
        });
    }
    if (!recognised && !named) {
        const { cfg, findings } = analyzeConfigLines(lines, 1, true, lineText);
        // Other programs' logs quote config sections, so a [section] is not enough to call it a config.
        const options = cfg.sections.reduce((n, s) => n + s.options.length, 0);
        const mostlyNotConfig = cfg.problems.length > 20 && cfg.problems.length > options;
        if ((cfg.sections.length === 0 && cfg.includes.length === 0) || mostlyNotConfig) {
            return unusable('printer.cfg', lines.length, {
                severity: cfg.problems.length > 0 ? 'error' : 'warning',
                title: cfg.problems.length > 0 ? 'This does not look like a Klipper log or config' : 'The file is empty apart from comments',
                detail: cfg.problems.length > 0
                    ? 'It has none of the lines Klipper writes to klippy.log and no [section] headers, so there is nothing to check, and Klipper would not accept it as a config.'
                    : 'It has no [section] headers, so there is nothing to check.',
                fix: 'Give klipper-doctor a klippy.log or a printer.cfg.',
                evidence: [],
            });
        }
        if (bom) {
            // Python keeps the BOM (klippy/configfile.py read_config_file opens the file as plain text), so the
            // first line is not a section header to configparser. Checked against RawConfigParser.
            findings.unshift(toFinding(unparseableLine, {
                title: 'The file starts with a byte order mark',
                detail: 'The file starts with a byte order mark (BOM), which some Windows editors add. Klipper does not remove it, so it cannot read the first line even though it looks right, and stops with a "no section headers" error.',
                fix: 'Save the file as UTF-8 without a BOM.',
                evidence: [{ line: 1, text: lineText(1) }],
            }));
        }
        return {
            meta: { inputKind: 'printer.cfg', mcus: [], sessions: 0, linesRead: lines.length, analysedSession: 0 },
            config: findings,
            crash: [],
        };
    }
    const parsed = parseLog(lines);
    const session = parsed.sessions[parsed.sessions.length - 1];
    let config;
    let cfg;
    if (session.config) {
        const r = analyzeConfigLines(session.config.lines, session.config.startLine, false, lineText, session.klipperVersion, session.config.cutOff);
        config = r.findings;
        cfg = r.cfg;
        if (session.config.cutOff) {
            config.push(toFinding(noConfigDumpMeta, {
                title: 'The config dump in this log is cut off',
                detail: `The config dump that starts on line ${session.config.startLine} has no end marker, so part of the config is missing. Rules that need the whole config were skipped.`,
                evidence: [],
            }));
        }
    }
    else if (recognised) {
        config = [toFinding(noConfigDumpMeta, { evidence: [] })];
    }
    else {
        config = [toFinding(noConfigDumpMeta, {
                title: 'This may not be a klippy.log',
                detail: 'This file has none of the lines Klipper writes, so it may not be a klippy.log. Moonraker and KlipperScreen keep their own logs, and they can quote Klipper\'s messages, so treat any finding from this file with care.',
                fix: 'Look for klippy.log, usually in printer_data/logs.',
                evidence: [],
            })];
    }
    const ctx = makeCrashContext(session, parsed.sessions.length, cfg);
    const crash = runCrashRules(ctx);
    // Only an error-level finding explains a Klipper failure. Warning-level findings (gcode command
    // errors such as Move out of range) leave Klipper running, so they must not hide an unexplained
    // shutdown that is also in the log.
    if (!crash.some((f) => f.severity === 'error')) {
        if (failureEvidence(ctx).length > 0) {
            const hit = unknownReason(ctx);
            if (hit)
                crash.push(toFinding(unknownReasonMeta, hit));
        }
        else {
            const earlier = findEarlierFailure(parsed);
            if (crash.length === 0 || earlier)
                crash.push(toFinding(noFailureMeta, noFailure(ctx, earlier, recognised)));
        }
    }
    const mcus = new Map();
    for (const m of session.mcus)
        mcus.set(m.name, m);
    return {
        meta: {
            inputKind: 'klippy.log',
            klipperVersion: session.klipperVersion,
            mcus: [...mcus.values()],
            sessions: parsed.sessions.length,
            linesRead: lines.length,
            analysedSession: session.index,
        },
        config,
        crash,
    };
}
/** Never throws: a file that breaks the engine gets a finding saying so, and asks for a report. */
export function analyze(text, opts = {}) {
    try {
        const filename = typeof opts?.filename === 'string' ? opts.filename : undefined;
        return analyzeText(typeof text === 'string' ? text : '', filename);
    }
    catch (e) {
        return unusable('printer.cfg', 0, {
            title: 'klipper-doctor could not read this file',
            detail: `klipper-doctor hit an internal error reading this file: ${e instanceof Error ? e.message : 'unknown error'}. That is a bug in klipper-doctor, not a problem with your printer.`,
            fix: 'Please open an issue at https://github.com/kd-011/klipper-doctor/issues.',
            evidence: [],
        });
    }
}
/** Every rule klipper-doctor can fire, for the README table and for docs. */
export function rulesMetadata() {
    const strip = (r) => ({ id: r.id, severity: r.severity, title: r.title, detail: r.detail, fix: r.fix, docs: r.docs });
    return [
        ...crashRules.map((r) => ({ kind: 'crash', ...strip(r) })),
        { kind: 'crash', ...unknownReasonMeta },
        { kind: 'crash', ...noFailureMeta },
        ...configRules.map((r) => ({ kind: 'config', ...strip(r) })),
        { kind: 'config', ...noConfigDumpMeta },
        { kind: 'config', ...unusableInputMeta },
    ];
}
