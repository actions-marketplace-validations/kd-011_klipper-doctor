import type { Hit, RuleMeta } from '../../types.js';
import type { CrashContext } from '../types.js';
import { KLIPPER_DOCS } from '../types.js';
import { sessionUptime } from '../../logParser.js';

const FAQ = KLIPPER_DOCS + 'FAQ.html#why-does-klipper-report-errors-i-lost-my-print';

export const unknownReasonMeta: RuleMeta = {
  id: 'crash-unknown-reason',
  severity: 'error',
  title: 'Shutdown with a reason no rule knows',
  detail:
    'The log shows Klipper shutting down or failing, but the message is not one of the known ones, so the raw reason is shown.',
  fix: 'Search the exact message in the Klipper docs and forum, and post the full log with it.',
  docs: FAQ,
};

export const noFailureMeta: RuleMeta = {
  id: 'no-failure-found',
  severity: 'note',
  title: 'No failure found in the log',
  detail: 'The analysed session never logged a shutdown, config error or connect failure.',
  fix: 'If the print still failed, check that this is the right session and the right log file.',
  docs: KLIPPER_DOCS + 'FAQ.html',
};

/** Lines that mean the session failed even when no specific rule recognised the message. */
const FAILURE_LINE =
  /^(Config error|Protocol error|MCU error during connect|Unhandled exception|Internal error|Repeat unhandled exception)/;

export function failureEvidence(ctx: CrashContext) {
  const out = [...ctx.session.shutdowns];
  for (const e of ctx.notable) if (FAILURE_LINE.test(e.text)) out.push(e);
  return out.sort((a, b) => a.line - b.line);
}

export function unknownReason(ctx: CrashContext): Hit | null {
  const fails = failureEvidence(ctx);
  const first = fails[0];
  if (!first) return null;
  const reasonText = first.text.replace(/^Transition to shutdown state: /, '');
  // The MCU names its reason on a follow-up line: "MCU 'mcu' shutdown: <reason>".
  const mcu = ctx.match(/\bMCU '([^']+)' shutdown: (.+)$/);
  const reason = mcu ? `MCU '${mcu.m[1]}' shutdown: ${mcu.m[2]}` : reasonText;
  const lines = [first, ...(mcu ? [mcu.ev] : []), ...ctx.after(first.line, 3)];
  const seen = new Set<number>();
  const evidence = lines.filter((e) => (seen.has(e.line) ? false : (seen.add(e.line), true))).slice(0, 5);
  return {
    title: `Klipper stopped: ${reason}`,
    detail: `Klipper logged "${reason}" and no klipper-doctor rule recognises it. The lines below it in the log usually carry the detail.`,
    evidence,
  };
}

export function noFailure(ctx: CrashContext): Hit {
  const s = ctx.session;
  const who = s.klipperVersion ? `Klipper ${s.klipperVersion}` : 'Klipper (version not in this log)';
  const up = sessionUptime(s);
  let ran: string;
  if (up !== undefined) ran = `ran for about ${formatDuration(up)} (from ${s.statsCount} Stats lines, the last on line ${s.lastStats?.line})`;
  else if (s.statsCount > 0) ran = `wrote ${s.statsCount} Stats lines`;
  else ran = 'wrote no Stats lines';
  const many = ctx.sessionCount > 1 ? ` This is session ${s.index} of ${ctx.sessionCount}, the last one in the file.` : '';
  return {
    title: 'No failure found in the last session',
    detail: `${who} ${ran} and logged no shutdown, config error or connect failure.${many} If a print failed anyway, the cause is not in this log, or it is in an earlier session.`,
    fix: 'If the print failed, check the log is from the right time: Klipper rotates klippy.log at midnight and keeps five older files.',
    evidence: [],
  };
}

function formatDuration(sec: number): string {
  if (sec < 90) return `${sec} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}
