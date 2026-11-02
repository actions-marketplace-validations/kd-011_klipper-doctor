import type { Hit, RuleMeta } from '../../types.js';
import type { CrashContext } from '../types.js';
export declare const unknownReasonMeta: RuleMeta;
export declare const noFailureMeta: RuleMeta;
export declare function failureEvidence(ctx: CrashContext): import("../../types.js").Evidence[];
export declare function unknownReason(ctx: CrashContext): Hit | null;
export declare function noFailure(ctx: CrashContext): Hit;
