import type { Evidence } from '../../types.js';
import type { CrashRule } from '../types.js';
import { KLIPPER_DOCS } from '../types.js';

// klippy/extras/tmc_uart.py: "Unable to read tmc uart '%s' register %s"
// klippy/extras/tmc2130.py: "Unable to write tmc spi '%s' register %s"
// klippy/extras/tmc.py:     "TMC '%s' reports error: %s", and "TMC %s failed to init: %s", which is logged
//                           at startup without stopping. It shuts down only if the driver still does not
//                           answer when the stepper is enabled (TMCCommandHelper _do_enable).
// The guidance below comes from docs/TMC_Drivers.md, "Common errors" (the Unable to read/write
// entries and "Why did I get a TMC reports error"), reworded.
const TMC_DOCS = KLIPPER_DOCS + 'TMC_Drivers.html';

export const tmcComm: CrashRule = {
  id: 'tmc-comm',
  severity: 'error',
  title: 'Cannot talk to a TMC driver',
  detail:
    'Klipper could not read from or write to a Trinamic stepper driver over UART or SPI.',
  fix: 'Make sure motor power is on, then check the driver wiring and the UART or SPI pin settings.',
  docs: TMC_DOCS + '#i-keep-getting-unable-to-read-tmc-uart-stepper_x-register-ifcnt-errors',
  check(ctx) {
    const hit = ctx.match(/^(?!TMC \S+ failed to init: ).*Unable to (read|write) tmc (uart|spi) '([^']+)' register (\w+)/);
    if (!hit) {
      const init = ctx.cause ? undefined : ctx.match(/^TMC \S+ failed to init: Unable to (read|write) tmc (uart|spi) '([^']+)' register (\w+)/);
      if (!init) return null;
      const [, verb, bus, stepper, reg] = init.m;
      return {
        severity: 'warning',
        title: `TMC driver for ${stepper} did not answer at startup`,
        detail: `Klipper could not ${verb} register ${reg} on the TMC driver for ${stepper} over ${(bus as string).toUpperCase()} at startup, and carried on. That is expected if motor power was off at the time, because the driver generally needs it before it will answer. If the driver still does not answer when the stepper is enabled, Klipper shuts down.`,
        fix: 'If motor power was on when Klipper started, check the driver wiring and the UART or SPI pin settings.',
        evidence: [init.ev],
      };
    }
    const [, verb, bus, stepper, reg] = hit.m;
    let detail = `Klipper could not ${verb} register ${reg} on the TMC driver for ${stepper} over ${(bus as string).toUpperCase()}. The Klipper TMC guide says to make sure motor power is enabled, because the driver generally needs it before it will answer`;
    let fix: string;
    if (bus === 'uart') {
      detail += '. If this started right after flashing Klipper for the first time, the driver may have been left in a state Klipper cannot use: remove all power, USB and mains, for several seconds. Otherwise it is usually wrong UART wiring or wrong UART pin settings in the config.';
      fix = 'Turn motor power on, then power-cycle the printer fully; if it persists, check the uart_pin, tx_pin and uart_address settings against the wiring.';
    } else {
      detail += ', and otherwise points at SPI wiring, SPI settings in the config, or a device on a shared SPI bus that is not configured in Klipper.';
      fix = 'Turn motor power on, then check the SPI wiring and settings, and configure every device on a shared SPI bus.';
    }
    return { detail, fix, evidence: [hit.ev] };
  },
};

const FLAGS: { re: RegExp; text: string; fix: string }[] = [
  { re: /\bot=1|OvertempError/, text: 'The driver shut itself off because it got too hot (overtemperature). Typical fixes are lower motor current and more cooling for the driver and the motor.', fix: 'Lower the motor run_current and add cooling for the driver and the motor.' },
  // Older releases wrote LowSideShort for what is now ShortToSupply.
  { re: /ShortToGND|ShortToSupply|LowSideShort/, text: 'The driver shut itself off after seeing very high current. That can be a loose or shorted wire to the motor, or a fault inside the motor. In stealthChop mode it can also be the driver mispredicting the load, so try with stealthchop_threshold removed.', fix: 'Check the motor wiring and the motor itself for shorts, and test with stealthchop_threshold removed.' },
  // The docs write CS_ACTUAL and SE in capitals; the source writes lowercase field names (extras/tmc2130.py, tmc2660.py).
  { re: /\breset=1|\bcs_actual=0\(Reset|\bse=0\(Reset/i, text: 'The driver reset itself mid-print, which points at voltage or wiring problems.', fix: 'Check the power supply voltage and the wiring to the driver and motor.' },
  { re: /uv_cp=1|Undervoltage/, text: 'The driver saw a low-voltage event and disabled itself, which points at wiring or power supply problems.', fix: 'Check the power supply and the wiring to the driver.' },
];

export const tmcReportsError: CrashRule = {
  id: 'tmc-reports-error',
  severity: 'error',
  title: 'TMC driver reports an error',
  detail:
    'A Trinamic stepper driver told Klipper it had a fault and disabled itself, so Klipper shut the printer down.',
  fix: 'Read the flag in the message: overtemperature means less current or more cooling, short flags mean wiring or the motor, reset or undervoltage mean power or wiring.',
  docs: TMC_DOCS + '#why-did-i-get-a-tmc-reports-error-error',
  check(ctx) {
    const hit = ctx.match(/TMC '([^']+)' reports error: (.*)$/);
    if (!hit) return null;
    const [, stepper, status] = hit.m;
    // docs/TMC_Drivers.md: 00000000 or ffffffff is the bus, not the driver's flags. With ffffffff every
    // flag reads as set, so this comes first.
    const allSame = /^\S+:\s+(?:0{8}|f{8})\b/i.test(status as string);
    const flags = allSame ? [] : FLAGS.filter((f) => f.re.test(status as string));
    const found = flags.map((f) => f.text);
    let detail = `The TMC driver for ${stepper} reported a fault (${(status as string).trim()}) and disabled itself.`;
    let fix = 'Look up the flag in the Klipper TMC guide ("Why did I get a TMC reports error"), then fix the power, wiring or cooling it points to.';
    if (allSame) {
      detail = `The TMC driver for ${stepper} returned a status of all zeros or all ones (${(status as string).trim()}). That is commonly an SPI wiring problem, or a driver that reset itself or failed, rather than a fault flag from the driver.`;
      fix = 'Check the SPI wiring to the driver and its power.';
    } else if (found.length) {
      detail += ' ' + found.join(' ');
      fix = flags.map((f) => f.fix).join(' ');
    }
    const ev: Evidence[] = [hit.ev];
    return { detail, fix, evidence: ev };
  },
};

