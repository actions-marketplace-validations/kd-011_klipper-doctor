import type { Report, Severity } from './types.js';
export declare function countBySeverity(report: Report): Record<Severity, number>;
/** One line: what was checked and how it went. */
export declare function verdict(report: Report): string;
/** Paste-ready for Reddit or Discord: a verdict line, then findings grouped by severity. No tables. */
export declare function toMarkdown(report: Report): string;
export declare function toText(report: Report, opts?: {
    color?: boolean;
    width?: number;
}): string;
