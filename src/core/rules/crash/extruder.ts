import type { Hit } from '../../types.js';
import type { CrashContext, CrashRule } from '../types.js';
import { KLIPPER_DOCS } from '../types.js';

// klippy/kinematics/extruder.py PrinterExtruder.check_move() raises these as command errors, each with a
// second line "See the '<option>' config option for details". gcode.py _respond_error() logs them as
// warnings, so Klipper keeps running and a print from the virtual SD card stops (on_error_gcode).
// The defaults in the text are from docs/Config_Reference.md, [extruder].
const EXTRUDER = KLIPPER_DOCS + 'Config_Reference.html#extruder';
const STOPPED = ' The command failed and a print from the virtual SD card stops on it, but Klipper itself keeps running.';

/** The message line and the "See the ... option" line after it. */
function both(ctx: CrashContext, first: { line: number; text: string }) {
  const next = ctx.after(first.line, 1)[0];
  return next && next.text.startsWith('See the ') ? [first, next] : [first];
}

export const extrudeCold: CrashRule = {
  id: 'extrude-cold',
  severity: 'warning',
  title: 'Extruder move refused: too cold',
  detail:
    'Klipper refuses extruder moves while the extruder is below min_extrude_temp.',
  fix: 'Heat the extruder first, for example with M109 S<temp>, before the line that extrudes or retracts. Lower min_extrude_temp only if you know the filament flows at that temperature.',
  docs: EXTRUDER,
  check(ctx): Hit | null {
    const hit = ctx.match(/^Extrude below minimum temp\s*$/);
    if (!hit) return null;
    return {
      detail: `Klipper refused an extruder move because the extruder was colder than min_extrude_temp ("Extrude below minimum temp"). The Config Reference describes min_extrude_temp as the minimum temperature at which extruder move commands may be issued, 170 C by default.${STOPPED} So the hotend was not up to temperature when the move ran: for example a start script or macro that extrudes before heating finishes, or a target that was never set.`,
      evidence: both(ctx, hit.ev),
    };
  },
};

export const extrudeOnlyTooLong: CrashRule = {
  id: 'extrude-only-too-long',
  severity: 'warning',
  title: 'Retraction or extrude-only move too long',
  detail:
    'A retraction or extrude-only move asked for more filament than max_extrude_only_distance allows.',
  fix: 'Find the line that asked for the move. Shorten the retraction or prime length in the slicer or macro, or raise max_extrude_only_distance in [extruder] if the long move is intended.',
  docs: EXTRUDER,
  check(ctx): Hit | null {
    const hit = ctx.match(/^Extrude only move too long \((-?[\d.]+)mm vs (-?[\d.]+)mm\)\s*$/);
    if (!hit) return null;
    return {
      detail: `A retraction or extrude-only move asked for ${hit.m[1]}mm of filament and the limit is ${hit.m[2]}mm ("Extrude only move too long"). The limit is max_extrude_only_distance in [extruder]; the Config Reference says it is the maximum length of raw filament a retraction or extrude-only move may have, 50mm by default.${STOPPED}`,
      evidence: both(ctx, hit.ev),
    };
  },
};

export const extrudeCrossSection: CrashRule = {
  id: 'extrude-cross-section',
  severity: 'warning',
  title: 'Move extrudes too much for its length',
  detail:
    'A move asked for more extrusion per millimetre of travel than max_extrude_cross_section allows.',
  fix: 'Check the extrusion multiplier, line width, layer height and filament diameter in the slicer, and that filament_diameter and nozzle_diameter in [extruder] match the real filament and nozzle. Raise max_extrude_cross_section only if the move is meant.',
  docs: EXTRUDER,
  check(ctx): Hit | null {
    const hit = ctx.match(/^Move exceeds maximum extrusion \((-?[\d.]+)mm\^2 vs (-?[\d.]+)mm\^2\)\s*$/);
    if (!hit) return null;
    return {
      detail: `A move asked for an extrusion cross section of ${hit.m[1]}mm^2 and the limit is ${hit.m[2]}mm^2 ("Move exceeds maximum extrusion"). The limit is max_extrude_cross_section in [extruder]: the Config Reference says it stops excessive extrusion during relatively small XY moves, and defaults to 4.0 times nozzle_diameter squared. Klipper works the cross section out from the filament_diameter in the config.${STOPPED}`,
      evidence: both(ctx, hit.ev),
    };
  },
};
