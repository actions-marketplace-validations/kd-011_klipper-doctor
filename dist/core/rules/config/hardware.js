import { KLIPPER_DOCS, KLIPPER_SRC } from '../types.js';
// ---- pin-used-twice ----------------------------------------------------------------------------------
// klippy/pins.py PrinterPins.lookup_pin(): a pin that is looked up twice raises "pin %s used multiple times in
// config" unless both lookups pass the same share_type or the pin is in [duplicate_pin_override]. The only share
// types in klippy/ are enable pins (extras/stepper_enable.py), TMC UART and SPI chip-select pins and the software
// SPI/I2C pins of display and bus helpers. An endstop_pin is looked up per rail (klippy/stepper.py lookup_endstop reuses
// an endstop with the same pin only within one rail, such as stepper_z and stepper_z1), so two axes sharing one is
// also rejected. This rule leaves endstop_pin alone and reads only the options that Klipper always looks up without a
// share_type:
//   step_pin, dir_pin     klippy/stepper.py PrinterStepper: ppins.lookup_pin(step_pin, can_invert=True)
//   heater_pin            klippy/extras/heaters.py: ppins.setup_pin('pwm', heater_pin)
//   pin                   klippy/extras/fan.py, output_pin.py: ppins.setup_pin('pwm' or 'digital_out', pin)
// A pin is "chip:name"; with no chip the chip is mcu (pins.py parse_pin). A leading ! only inverts it.
const STEPPER_SECTION = /^(?:stepper_\S+|dual_carriage|extruder\d*|extruder_stepper .+|manual_stepper .+)$/;
const HEATER_SECTION = /^(?:extruder\d*|heater_bed|heater_generic .+)$/;
const PIN_SECTION = /^(?:fan|heater_fan .+|controller_fan .+|temperature_fan .+|fan_generic .+|output_pin .+)$/;
/** "chip:pin" for a pin description, or undefined when it is not a plain pin Klipper would resolve by name. */
function pinKey(desc) {
    let d = desc.trim();
    if (d.startsWith('!'))
        d = d.slice(1).trim();
    const at = d.indexOf(':');
    const chip = at < 0 ? 'mcu' : d.slice(0, at).trim();
    const pin = at < 0 ? d : d.slice(at + 1).trim();
    if (pin === '' || /[\s^~!:]/.test(pin) || /\s/.test(chip))
        return undefined;
    return `${chip}:${pin}`;
}
function pinUses(cfg) {
    const uses = new Map();
    const add = (sec, name) => {
        const opt = cfg.option(sec, name);
        const key = opt && pinKey(opt.value);
        if (!opt || !key)
            return;
        const list = uses.get(key);
        if (list)
            list.push({ sec, opt });
        else
            uses.set(key, [{ sec, opt }]);
    };
    for (const sec of cfg.sectionNames(STEPPER_SECTION)) {
        add(sec, 'step_pin');
        add(sec, 'dir_pin');
    }
    for (const sec of cfg.sectionNames(HEATER_SECTION))
        add(sec, 'heater_pin');
    for (const sec of cfg.sectionNames(PIN_SECTION))
        add(sec, 'pin');
    return uses;
}
export const pinUsedTwice = {
    id: 'pin-used-twice',
    scope: 'any',
    severity: 'error',
    title: 'Pin used by two sections',
    detail: 'Klipper lets a pin be used once, apart from enable pins, which are shared on purpose, and an endstop pin shared by the steppers of one axis, and stops at startup with "pin ... used multiple times in config".',
    fix: 'Give one of the two its own pin. [duplicate_pin_override] turns the check off, but the Config Reference says it is meant for diagnostics and may cause confusing results.',
    docs: KLIPPER_SRC + 'klippy/pins.py',
    check({ cfg, lineText }) {
        const hits = [];
        const allowed = new Set();
        // extras/duplicate_pin_override.py: config.getlist('pins') calls allow_multi_use_pin() on each.
        for (const p of (cfg.option('duplicate_pin_override', 'pins')?.value ?? '').split(/[,\n]/)) {
            const key = pinKey(p);
            if (key)
                allowed.add(key);
        }
        for (const [key, list] of pinUses(cfg)) {
            if (list.length < 2 || allowed.has(key))
                continue;
            const pin = key.slice(key.indexOf(':') + 1);
            const chip = key.slice(0, key.indexOf(':'));
            const where = list.map((u) => `${u.opt.name} in [${u.sec}] (line ${u.opt.line})`);
            const evidence = list.map((u) => ({ line: u.opt.line, text: lineText(u.opt.line) }));
            hits.push({
                title: `Pin ${pin} is used ${list.length} times${chip === 'mcu' ? '' : ` on ${chip}`}`,
                detail: `${pin} is set as ${where.join(', ')}. Klipper stops with "pin ${pin} used multiple times in config". A ! in front of the pin, or "mcu:" in front of it, does not make it a different pin.`,
                fix: `Change one of them to a pin that is free.`,
                evidence,
            });
        }
        return hits;
    },
};
// ---- TMC drivers ----------------------------------------------------------------------------------
// klippy/extras/tmc.py TMCMicrostepHelper(), run for every [tmcNNNN <stepper>] section:
//   the stepper section named after the driver type must exist ("Could not find config section ... required by
//   tmc driver"), and its microsteps is read with getchoice() from {256, 128, 64, 32, 16, 8, 4, 2, 1}.
// configfile.py getchoice() with an int table reads the value with getint(), so "16.0" is "Unable to parse".
const TMC_SECTION = /^tmc\d{4} (.+)$/;
const TMC_MICROSTEPS = new Set([256, 128, 64, 32, 16, 8, 4, 2, 1]);
const TMC_SRC = KLIPPER_SRC + 'klippy/extras/tmc.py';
function stepperOf(section) {
    return (TMC_SECTION.exec(section)?.[1] ?? '').trim().split(/\s+/).join(' ');
}
export const tmcMicrosteps = {
    id: 'tmc-microsteps',
    scope: 'any',
    severity: 'error',
    title: 'Microsteps value a TMC driver does not accept',
    detail: 'A stepper that has a TMC driver section must have microsteps set to 256, 128, 64, 32, 16, 8, 4, 2 or 1. Klipper stops at startup for any other value.',
    fix: 'Set microsteps in the stepper section to one of 256, 128, 64, 32, 16, 8, 4, 2 or 1, and match the driver\'s hardware setting if it has one.',
    docs: TMC_SRC,
    check({ cfg, lineText }) {
        const hits = [];
        for (const sec of cfg.sectionNames(TMC_SECTION)) {
            const stepper = stepperOf(sec);
            const opt = cfg.option(stepper, 'microsteps');
            if (!opt)
                continue;
            const text = opt.value.trim();
            const evidence = [{ line: opt.line, text: lineText(opt.line) }];
            if (/^[+-]?\d+$/.test(text)) {
                const n = Number(text);
                if (TMC_MICROSTEPS.has(n))
                    continue;
                hits.push({
                    title: `microsteps ${n} in [${stepper}] is not one a TMC driver accepts`,
                    detail: `[${stepper}] has microsteps ${n}, and [${sec}] drives it. extras/tmc.py reads microsteps as a choice from 256, 128, 64, 32, 16, 8, 4, 2 or 1 and stops with "Choice '${n}' for option 'microsteps' in section '${stepper}' is not a valid choice".`,
                    fix: `Set microsteps in [${stepper}] to one of 256, 128, 64, 32, 16, 8, 4, 2 or 1.`,
                    evidence,
                });
            }
            else if (/^[+-]?\d+\.\d*$/.test(text)) {
                hits.push({
                    title: `microsteps ${text} in [${stepper}] is not a whole number`,
                    detail: `[${stepper}] has microsteps ${text}, and [${sec}] drives it. Klipper reads microsteps as a whole number, so a decimal point stops it with "Unable to parse option 'microsteps' in section '${stepper}'".`,
                    fix: `Write microsteps in [${stepper}] as a whole number such as 16.`,
                    evidence,
                });
            }
        }
        return hits;
    },
};
export const tmcStepperMissing = {
    id: 'tmc-stepper-missing',
    scope: 'any',
    needsComplete: true,
    severity: 'error',
    title: 'TMC driver for a stepper that is not in the config',
    detail: 'The words after the driver type in a TMC section header must be the name of a stepper section. Klipper stops with "Could not find config section ... required by tmc driver".',
    fix: 'Fix the name in the TMC section header so it matches a stepper section exactly, or add the stepper section.',
    docs: TMC_SRC,
    check({ cfg, lineText }) {
        const hits = [];
        for (const sec of cfg.sectionNames(TMC_SECTION)) {
            const stepper = stepperOf(sec);
            if (cfg.hasSection(stepper))
                continue;
            const header = cfg.sectionsNamed(sec)[0];
            hits.push({
                title: `[${sec}] needs [${stepper}], which is not in the config`,
                detail: `[${sec}] drives the stepper [${stepper}], but the config has no [${stepper}] section. Klipper stops with "Could not find config section '[${stepper}]' required by tmc driver". It is usually a misspelt name or a stepper that was renamed or removed.`,
                fix: `Change the section header to match an existing stepper, or add [${stepper}].`,
                evidence: header ? [{ line: header.line, text: lineText(header.line) }] : [],
            });
        }
        return hits;
    },
};
// ---- kinematics ----------------------------------------------------------------------------------
// Each kinematics module in klippy/kinematics/ builds its steppers from fixed section names with
// config.getsection(), and a section that is not there fails at "Option 'step_pin' in section '<name>' must be
// specified" (the first thing the stepper reads). Names, from the modules:
//   cartesian, corexy, corexz, hybrid_corexy, hybrid_corexz   'stepper_' + x, y, z   (cartesian.py, ...)
//   delta, rotary_delta                                       'stepper_' + a, b, c   (delta.py, rotary_delta.py)
//   deltesian                                                 stepper_left, stepper_right, stepper_y
//   polar                                                     stepper_bed, stepper_arm, stepper_z
// Other kinematics (none, winch, generic_cartesian and any a fork adds) are left alone.
const KINEMATICS_SECTIONS = {
    cartesian: ['stepper_x', 'stepper_y', 'stepper_z'],
    corexy: ['stepper_x', 'stepper_y', 'stepper_z'],
    corexz: ['stepper_x', 'stepper_y', 'stepper_z'],
    hybrid_corexy: ['stepper_x', 'stepper_y', 'stepper_z'],
    hybrid_corexz: ['stepper_x', 'stepper_y', 'stepper_z'],
    delta: ['stepper_a', 'stepper_b', 'stepper_c'],
    rotary_delta: ['stepper_a', 'stepper_b', 'stepper_c'],
    deltesian: ['stepper_left', 'stepper_right', 'stepper_y'],
    polar: ['stepper_bed', 'stepper_arm', 'stepper_z'],
};
const list = (names) => names.map((n) => `[${n}]`).join(', ');
export const kinematicsMissingSection = {
    id: 'kinematics-missing-section',
    scope: 'any',
    needsComplete: true,
    severity: 'error',
    title: 'Stepper sections the kinematics needs are missing',
    detail: 'Each kinematics type reads its steppers from sections with fixed names, and Klipper stops at startup if one is not there.',
    fix: 'Add the missing stepper sections, or set kinematics in [printer] to the type the stepper sections are for.',
    docs: KLIPPER_DOCS + 'Config_Reference.html#printer',
    check({ cfg, lineText }) {
        const kin = cfg.option('printer', 'kinematics');
        const need = kin && KINEMATICS_SECTIONS[kin.value.trim()];
        if (!kin || !need)
            return [];
        const missing = need.filter((n) => !cfg.hasSection(n));
        if (missing.length === 0)
            return [];
        const have = cfg.sectionNames(/^stepper_\S+$/);
        const found = have.length ? ` The config has ${list(have)}.` : ' The config has no stepper sections.';
        return [
            {
                title: `kinematics: ${kin.value.trim()} needs ${list(missing)}`,
                detail: `[printer] has kinematics: ${kin.value.trim()}, which reads ${list(need)}, and ${list(missing)} ${missing.length > 1 ? 'are' : 'is'} not in the config.${found} Klipper stops with "Option 'step_pin' in section '${missing[0]}' must be specified".`,
                fix: `Add ${list(missing)} with their step_pin, dir_pin and the other stepper options, or change kinematics to the type your stepper sections are for.`,
                evidence: [{ line: kin.line, text: lineText(kin.line) }],
            },
        ];
    },
};
