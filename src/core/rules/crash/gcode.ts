import type { Hit } from '../../types.js';
import type { CrashContext, CrashRule } from '../types.js';
import { KLIPPER_DOCS, KLIPPER_SRC } from '../types.js';

// klippy/toolhead.py Move.move_error(): "%s: %.3f %.3f %.3f [%.3f]" with msg "Move out of range"
// klippy/kinematics/cartesian.py (and corexy, corexz, polar, ...): move.move_error("Must home axis first")
// klippy/gcode.py _respond_error(): logs the error as a warning, so it appears in klippy.log.
// These are command errors, not shutdowns: Klipper keeps running. A print from the virtual SD card
// stops on one (klippy/extras/virtual_sdcard.py runs on_error_gcode, default TURN_OFF_HEATERS), so
// they are reported as warnings: they explain a failed print without being a Klipper crash.
const FAQ = KLIPPER_DOCS + 'FAQ.html';

const AXES = ['x', 'y', 'z'] as const;
const CARTESIAN_LIKE = new Set(['cartesian', 'corexy', 'corexz', 'hybrid_corexy', 'hybrid_corexz']);

function axisRangeProblems(ctx: CrashContext, pos: number[]): string[] {
  const cfg = ctx.config;
  if (!cfg) return [];
  const kin = cfg.option('printer', 'kinematics')?.value;
  if (!kin || !CARTESIAN_LIKE.has(kin)) return [];
  const out: string[] = [];
  AXES.forEach((axis, i) => {
    const sec = `stepper_${axis}`;
    const max = Number(cfg.option(sec, 'position_max')?.value);
    const minOpt = cfg.option(sec, 'position_min');
    const min = minOpt ? Number(minOpt.value) : 0;
    const v = pos[i];
    if (v === undefined || !Number.isFinite(max) || !Number.isFinite(min)) return;
    if (v > max + 1e-6) out.push(`${axis.toUpperCase()} ${v} is above position_max ${max} in [${sec}]`);
    else if (v < min - 1e-6) out.push(`${axis.toUpperCase()} ${v} is below position_min ${min} in [${sec}]`);
  });
  return out;
}

export const moveOutOfRange: CrashRule = {
  id: 'move-out-of-range',
  severity: 'warning',
  title: 'Move out of range',
  detail:
    'A G-code move asked for a position outside the limits of the printer (position_min and position_max).',
  fix: 'Find which axis is outside its limit, and fix the slicer bed size, start or end G-code, or macro that asked for it.',
  docs: FAQ + '#why-cant-i-move-the-stepper-before-homing-the-printer',
  check(ctx): Hit | null {
    const hit = ctx.match(/Move out of range: (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) \[(-?[\d.]+)\]/);
    if (!hit) return null;
    const pos = [hit.m[1], hit.m[2], hit.m[3]].map(Number);
    const problems = axisRangeProblems(ctx, pos);
    const where = problems.length
      ? ` In this config: ${problems.join('; ')}.`
      : '';
    return {
      detail: `Klipper refused a move to X${hit.m[1]} Y${hit.m[2]} Z${hit.m[3]} (extruder ${hit.m[4]}) because it is outside the printer's limits, set by position_min and position_max on each axis.${where} The command failed, and a print from the virtual SD card stops on that error (Klipper then runs on_error_gcode, which turns the heaters off by default) while Klipper itself keeps running. If it happened right after G28, Config_Changes (2021-08-19) says a homing move can end just outside the valid range and advises moving the toolhead to a valid position straight after homing.`,
      evidence: [hit.ev],
    };
  },
};

export const mustHomeFirst: CrashRule = {
  id: 'must-home-first',
  severity: 'warning',
  title: 'Must home axis first',
  detail:
    'A move was sent before the axes were homed. Klipper only checks moves against position_min and position_max once homed, so it refuses to move until then.',
  fix: 'Send G28 before the move, and again after any M84 or M18, which disable the motors and clear the homed state.',
  docs: FAQ + '#why-cant-i-move-the-stepper-before-homing-the-printer',
  check(ctx): Hit | null {
    const hit = ctx.match(/Must home axis first: (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) \[(-?[\d.]+)\]/);
    if (!hit) return null;
    return {
      detail: `Klipper refused a move to X${hit.m[1]} Y${hit.m[2]} Z${hit.m[3]} because the printer was not homed. The Klipper FAQ explains that this guards against driving the head into the bed or a wall, and that disabling the motors (M84 or M18) means the printer must be homed again before moving.`,
      evidence: [hit.ev],
    };
  },
};

export const stepcompressInternal: CrashRule = {
  id: 'stepcompress-internal-error',
  severity: 'error',
  title: 'Internal error in stepcompress',
  detail:
    'Klipper\'s step queue failed a consistency check while syncing a stepper position. This is a bug-level error in the host software, not a wiring fault.',
  fix: 'Update Klipper and restart; if it repeats, post the full klippy.log in a Klipper issue or the Klipper forum.',
  docs: KLIPPER_SRC + 'klippy/stepper.py',
  check(ctx): Hit | null {
    const hit = ctx.match(/^\S.*Internal error in stepcompress/);
    if (!hit) return null;
    const cmd = ctx.match(/^Internal error on command:"([^"]*)"/);
    return {
      detail: `Klipper's step queue returned an error ("Internal error in stepcompress") while${cmd ? ` running ${cmd.m[1]}, ` : ' '}resetting or reading a stepper's position (raised in stepper.py note_homing_end and _query_mcu_position). It is an internal consistency check in the host software, not a hardware report.`,
      evidence: [cmd?.ev, hit.ev, ctx.shutdown].filter((e): e is NonNullable<typeof e> => !!e).filter((e, i, a) => a.findIndex((x) => x.line === e.line) === i),
    };
  },
};
