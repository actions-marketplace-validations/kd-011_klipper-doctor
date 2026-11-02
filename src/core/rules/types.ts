import type { ParsedConfig } from '../configParser.js';
import type { LogSession } from '../logParser.js';
import type { Evidence, Hit, RuleMeta } from '../types.js';

export interface ConfigContext {
  cfg: ParsedConfig;
  /** True for a hand-written printer.cfg, false for the config dumped in klippy.log. */
  raw: boolean;
  /** Text of a line in the analysed input (CR already removed). */
  lineText(line: number): string;
  klipperVersion?: string;
}

export interface ConfigRule extends RuleMeta {
  /** 'raw' rules need the original file: the log dump has comments stripped and repeats already merged. */
  scope: 'raw' | 'any';
  /** Skipped when part of the config is not in the input: an [include], a file with no [printer], a dump cut off. */
  needsComplete?: boolean;
  check(ctx: ConfigContext): Hit[];
}

/** What stopped the session, as Klipper reported it. */
export interface Cause {
  /** One line, without the "Transition to shutdown state:" or "MCU 'x' shutdown:" prefix. */
  reason: string;
  /** The MCU that gave the reason. Unset when the host gave it. */
  mcu?: string;
  /** The MCU was already shut down when this Klipper start connected (extras/error_mcu.py). */
  previous: boolean;
  ev: Evidence;
}

export interface CrashContext {
  session: LogSession;
  sessionCount: number;
  /** The config dumped in the session, parsed, when the log has one. */
  config?: ParsedConfig;
  /** Non-Stats lines of the session, with their line numbers. */
  notable: Evidence[];
  cause?: Cause;
  /** The first causal line matching `re`: see causalLines in core/cause.ts. */
  find(re: RegExp): Evidence | undefined;
  findAll(re: RegExp, limit?: number): Evidence[];
  /** The first causal line matching `re`, with its regex match. */
  match(re: RegExp): { m: RegExpExecArray; ev: Evidence } | undefined;
  /** The first `Transition to shutdown state:` line, if any. */
  shutdown?: Evidence;
  /** Up to `count` lines of the session that follow `line`. */
  after(line: number, count: number): Evidence[];
}

export interface CrashRule extends RuleMeta {
  check(ctx: CrashContext): Hit | null;
}

/** Python's float() accepts neither a blank nor hex, unlike Number(). NaN when Klipper would not read it. */
export function configNumber(value: string | undefined): number {
  if (value === undefined || !/^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(value)) return NaN;
  return Number(value);
}

export const KLIPPER_DOCS = 'https://www.klipper3d.org/';
export const KLIPPER_SRC = 'https://github.com/Klipper3d/klipper/blob/master/';
