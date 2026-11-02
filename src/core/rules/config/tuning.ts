import type { Hit } from '../../types.js';
import type { ConfigRule } from '../types.js';
import { configNumber, KLIPPER_DOCS } from '../types.js';

// docs/TMC_Drivers.md, "Setting spreadCycle vs stealthChop Mode": "It is recommended to always use
// spreadCycle mode (by not specifying stealthchop_threshold) or to always use stealthChop mode (by
// setting stealthchop_threshold to 999999). Unfortunately, the drivers often produce poor and
// confusing results if the mode changes while the motor is at a non-zero velocity."
// docs/Config_Reference.md: stealthchop_threshold defaults to 0, which disables stealthChop.
export const tmcStealthchopThreshold: ConfigRule = {
  id: 'tmc-stealthchop-threshold',
  scope: 'any',
  severity: 'note',
  title: 'stealthchop_threshold switches modes while moving',
  detail:
    'The Klipper TMC guide recommends leaving stealthchop_threshold unset or setting it to 999999, because a driver that changes mode while the motor is moving often behaves badly.',
  fix: 'Remove stealthchop_threshold for spreadCycle, or set it to 999999 for stealthChop.',
  docs: KLIPPER_DOCS + 'TMC_Drivers.html#setting-spreadcycle-vs-stealthchop-mode',
  check({ cfg, lineText }) {
    const hits: Hit[] = [];
    for (const name of cfg.sectionNames(/^tmc\d+ /)) {
      const o = cfg.option(name, 'stealthchop_threshold');
      if (!o) continue;
      const v = configNumber(o.value);
      if (!Number.isFinite(v) || v === 0 || v === 999999) continue;
      hits.push({
        title: `[${name}] has stealthchop_threshold ${o.value}`,
        detail: `[${name}] sets stealthchop_threshold to ${o.value}, so the driver is in stealthChop below ${o.value} mm/s and spreadCycle above it. The TMC guide recommends only "unset" (always spreadCycle) or 999999 (always stealthChop), because switching while the motor moves often gives poor, confusing results.`,
        fix: `Remove stealthchop_threshold from [${name}] or set it to 999999.`,
        evidence: [{ line: o.line, text: lineText(o.line) }],
      });
    }
    return hits;
  },
};

// docs/Resonance_Compensation.md: input shaping reduces ringing and "typically reduces the
// vibrations and shaking of the printer in general". It needs an [input_shaper] section and tuning.
export const noInputShaper: ConfigRule = {
  id: 'no-input-shaper',
  scope: 'any',
  severity: 'note',
  title: 'No [input_shaper] section',
  detail:
    'Input shaping is optional. It reduces ringing (ghosting) at higher accelerations but needs measuring first, so this is only a note.',
  fix: 'See Resonance Compensation if you see ringing on prints.',
  docs: KLIPPER_DOCS + 'Resonance_Compensation.html',
  needsComplete: true,
  check({ cfg }) {
    if (cfg.sections.length === 0 || cfg.hasSection('input_shaper')) return [];
    return [{ evidence: [] }];
  },
};
