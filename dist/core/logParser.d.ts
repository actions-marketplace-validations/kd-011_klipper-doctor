import type { Evidence, McuInfo } from './types.js';
export interface StatsPoint {
    line: number;
    /** Klipper's reactor clock at that line, in seconds. */
    time: number;
}
export interface LogSession {
    /** 1-based. */
    index: number;
    startLine: number;
    endLine: number;
    startedAt?: string;
    /** Reactor clock at "Start printer at", in seconds. */
    monotonicStart?: number;
    klipperVersion?: string;
    mcus: McuInfo[];
    config?: {
        startLine: number;
        lines: string[];
    };
    statsCount: number;
    firstStats?: StatsPoint;
    lastStats?: StatsPoint;
    /** Every line of the session except Stats lines and the config dump. */
    notable: Evidence[];
    shutdowns: Evidence[];
}
export interface ParsedLog {
    lines: string[];
    sessions: LogSession[];
    /** Number of Klipper starts found (at least 1 when there is any text). */
    startCount: number;
}
export declare function splitLines(text: string): string[];
export declare function looksLikeLog(lines: string[]): boolean;
export declare function parseLog(lines: string[]): ParsedLog;
/** Whole seconds the session ran, from the Stats lines, or undefined. */
export declare function sessionUptime(s: LogSession): number | undefined;
