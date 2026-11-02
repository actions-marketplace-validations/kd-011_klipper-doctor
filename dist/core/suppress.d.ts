import type { Finding } from './types.js';
export declare const NEVER_SUPPRESSED: Set<string>;
export declare function parseIgnoreList(value: unknown): Set<string>;
/**
 * Drops config findings named in `ignore`, and, when `lines` is given, those with a directive comment
 * on one of their evidence lines or in the block of comment lines directly above it.
 */
export declare function suppress(findings: Finding[], ignore: Set<string>, lines?: string[]): {
    kept: Finding[];
    count: number;
};
