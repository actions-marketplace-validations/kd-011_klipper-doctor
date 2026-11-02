import { parseConfig } from './configParser.js';
import { looksLikeLog, parseLog, splitLines } from './logParser.js';
import type { LogSession } from './logParser.js';
import { configRules } from './rules/config/index.js';
import { crashRules } from './rules/crash/index.js';
import { failureEvidence, noFailure, noFailureMeta, unknownReason, unknownReasonMeta } from './rules/crash/fallback.js';
import type { ConfigContext, CrashContext } from './rules/types.js';
import { KLIPPER_SRC } from './rules/types.js';
import type { AnalyzeOptions, Evidence, Finding, Hit, Report, RuleMeta, Severity } from './types.js';

export type { AnalyzeOptions, Evidence, Finding, McuInfo, Report, ReportMeta, Severity } from './types.js';
export { toMarkdown, toText, verdict, countBySeverity } from './report.js';
export { VERSION } from './version.js';

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, note: 2 };

const noConfigDumpMeta: RuleMeta = {
  id: 'no-config-dump',
  severity: 'note',
  title: 'No config dump in the log',
  detail:
    'Klipper writes the full config into klippy.log near the top of each start, between "===== Config file =====" and a line of "=". This session has none, usually because the log was cut off or rotated.',
  fix: 'Run klipper-doctor on the whole klippy.log, or on printer.cfg itself.',
  docs: KLIPPER_SRC + 'klippy/configfile.py',
};

function toFinding(meta: RuleMeta, hit: Hit): Finding {
  return {
    id: meta.id,
    severity: hit.severity ?? meta.severity,
    title: hit.title ?? meta.title,
    detail: hit.detail ?? meta.detail,
    fix: hit.fix ?? meta.fix,
    docs: meta.docs,
    evidence: [...hit.evidence].sort((a, b) => a.line - b.line),
  };
}

function sortFindings(list: Finding[]): Finding[] {
  // Stable: severity first, then position in the input, then rule order.
  return list
    .map((f, i) => ({ f, i }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] ||
        (a.f.evidence[0]?.line ?? 1e12) - (b.f.evidence[0]?.line ?? 1e12) ||
        a.i - b.i,
    )
    .map((x) => x.f);
}

function analyzeConfigLines(
  cfgLines: string[],
  firstLine: number,
  raw: boolean,
  lineText: (n: number) => string,
  klipperVersion?: string,
) {
  const cfg = parseConfig(cfgLines, firstLine, raw);
  const ctx: ConfigContext = { cfg, raw, lineText, klipperVersion };
  const findings: Finding[] = [];
  for (const rule of configRules) {
    if (rule.scope === 'raw' && !raw) continue;
    if (rule.needsComplete && raw && cfg.includes.length > 0) continue;
    for (const hit of rule.check(ctx)) findings.push(toFinding(rule, hit));
  }
  return { cfg, findings: sortFindings(findings) };
}

function makeCrashContext(
  session: LogSession,
  sessionCount: number,
  config: CrashContext['config'],
): CrashContext {
  const notable = session.notable;
  const indexAfter = (line: number): number => {
    let lo = 0;
    let hi = notable.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((notable[mid] as Evidence).line <= line) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const match = (re: RegExp) => {
    for (const ev of notable) {
      const m = re.exec(ev.text);
      if (m) return { m, ev };
    }
    return undefined;
  };
  return {
    session,
    sessionCount,
    config,
    notable,
    shutdown: session.shutdowns[0],
    match,
    find: (re) => match(re)?.ev,
    findAll(re, limit = 20) {
      const out: Evidence[] = [];
      for (const ev of notable) {
        if (re.test(ev.text)) {
          out.push(ev);
          if (out.length >= limit) break;
        }
      }
      return out;
    },
    after: (line, count) => notable.slice(indexAfter(line), indexAfter(line) + count),
  };
}

export function analyze(text: string, opts: AnalyzeOptions = {}): Report {
  const lines = splitLines(text);
  const isLog = looksLikeLog(lines) || (opts.filename !== undefined && /\.log(\.\d+)?$/i.test(opts.filename));
  const lineText = (n: number) => lines[n - 1] ?? '';

  if (!isLog) {
    const { findings } = analyzeConfigLines(lines, 1, true, lineText);
    return {
      meta: { inputKind: 'printer.cfg', mcus: [], sessions: 0, linesRead: lines.length, analysedSession: 0 },
      config: findings,
      crash: [],
    };
  }

  const parsed = parseLog(lines);
  const session = parsed.sessions[parsed.sessions.length - 1] as LogSession;

  let config: Finding[];
  let cfg;
  if (session.config) {
    const r = analyzeConfigLines(session.config.lines, session.config.startLine, false, lineText, session.klipperVersion);
    config = r.findings;
    cfg = r.cfg;
  } else {
    config = [toFinding(noConfigDumpMeta, { evidence: [] })];
  }

  const ctx = makeCrashContext(session, parsed.sessions.length, cfg);
  const crash: Finding[] = [];
  for (const rule of crashRules) {
    const hit = rule.check(ctx);
    if (hit) crash.push(toFinding(rule, hit));
  }
  // Only an error-level finding explains a Klipper failure. Warning-level findings (gcode command
  // errors such as Move out of range) leave Klipper running, so they must not hide an unexplained
  // shutdown that is also in the log.
  if (!crash.some((f) => f.severity === 'error')) {
    if (failureEvidence(ctx).length > 0) {
      const hit = unknownReason(ctx);
      if (hit) crash.push(toFinding(unknownReasonMeta, hit));
    } else if (crash.length === 0) {
      crash.push(toFinding(noFailureMeta, noFailure(ctx)));
    }
  }

  const mcus = new Map<string, { name: string; version?: string }>();
  for (const m of session.mcus) mcus.set(m.name, m);

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

export interface RuleInfo extends RuleMeta {
  kind: 'config' | 'crash';
}

/** Every rule klipper-doctor can fire, for the README table and for docs. */
export function rulesMetadata(): RuleInfo[] {
  const strip = (r: RuleMeta): RuleMeta => ({ id: r.id, severity: r.severity, title: r.title, detail: r.detail, fix: r.fix, docs: r.docs });
  return [
    ...crashRules.map((r) => ({ kind: 'crash' as const, ...strip(r) })),
    { kind: 'crash' as const, ...unknownReasonMeta },
    { kind: 'crash' as const, ...noFailureMeta },
    ...configRules.map((r) => ({ kind: 'config' as const, ...strip(r) })),
    { kind: 'config' as const, ...noConfigDumpMeta },
  ];
}
