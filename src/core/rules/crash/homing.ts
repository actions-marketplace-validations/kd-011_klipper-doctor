import type { Evidence, Hit } from '../../types.js';
import type { CrashRule } from '../types.js';
import { KLIPPER_DOCS } from '../types.js';

// Command errors from klippy/extras/homing.py, klippy/mcu.py and klippy/extras/bltouch.py. Like Move out of
// range, they are not shutdowns: klippy/gcode.py _respond_error() logs the message as a warning and Klipper
// keeps running, so these are warnings. A print from the virtual SD card stops on one (on_error_gcode).
// homing.py homing_move() puts "Error during homing move: " or "Error during homing <endstop>: " in front of
// an error raised while the move or the wait ran, so the timeout rule below allows that prefix. The
// "No trigger", "still triggered" and "prior to movement" messages are raised on their own, with no prefix.
const CONFIG_CHECKS = KLIPPER_DOCS + 'Config_checks.html#verify-endstops';

const STOPPED = ' The command failed and a print from the virtual SD card stops on it, but Klipper itself keeps running.';

export const homingNoTrigger: CrashRule = {
  id: 'homing-no-trigger',
  severity: 'warning',
  title: 'Endstop never triggered while homing',
  detail:
    'Klipper moved the whole homing distance and the endstop or probe never triggered. It is raised in extras/homing.py when an endstop reports no trigger after the full movement.',
  fix: 'Run QUERY_ENDSTOPS with the axis away from the endstop, then press the endstop by hand and run it again: it should change from "open" to "TRIGGERED". If it does not change, check the wiring and endstop_pin.',
  docs: CONFIG_CHECKS,
  check(ctx): Hit | null {
    const hit = ctx.match(/^No trigger on (.+?) after full movement\s*$/);
    if (!hit) return null;
    const name = hit.m[1] as string;
    if (name === 'probe') {
      return {
        detail: `Klipper moved the probe the whole distance it was allowed and the probe never triggered ("No trigger on probe after full movement").${STOPPED} Klipper's own probe code advises that if the probe did not move far enough to trigger, the Z axis minimum position (position_min in [stepper_z]) can be lowered, and it can be negative, so the probe can travel further.`,
        fix: 'Run QUERY_PROBE: it should say "open", and "TRIGGERED" while you press the probe. If it does not, check the probe wiring and its pin. If it does, lower position_min in [stepper_z] so the probe can travel further.',
        evidence: [hit.ev],
      };
    }
    return {
      detail: `Klipper moved the "${name}" axis the whole homing distance and its endstop never triggered ("No trigger on ${name} after full movement"), so it could not tell where the axis was.${STOPPED} The Klipper config checks say a QUERY_ENDSTOPS reading that never changes usually means the endstop is wired to a different pin than endstop_pin names, and that it is worth checking for a missing or extra ^ pull-up at the start of the pin name.`,
      evidence: [hit.ev],
    };
  },
};

export const homingStillTriggered: CrashRule = {
  id: 'homing-still-triggered',
  severity: 'warning',
  title: 'Endstop still triggered after the retract',
  detail:
    'After the first homing move Klipper backed off and found the endstop still triggered, so it could not home a second time.',
  fix: 'Run QUERY_ENDSTOPS with the axis away from the endstop: it should say "open". If it says "TRIGGERED", flip the ! at the start of endstop_pin or fix the wiring. If it says "open", raise homing_retract_dist so the move frees the switch.',
  docs: CONFIG_CHECKS,
  check(ctx): Hit | null {
    const hit = ctx.match(/^Endstop (.+?) still triggered after retract\s*$/);
    if (!hit) return null;
    return {
      detail: `The "${hit.m[1]}" endstop was still triggered after Klipper backed away by homing_retract_dist (5 mm by default, set in the axis's stepper section), so the second homing move could not start ("Endstop ${hit.m[1]} still triggered after retract"). Either the retract was too short to free the switch, or the endstop reads as triggered when it is not: an inverted ! in endstop_pin, or a wiring fault.${STOPPED}`,
      evidence: [hit.ev],
    };
  },
};

// extras/homing.py probing_move(): check_no_movement() found the probe already triggered when the move began.
export const probeTriggeredEarly: CrashRule = {
  id: 'probe-triggered-early',
  severity: 'warning',
  title: 'Probe triggered before it moved',
  detail:
    'The probe already read as triggered when the probing move started, so Klipper stopped the move.',
  fix: 'With nothing near the probe, run QUERY_PROBE: it should say "open". If it says "TRIGGERED", check the probe wiring, the ! or ^ in its pin, and the probe itself. For a Smart Effector that is "open", see recovery_time in the [smart_effector] section.',
  docs: KLIPPER_DOCS + 'G-Codes.html#query_probe',
  check(ctx): Hit | null {
    const hit = ctx.match(/^Probe triggered prior to movement\s*$/);
    if (!hit) return null;
    return {
      detail: `The probe was already triggered when Klipper began a probing move, before the Z stepper had moved ("Probe triggered prior to movement"), so there was nothing to measure.${STOPPED} Either the probe reads as triggered all the time (a wrong pin setting such as a missing ! or ^, wiring, or a probe in an error state), or it was set off by the travel move before it. For the Smart Effector, the Config Reference says a fast travel move before probing may trigger the probe spuriously and cause this error, and recovery_time in [smart_effector] is the delay that prevents it.`,
      evidence: [hit.ev],
    };
  },
};

// mcu.py MCU_endstop.home_wait(): "Communication timeout during homing". Documented in docs/Multi_MCU_Homing.md.
export const homingCommTimeout: CrashRule = {
  id: 'homing-comm-timeout',
  severity: 'warning',
  title: 'Communication timeout during homing',
  detail:
    'While homing, a micro-controller stopped answering the host in time. Klipper\'s multi-MCU homing needs low and steady latency between the host and every micro-controller involved.',
  fix: 'Check the link to each micro-controller involved (cable, power, a USB hub). An axis with several steppers, for example stepper_z and stepper_z1, needs all of them on the same micro-controller to use multi-MCU homing.',
  docs: KLIPPER_DOCS + 'Multi_MCU_Homing.html',
  check(ctx): Hit | null {
    const hit = ctx.match(/(?:^|: )Communication timeout during homing\s*$/);
    if (!hit) return null;
    return {
      detail: `Klipper gave up on a homing move because a micro-controller stopped responding in time ("Communication timeout during homing").${STOPPED} The Klipper docs on multi-MCU homing say that typically the round-trip time between the host and each micro-controller must be consistently below 10 ms, that high latency even for short periods is likely to cause homing failures, and that the same error is raised if some other communication problem is detected.`,
      evidence: [hit.ev],
    };
  },
};

const BLTOUCH_DOCS = KLIPPER_DOCS + 'BLTouch.html#bl-touch-clones';

// extras/bltouch.py: _test_sensor() raises "BLTouch failed to verify sensor state" after three tries,
// _verify_raise_probe() raises "BLTouch failed to raise probe". docs/BLTouch.md names the setting for each.
export const bltouchVerify: CrashRule = {
  id: 'bltouch-verify',
  severity: 'warning',
  title: 'BLTouch failed its own check',
  detail:
    'Klipper checks the BLTouch before and after every probe, and it did not get the answer a working BLTouch gives, three times in a row.',
  fix: 'Run the BLTouch tests in BLTouch.md (pin_down, pin_up, touch_mode, QUERY_PROBE) and check the wiring.',
  docs: BLTOUCH_DOCS,
  check(ctx): Hit | null {
    const sensor = ctx.match(/^BLTouch failed to verify sensor state\s*$/);
    const raise = ctx.match(/^BLTouch failed to raise probe\s*$/);
    const hit = sensor ?? raise;
    if (!hit) return null;
    const evidence: Evidence[] = [hit.ev];
    if (sensor) {
      return {
        detail: `Klipper could not get the BLTouch sensor to report the state it expects, after three tries ("BLTouch failed to verify sensor state").${STOPPED} The BLTouch docs say this usually means wrong wiring or configuration, and that some clone devices cannot pass Klipper's check at all.`,
        fix: 'Run the sensor tests in BLTouch.md: pin_down, touch_mode, then QUERY_PROBE should say "open", and "TRIGGERED" while you push the pin up. If those are right and the error stays, the docs say to set pin_up_touch_mode_reports_triggered: False in [bltouch]. Otherwise fix the wiring and pin settings.',
        evidence,
      };
    }
    return {
      detail: `Klipper could not confirm the BLTouch pin went back up after a probe, after three tries ("BLTouch failed to raise probe").${STOPPED} The BLTouch docs say a rare number of old clone devices cannot report that they raised the pin and fail this way after every home or probe.`,
      fix: 'Run BLTOUCH_DEBUG COMMAND=pin_down, check the pin moved, then QUERY_PROBE; run BLTOUCH_DEBUG COMMAND=pin_up and QUERY_PROBE again. The docs say that if the pin goes up but the second query reports "TRIGGERED", set pin_up_reports_not_triggered: False in [bltouch]. If the pin does not go up, check the wiring and the pin itself.',
      evidence,
    };
  },
};
