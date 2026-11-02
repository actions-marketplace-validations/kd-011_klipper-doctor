import type { CrashRule } from '../types.js';
import { KLIPPER_DOCS } from '../types.js';

// klippy/extras/verify_heater.py heater_fault(): "Heater %s not heating at expected rate".
// Defaults read from the same file: hysteresis 5, max_error 120, heating_gain 2, check_gain_time 20
// (60 for heater_bed). The check_event() logic: while the heater is below (target - hysteresis) the
// shortfall accumulates in `error`; the heater must also gain heating_gain degrees every
// check_gain_time seconds while it is approaching its target.
export const heaterVerify: CrashRule = {
  id: 'heater-verify',
  severity: 'error',
  title: 'Heater not heating at expected rate',
  detail:
    'Klipper watches every heater and shuts down if the temperature does not rise as expected, so a heater that has failed or lost its sensor cannot run away.',
  fix: 'Check the heater cartridge or bed wiring, that the thermistor reads sensibly and is seated, and that the heater actually warms up. Change verify_heater only as a last step.',
  docs: KLIPPER_DOCS + 'Config_Reference.html#verify_heater',
  check(ctx) {
    const hit = ctx.match(/^Heater (.+?) not heating at expected rate/);
    if (!hit) return null;
    const name = hit.m[1];
    const gainTime = name === 'heater_bed' ? 60 : 20;
    return {
      title: `Heater ${name} not heating at expected rate`,
      detail: `Klipper's verify_heater check shut the printer down because ${name} was not heating as expected. By default it expects the heater to gain 2 C every ${gainTime} s while it climbs to its target, and gives up when the accumulated shortfall below target reaches 120 (the heating_gain, check_gain_time and max_error settings, in [verify_heater ${name}]). The same check fires when a heater that reached its target cannot hold it. That means the heater was not delivering heat, or the sensor was not reporting it.`,
      evidence: [hit.ev, ...(ctx.shutdown && ctx.shutdown.line !== hit.ev.line ? [ctx.shutdown] : [])],
    };
  },
};

