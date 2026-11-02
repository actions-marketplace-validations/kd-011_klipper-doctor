import type { Evidence, Finding, Hit, RuleMeta } from '../../types.js';
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

// logging.exception() text in klippy/klippy.py _connect and run, klippy/gcode.py _process_commands and
// extras/motion_queuing.py. Each is followed by a Python traceback.
const FAILURE_LINE =
  /^(Config error|Protocol error|MCU error during connect|Unhandled exception|Internal error|Repeat unhandled exception|Exception in flush_handler)/;

/** Lines that mean the session failed even when no specific rule recognised the message. */
export function failureEvidence(ctx: CrashContext): Evidence[] {
  const out = [...ctx.session.shutdowns];
  for (const e of ctx.notable) if (FAILURE_LINE.test(e.text)) out.push(e);
  if (ctx.cause) out.push(ctx.cause.ev);
  return out.sort((a, b) => a.line - b.line);
}

/** The exception on the last line of the traceback after `line`, which is where Python puts the message. */
function exceptionAfter(ctx: CrashContext, line: number): Evidence | undefined {
  const after = ctx.after(line, 120);
  if (!after[0]?.text.startsWith('Traceback (most recent call last):')) return undefined;
  return after.slice(1).find((e) => !/^\s/.test(e.text));
}

export function unknownReason(ctx: CrashContext): Hit | null {
  const fails = failureEvidence(ctx);
  const first = fails[0];
  if (!first) return null;
  const c = ctx.cause;
  const reasonText = first.text.replace(/^Transition to shutdown state: /, '');
  const exception = exceptionAfter(ctx, first.line);
  // "mcu.error: text" says nothing the text does not, but "ImportError: text" does.
  const raised = exception?.text.replace(/^(?:\w+\.)*(?:error|Error): /, '');
  const reason = c?.mcu
    ? `${c.previous ? 'Previous ' : ''}MCU '${c.mcu}' shutdown: ${c.reason}`
    : raised
      ? `${reasonText}: ${raised}`
      : reasonText;
  const lines = [first, ...(c ? [c.ev] : []), ...(exception ? [exception] : []), ...ctx.after(first.line, 3)];
  const seen = new Set<number>();
  const evidence = lines.filter((e) => (seen.has(e.line) ? false : (seen.add(e.line), true))).slice(0, 5);
  const hit: Hit = {
    title: `Klipper stopped: ${reason}`,
    detail: `Klipper logged "${reason}" and no klipper-doctor rule recognises it. The lines below it in the log usually carry the detail.`,
    evidence,
  };
  // extras/error_mcu.py message_mcu_connect_error
  if (first.text.startsWith('MCU error during connect')) hit.fix = 'Fix what the message names, then run FIRMWARE_RESTART, as Klipper asks after an MCU error at connect.';
  return hit;
}

/** A failure in a session before the last one, which is what most people are asking about after a restart. */
export interface EarlierFailure {
  index: number;
  finding: Finding;
}

export function noFailure(ctx: CrashContext, earlier: EarlierFailure | undefined, recognised: boolean): Hit {
  const s = ctx.session;
  const who = s.klipperVersion ? `Klipper ${s.klipperVersion}` : 'Klipper (version not in this log)';
  const up = sessionUptime(s);
  let ran: string;
  if (up !== undefined) ran = `ran for about ${formatDuration(up)} (from ${s.statsCount} Stats lines, the last on line ${s.lastStats?.line})`;
  else if (s.statsCount > 0) ran = `wrote ${s.statsCount} Stats lines`;
  else ran = 'wrote no Stats lines';
  if (earlier) {
    const f = earlier.finding;
    return {
      // Somebody choosing to stop the printer is worth saying, but it is not a fault to chase.
      severity: f.id === 'mcu-command-request' ? 'note' : 'warning',
      title: `No failure in the last session, but session ${earlier.index} of ${ctx.sessionCount} failed: ${f.title}`,
      detail: `In the last session ${who} ${ran} and logged no failure. Klipper was restarted after an earlier session failed, and that session is probably the one you are after. It may already be fixed. Session ${earlier.index}: ${f.detail}`,
      fix: f.fix,
      docs: f.docs,
      evidence: f.evidence,
    };
  }
  if (!recognised) {
    return {
      title: 'No failure found in this file',
      detail: 'This file has none of the lines Klipper writes, so it may not be a klippy.log. Moonraker and KlipperScreen keep their own logs, and klipper-doctor reads only klippy.log.',
      fix: 'Look for klippy.log, usually in printer_data/logs.',
      evidence: [],
    };
  }
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
