import type { Finding, Report, Severity } from './types.js';
import { VERSION } from './version.js';

const ORDER: Severity[] = ['error', 'warning', 'note'];
const REPO = 'https://github.com/kd-011/klipper-doctor';

export function countBySeverity(report: Report): Record<Severity, number> {
  const c: Record<Severity, number> = { error: 0, warning: 0, note: 0 };
  for (const f of [...report.crash, ...report.config]) c[f.severity]++;
  return c;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function sessionBit(report: Report): string {
  const m = report.meta;
  if (m.inputKind !== 'klippy.log') return '';
  return m.sessions > 1 ? `session ${m.analysedSession} of ${m.sessions}` : '';
}

/** One line: what was checked and how it went. */
export function verdict(report: Report): string {
  const c = countBySeverity(report);
  const bits: string[] = [];
  if (c.error + c.warning === 0) {
    bits.push('no errors or warnings');
    if (c.note) bits.push(plural(c.note, 'note'));
  } else {
    bits.push(plural(c.error, 'error'), plural(c.warning, 'warning'), plural(c.note, 'note'));
  }
  const ctx: string[] = [];
  if (report.meta.klipperVersion) ctx.push(`Klipper ${report.meta.klipperVersion}`);
  const s = sessionBit(report);
  if (s) ctx.push(s);
  if (report.meta.suppressed) ctx.push(`${report.meta.suppressed} suppressed`);
  return bits.join(', ') + (ctx.length ? ` (${ctx.join(', ')})` : '');
}

function firstSentence(s: string): string {
  const m = /^(.*?[.!?])(?:\s|$)/s.exec(s);
  return (m ? (m[1] as string) : s).trim();
}

type Tagged = Finding & { kind: 'crash' | 'config' };

function tagged(report: Report): Tagged[] {
  return [
    ...report.crash.map((f) => ({ ...f, kind: 'crash' as const })),
    ...report.config.map((f) => ({ ...f, kind: 'config' as const })),
  ];
}

const where = (f: Finding) => (f.evidence[0] ? `, line ${f.evidence[0].line}` : '');

/** Paste-ready for Reddit or Discord: a verdict line, then findings grouped by severity. No tables. */
export function toMarkdown(report: Report): string {
  const out: string[] = [`**klipper-doctor**: ${verdict(report)}`];
  const all = tagged(report);
  for (const sev of ORDER) {
    const group = all.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    const label = sev === 'error' ? 'Errors' : sev === 'warning' ? 'Warnings' : 'Notes';
    out.push('', `**${label} (${group.length})**`);
    for (const f of group) {
      const fix = f.fix ? ` Fix: ${f.fix}` : '';
      out.push(`- **${f.title}** (${f.kind}${where(f)}): ${firstSentence(f.detail)}${fix}`);
    }
  }
  out.push('', `Checked with [klipper-doctor](${REPO}) ${VERSION}`);
  return out.join('\n');
}

const CODES = { reset: '\u001b[0m', bold: '\u001b[1m', dim: '\u001b[2m', red: '\u001b[31m', yellow: '\u001b[33m', cyan: '\u001b[36m', green: '\u001b[32m' };

function wrap(text: string, width: number, indent: string): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    if (cur && cur.length + 1 + word.length > width) {
      lines.push(indent + cur);
      cur = word;
    } else {
      cur = cur ? cur + ' ' + word : word;
    }
  }
  if (cur) lines.push(indent + cur);
  return lines;
}

export function toText(report: Report, opts: { color?: boolean; width?: number } = {}): string {
  const color = !!opts.color;
  const width = opts.width ?? 88;
  const paint = (code: keyof typeof CODES, s: string) => (color ? CODES[code] + s + CODES.reset : s);
  const sevPaint = (sev: Severity, s: string) => paint(sev === 'error' ? 'red' : sev === 'warning' ? 'yellow' : 'cyan', s);

  const m = report.meta;
  const out: string[] = [];
  const head: string[] = [m.inputKind];
  if (m.klipperVersion) head.push(`Klipper ${m.klipperVersion}`);
  if (m.mcus.length) head.push(`MCU ${m.mcus.map((x) => (x.version ? `${x.name} ${x.version}` : x.name)).join(', ')}`);
  if (m.sessions > 0) head.push(m.sessions > 1 ? `session ${m.analysedSession} of ${m.sessions}` : '1 session');
  head.push(`${m.linesRead} lines`);
  out.push(paint('bold', `klipper-doctor ${VERSION}`) + paint('dim', '  ' + head.join(' | ')), '');

  const section = (title: string, findings: Finding[]) => {
    if (findings.length === 0) return;
    out.push(paint('bold', title));
    for (const f of findings) {
      out.push(`  ${sevPaint(f.severity, f.severity.padEnd(7))} ${paint('bold', f.title)} ${paint('dim', `[${f.id}]`)}`);
      out.push(...wrap(f.detail, width - 10, '          '));
      if (f.fix) out.push(...wrap(`Fix: ${f.fix}`, width - 10, '          ').map((l, i) => (i === 0 ? l.replace('Fix:', paint('green', 'Fix:')) : l)));
      for (const e of f.evidence.slice(0, 4)) {
        const t = e.text.length > 120 ? e.text.slice(0, 117) + '...' : e.text;
        out.push(paint('dim', `          line ${e.line}: ${t}`));
      }
      if (f.evidence.length > 4) out.push(paint('dim', `          ... and ${f.evidence.length - 4} more lines`));
      if (f.docs) out.push(paint('dim', `          ${f.docs}`));
      out.push('');
    }
  };

  if (m.inputKind === 'klippy.log') section('CRASH', report.crash);
  section('CONFIG', report.config);
  if (report.config.length === 0 && m.inputKind === 'printer.cfg') out.push('CONFIG', '  no findings', '');
  out.push(paint('bold', 'Result: ') + verdict(report));
  return out.join('\n');
}

// Workflow commands: https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions
// Data escapes %, CR and LF. A property also escapes ":" and ",", which would end it.
const escapeData = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (s: string) => escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
const GITHUB_LEVEL: Record<Severity, string> = { error: 'error', warning: 'warning', note: 'notice' };

/** One `::error file=,line=::` workflow command per finding, so GitHub Actions can annotate the file. */
export function toGithub(report: Report, opts: { file?: string } = {}): string {
  const out: string[] = [];
  for (const f of [...report.crash, ...report.config]) {
    const props: string[] = [];
    if (opts.file) props.push(`file=${escapeProperty(opts.file)}`);
    const line = f.evidence[0]?.line;
    if (line !== undefined) props.push(`line=${line}`);
    props.push(`title=${escapeProperty(`${f.title} [${f.id}]`)}`);
    const message = f.fix ? `${f.detail}\nFix: ${f.fix}` : f.detail;
    out.push(`::${GITHUB_LEVEL[f.severity]} ${props.join(',')}::${escapeData(message)}`);
  }
  return out.join('\n');
}
