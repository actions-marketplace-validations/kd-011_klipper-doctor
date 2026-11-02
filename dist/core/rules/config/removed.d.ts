import type { ConfigRule } from '../types.js';
export declare function versionNotOlderThan(version: string | undefined): string | undefined;
/** Used by the crash rules to explain "Option 'x' is not valid in section 'y'". */
export declare function findRemoved(section: string, option: string): {
    removed: string;
    use: string;
} | undefined;
export declare const removedOption: ConfigRule;
export declare const deprecatedOption: ConfigRule;
