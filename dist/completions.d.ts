import { SHELLS } from './options.js';
type Shell = (typeof SHELLS)[number];
/** A completion script. The --ignore choices are the config rules the engine can suppress. */
export declare function completionScript(shell: Shell): string;
export {};
