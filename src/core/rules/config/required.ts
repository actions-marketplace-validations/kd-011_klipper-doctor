import type { ParsedConfig } from '../../configParser.js';
import type { Hit } from '../../types.js';
import type { ConfigContext, ConfigRule } from '../types.js';
import { configNumber, KLIPPER_DOCS, KLIPPER_SRC } from '../types.js';

const CONFIG_REFERENCE = KLIPPER_DOCS + 'Config_Reference.html';

// Kinematics whose axes are the stepper_x / stepper_y / stepper_z sections
// (klippy/kinematics/cartesian.py, corexy.py, corexz.py, hybrid_*.py build their rails from
// config.getsection('stepper_' + n) via stepper.LookupMultiRail).
const AXIS_KINEMATICS = new Set(['cartesian', 'corexy', 'corexz', 'hybrid_corexy', 'hybrid_corexz']);

function axisSections(cfg: ParsedConfig): string[] {
  const k = cfg.option('printer', 'kinematics')?.value;
  if (!k || !AXIS_KINEMATICS.has(k)) return [];
  return ['stepper_x', 'stepper_y', 'stepper_z'].filter((n) => cfg.hasSection(n));
}

const isProbeEndstop = (cfg: ParsedConfig, sec: string) =>
  (cfg.option(sec, 'endstop_pin')?.value ?? '').startsWith('probe:');

// Options that Klipper reads with no default, so a missing one stops startup with
// "Option '<name>' in section '<section>' must be specified" (klippy/configfile.py _get_wrapper):
//   [printer]                klippy/klippy.py (kinematics), klippy/toolhead.py (max_velocity, max_accel)
//   stepper_x/y/z            klippy/stepper.py PrinterStepper / parse_step_distance / GenericPrinterRail
//   extruder                 klippy/kinematics/extruder.py (nozzle_diameter, filament_diameter; the stepper
//                            options only once one of them is set, see extruderStepperOptions)
//   heaters                  klippy/extras/heaters.py (min_temp, max_temp, control, heater_pin,
//                            sensor_type, and pid_kp / pid_ki / pid_kd for control: pid)
const HEATER_BASE = ['heater_pin', 'sensor_type', 'control', 'min_temp', 'max_temp'];

// klippy/stepper.py parse_step_distance: rotation_distance can be left out when gear_ratio is set, which
// Klipper then reads as radians. Before 2021-11-02 (Config_Changes) step_distance replaced both
// rotation_distance and microsteps. A log from such a version is valid, and removed-option covers it.
function stepperBase(cfg: ParsedConfig, sec: string): string[] {
  const out = ['step_pin', 'dir_pin'];
  if (cfg.option(sec, 'step_distance')) return out;
  out.push('microsteps');
  if (!cfg.option(sec, 'gear_ratio')) out.push('rotation_distance');
  return out;
}

function missing(cfg: ParsedConfig, sec: string, opts: string[]): string[] {
  return opts.filter((o) => !cfg.option(sec, o));
}

// klippy/kinematics/extruder.py PrinterExtruder: the stepper is only created when step_pin, dir_pin or
// rotation_distance is present ("config.get('step_pin', None) is not None or ..."), because an
// extruder can be driven by an [extruder_stepper] section instead. Once any of the three is set,
// PrinterStepper needs the stepperBase options.
function extruderStepperOptions(cfg: ParsedConfig, sec: string): string[] {
  const started = ['step_pin', 'dir_pin', 'rotation_distance'].some((o) => cfg.option(sec, o));
  return started ? stepperBase(cfg, sec) : [];
}

function requiredFor(cfg: ParsedConfig, sec: string): string[] {
  const out: string[] = [];
  if (/^(extruder\d*|heater_bed|heater_generic .+)$/.test(sec)) {
    if (/^extruder\d*$/.test(sec)) out.push(...extruderStepperOptions(cfg, sec), 'nozzle_diameter', 'filament_diameter');
    // Before 2024-02-15 (Config_Changes) shared_heater meant the heater options were in the other section.
    if (cfg.option(sec, 'shared_heater')) return out;
    out.push(...HEATER_BASE);
    if (cfg.option(sec, 'control')?.value === 'pid') out.push('pid_kp', 'pid_ki', 'pid_kd');
  }
  return out;
}

export const missingRequired: ConfigRule = {
  id: 'missing-required',
  scope: 'any',
  needsComplete: true,
  severity: 'error',
  title: 'Required option missing',
  detail:
    'Klipper reads this option with no default, so it stops at startup with "Option ... must be specified".',
  fix: 'Add the option to the section.',
  docs: CONFIG_REFERENCE,
  check({ cfg, lineText }: ConfigContext) {
    const hits: Hit[] = [];
    const push = (sec: string, opts: string[]) => {
      const miss = missing(cfg, sec, opts);
      if (miss.length === 0) return;
      const header = cfg.sectionsNamed(sec)[0];
      hits.push({
        title: `[${sec}] is missing ${miss.join(', ')}`,
        detail: `Klipper requires ${miss.join(', ')} in [${sec}] and stops at startup with "Option '${miss[0]}' in section '${sec}' must be specified".`,
        fix: `Add ${miss[0]}${miss.length > 1 ? ' and the others' : ''} to [${sec}], see Config_Reference.`,
        evidence: header ? [{ line: header.line, text: lineText(header.line) }] : [],
      });
    };

    if (cfg.sections.length === 0) return hits;
    push('printer', ['kinematics', 'max_velocity', 'max_accel']);

    for (const sec of axisSections(cfg)) {
      // GenericPrinterRail reads position_max with no default (need_position_minmax is true for these
      // rails) even when the endstop is the probe; only position_endstop comes from the probe then.
      const need = [...stepperBase(cfg, sec), 'endstop_pin', 'position_max'];
      if (!isProbeEndstop(cfg, sec)) need.push('position_endstop');
      push(sec, need);
    }
    for (const sec of cfg.sectionNames(/^(extruder\d*|heater_bed|heater_generic .+)$/)) {
      push(sec, requiredFor(cfg, sec));
    }
    return hits;
  },
};

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (['1', 'yes', 'true', 'on'].includes(s)) return true;
  if (['0', 'no', 'false', 'off'].includes(s)) return false;
  return undefined;
}

// klippy/stepper.py GenericPrinterRail.__init__ (the three checks, in order):
//   position_endstop must be between position_min and position_max
//   homing_positive_dir unset: inferred from which end of the axis position_endstop is within
//     a quarter of, else "Unable to infer homing_positive_dir in section"
//   homing_positive_dir set: "Invalid homing_positive_dir / position_endstop" when they contradict
export const endstopRange: ConfigRule = {
  id: 'endstop-range',
  scope: 'any',
  severity: 'error',
  title: 'position_endstop does not fit the axis',
  detail:
    'Klipper checks position_endstop against position_min, position_max and homing_positive_dir at startup and stops if they disagree.',
  fix: 'Set position_endstop to the axis minimum or maximum, inside position_min and position_max.',
  docs: KLIPPER_SRC + 'klippy/stepper.py',
  check({ cfg, lineText }: ConfigContext) {
    const hits: Hit[] = [];
    for (const sec of axisSections(cfg)) {
      if (isProbeEndstop(cfg, sec)) continue;
      const e = cfg.option(sec, 'position_endstop');
      const mx = cfg.option(sec, 'position_max');
      if (!e || !mx) continue;
      const mnOpt = cfg.option(sec, 'position_min');
      const endstop = configNumber(e.value);
      const max = configNumber(mx.value);
      const min = mnOpt ? configNumber(mnOpt.value) : 0;
      if (![endstop, max, min].every(Number.isFinite) || !(max > min)) continue;
      const evidence = [e, mx, ...(mnOpt ? [mnOpt] : [])].map((o) => ({ line: o.line, text: lineText(o.line) }));
      if (endstop < min || endstop > max) {
        hits.push({
          title: `position_endstop ${endstop} is outside [${sec}] ${min} to ${max}`,
          detail: `[${sec}] has position_endstop ${endstop} but position_min ${min} and position_max ${max}. Klipper stops with "position_endstop in section '${sec}' must be between position_min and position_max".`,
          fix: `Set position_endstop in [${sec}] to ${min} or ${max}, whichever end the endstop is at.`,
          evidence,
        });
        continue;
      }
      const hpd = cfg.option(sec, 'homing_positive_dir');
      const dir = parseBool(hpd?.value);
      if (hpd && dir !== undefined) {
        if ((dir && endstop === min) || (!dir && endstop === max)) {
          hits.push({
            title: `homing_positive_dir contradicts position_endstop in [${sec}]`,
            detail: `[${sec}] has homing_positive_dir ${dir} with position_endstop ${endstop} (position_min ${min}, position_max ${max}). Klipper stops with "Invalid homing_positive_dir / position_endstop".`,
            fix: `Set homing_positive_dir to ${!dir}, or move position_endstop to the other end of the axis.`,
            evidence: [...evidence, { line: hpd.line, text: lineText(hpd.line) }],
          });
        }
      } else if (!hpd) {
        const len = max - min;
        if (!(endstop <= min + len / 4) && !(endstop >= max - len / 4)) {
          hits.push({
            title: `Cannot tell which way [${sec}] homes`,
            detail: `[${sec}] has position_endstop ${endstop}, which is not within a quarter of the axis from position_min ${min} or position_max ${max}, and homing_positive_dir is not set. Klipper stops with "Unable to infer homing_positive_dir".`,
            fix: `Set homing_positive_dir (true or false) in [${sec}], or fix position_endstop.`,
            evidence,
          });
        }
      }
    }
    return hits;
  },
};

// klippy/extras/safe_z_home.py: raises "homing_override and safe_z_homing cannot be used simultaneously".
export const safeZHomeConflict: ConfigRule = {
  id: 'safe-z-home-conflict',
  scope: 'any',
  severity: 'error',
  title: '[safe_z_home] and [homing_override] together',
  detail:
    'Both sections replace the G28 command, so Klipper refuses to start with both: "homing_override and safe_z_homing cannot be used simultaneously".',
  fix: 'Keep one of the two sections.',
  docs: KLIPPER_SRC + 'klippy/extras/safe_z_home.py',
  needsComplete: true,
  check({ cfg, lineText }: ConfigContext) {
    const a = cfg.sectionsNamed('safe_z_home')[0];
    const b = cfg.sectionsNamed('homing_override')[0];
    if (!a || !b) return [];
    return [
      {
        evidence: [a, b].map((s) => ({ line: s.line, text: lineText(s.line) })),
      },
    ];
  },
};
