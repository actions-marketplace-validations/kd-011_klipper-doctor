import type { LogSession } from './logParser.js';
import type { Cause } from './rules/types.js';
import type { Evidence } from './types.js';
export declare function findCause(session: LogSession): Cause | undefined;
/**
 * The lines that can explain the failure: everything up to the first shutdown, plus the reason and
 * the sensor clarification that Klipper logs after it. Rules look only here, so a later cascade or a
 * quoted message in a dump cannot add a diagnosis. With no shutdown line every line counts.
 */
export declare function causalLines(session: LogSession, cause: Cause | undefined): Evidence[];
