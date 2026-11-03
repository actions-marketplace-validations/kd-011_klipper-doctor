import type { Evidence, Finding, Hit, RuleMeta } from '../../types.js';
import type { CrashContext } from '../types.js';
export declare const unknownReasonMeta: RuleMeta;
export declare const noFailureMeta: RuleMeta;
/** Lines that mean the session failed even when no specific rule recognised the message. */
export declare function failureEvidence(ctx: CrashContext): Evidence[];
export declare function unknownReason(ctx: CrashContext): Hit | null;
/** A failure in a session before the last one, which is what most people are asking about after a restart. */
export interface EarlierFailure {
    index: number;
    finding: Finding;
    /** What other earlier sessions logged, most recent first, with how many sessions logged each. */
    others?: string[];
}
export declare function noFailure(ctx: CrashContext, earlier: EarlierFailure | undefined, recognised: boolean): Hit;
