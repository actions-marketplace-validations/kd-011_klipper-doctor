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
    /** Skipped when an [include] is present, because the rest of the config may be in another file. */
    needsComplete?: boolean;
    check(ctx: ConfigContext): Hit[];
}
export interface CrashContext {
    session: LogSession;
    sessionCount: number;
    /** The config dumped in the session, parsed, when the log has one. */
    config?: ParsedConfig;
    /** Non-Stats lines of the session, with their line numbers. */
    notable: Evidence[];
    /** Lines of the session after the first match of `re`, for context. */
    find(re: RegExp): Evidence | undefined;
    findAll(re: RegExp, limit?: number): Evidence[];
    /** The first line matching `re`, with its regex match. */
    match(re: RegExp): {
        m: RegExpExecArray;
        ev: Evidence;
    } | undefined;
    /** The first `Transition to shutdown state:` line, if any. */
    shutdown?: Evidence;
    /** Up to `count` lines of the session that follow `line`. */
    after(line: number, count: number): Evidence[];
}
export interface CrashRule extends RuleMeta {
    check(ctx: CrashContext): Hit | null;
}
export declare const KLIPPER_DOCS = "https://www.klipper3d.org/";
export declare const KLIPPER_SRC = "https://github.com/Klipper3d/klipper/blob/master/";
