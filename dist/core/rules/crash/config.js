import { KLIPPER_DOCS } from '../types.js';
import { findRemoved } from '../config/removed.js';
// klippy/klippy.py _connect(): config errors are logged as "Config error" followed by the traceback.
// The message strings are from klippy/configfile.py (ConfigWrapper._get_wrapper, ConfigValidate.check_unused,
// ConfigFileReader._resolve_include / read_config_file), klippy/pins.py (PrinterPins.parse_pin, lookup_pin),
// klippy/toolhead.py (kinematics), klippy/extras/heaters.py (setup_sensor) and klippy/extras/tmc.py (TMCMicrostepHelper).
const CONFIG_CHECKS = KLIPPER_DOCS + 'Config_checks.html';
const MESSAGES = [
    {
        re: /Option '([^']+)' is not valid in section '([^']+)'/,
        explain: (m) => {
            const removed = findRemoved(m[2], m[1]);
            if (removed) {
                return {
                    detail: `The config has ${m[1]} in [${m[2]}], and Klipper does not accept it. Config_Changes says it was removed on ${removed.removed}. ${removed.use}`,
                    fix: removed.use,
                };
            }
            return {
                detail: `The config has ${m[1]} in [${m[2]}], but Klipper does not recognise that option there. It is a typo, an option that belongs in another section, or one that has been removed or renamed (check Config_Changes).`,
                fix: `Fix the spelling of ${m[1]}, move it to the right section, or delete it.`,
            };
        },
    },
    {
        re: /Section '([^']+)' is not a valid config section/,
        explain: (m) => ({
            // klippy/klippy.py load_object: a section only counts if klippy/extras/ has a module of that name.
            detail: `The config has a [${m[1]}] section that Klipper does not recognise. It is usually a misspelt section name, or a section from an add-on that is not installed in klippy/extras.`,
            fix: `Check the spelling of [${m[1]}] against the Config Reference, or install the add-on it belongs to.`,
        }),
    },
    {
        re: /Option '([^']+)' in section '([^']+)' must be specified/,
        explain: (m) => ({
            detail: `[${m[2]}] has no ${m[1]}, and Klipper needs it.`,
            fix: `Add ${m[1]} to [${m[2]}], see the Config Reference.`,
        }),
    },
    {
        re: /Unable to parse option '([^']+)' in section '([^']+)'/,
        explain: (m) => ({
            detail: `The value of ${m[1]} in [${m[2]}] is not in the form Klipper expects, for example text where a number is needed.`,
            fix: `Fix the value of ${m[1]} in [${m[2]}].`,
        }),
    },
    {
        re: /Option '([^']+)' in section '([^']+)' must (?:have minimum of|have maximum of|be above|be below) (\S+)/,
        explain: (m) => ({
            detail: `The value of ${m[1]} in [${m[2]}] is outside the allowed range (${m[0].replace(/^.* must /, 'it must ')}).`,
            fix: `Change ${m[1]} in [${m[2]}] to a value in range.`,
        }),
    },
    {
        // pins.py lookup_pin(): a pin may be used once, unless the users agree on a share_type (enable pins, ...); an endstop pin is only shared within one rail (klippy/stepper.py lookup_endstop).
        re: /pin (\S+) used multiple times in config/,
        explain: (m) => ({
            detail: `Pin ${m[1]} is used by more than one thing in the config, and Klipper allows a pin to be used once unless it is shared on purpose: enable pins can be, and an endstop pin can be shared only by the steppers of one axis, such as stepper_z and stepper_z1. A common cause is a step, dir, heater or fan pin copied from another section, or one endstop pin given to two different axes.`,
            fix: `Search the config for ${m[1]} and give the second use its own pin. The Config Reference describes [duplicate_pin_override] as meant for diagnostics and says it may cause confusing results.`,
        }),
    },
    {
        // pins.py parse_pin(): the part before ":" must be the name of an [mcu name] section (or the built-in chips).
        re: /Unknown pin chip name '([^']*)'/,
        explain: (m) => ({
            detail: `A pin in the config starts with "${m[1]}:", and Klipper has no micro-controller or pin chip of that name. The name before the colon has to be a section such as [mcu ${m[1]}], or another chip a section creates.`,
            fix: `Add the [mcu ${m[1]}] section, or fix the spelling of "${m[1]}:" in the pin.`,
        }),
    },
    {
        re: /Invalid pin description '([^']*)'/,
        explain: (m) => ({
            detail: `Klipper cannot read the pin "${m[1]}". A pin is written as an optional ^ or ~ (pull-up), an optional ! (invert), an optional chip name and a colon, then the pin name, in that order, and only the options that pin type allows.`,
            fix: `Rewrite the pin in the form Klipper prints after the error: [^~] [!] [chip_name:] pin_name.`,
        }),
    },
    {
        // configfile.py getchoice()
        re: /Choice '([^']*)' for option '([^']+)' in section '([^']+)' is not a valid choice/,
        explain: (m) => ({
            detail: `${m[2]} in [${m[3]}] is set to "${m[1]}", which is not one of the values Klipper accepts for it.${m[2] === 'microsteps' ? ' A TMC driver takes 256, 128, 64, 32, 16, 8, 4, 2 or 1 (extras/tmc.py).' : ''}`,
            fix: `Change ${m[2]} in [${m[3]}] to a value the Config Reference lists for it.`,
        }),
    },
    {
        // toolhead.py: any exception while loading the kinematics module that is not a config or pin error.
        re: /Error loading kinematics '([^']*)'/,
        explain: (m) => ({
            detail: `Klipper could not load the kinematics "${m[1]}" named in [printer]. The usual cause is a misspelt name; the traceback above the message shows the Python error if it is not.`,
            fix: `Set kinematics in [printer] to one of the names in the Config Reference (cartesian, corexy, corexz, delta and the others listed there).`,
        }),
    },
    {
        re: /Could not find config section '\[([^\]]*)\]' required by tmc driver/,
        explain: (m) => ({
            detail: `A TMC driver section names [${m[1]}], and the config has no such section. The words after the driver type in a section like [tmc2209 stepper_x] must match a stepper section name exactly.`,
            fix: `Fix the name in the TMC section header, or add [${m[1]}].`,
        }),
    },
    {
        re: /Unknown temperature sensor '([^']*)'/,
        explain: (m) => ({
            detail: `sensor_type "${m[1]}" is not a sensor Klipper knows, or it is spelt differently from the name in the Config Reference. Thermistor names must match exactly, including capitals.`,
            fix: 'Copy the sensor_type from the Config Reference, or define a custom [thermistor name] section for it.',
        }),
    },
    {
        re: /Include file '([^']+)' does not exist/,
        explain: (m) => ({
            detail: `An [include] line points at ${m[1]}, which is not there.`,
            fix: 'Fix the path in the [include] line, or add the file.',
        }),
    },
    {
        re: /position_endstop in section '([^']+)' must be between position_min and position_max/,
        explain: (m) => ({
            detail: `position_endstop in [${m[1]}] is outside position_min and position_max.`,
            fix: `Set position_endstop in [${m[1]}] to one end of the axis.`,
        }),
    },
    {
        re: /Unable to infer homing_positive_dir in section '([^']+)'|Invalid homing_positive_dir \/ position_endstop in '([^']+)'/,
        explain: (m) => ({
            detail: `Klipper cannot work out which way [${m[1] ?? m[2]}] homes from position_endstop and homing_positive_dir.`,
            fix: `Set position_endstop at one end of the axis and a matching homing_positive_dir in [${m[1] ?? m[2]}].`,
        }),
    },
];
export const configError = {
    id: 'config-error',
    severity: 'error',
    title: 'Klipper rejected the config',
    detail: 'Klipper stopped while reading printer.cfg and logged "Config error" with the reason.',
    fix: 'Fix the option named in the message, then RESTART.',
    docs: CONFIG_CHECKS,
    check(ctx) {
        const head = ctx.match(/^Config error\s*$/);
        if (!head)
            return null;
        const window = ctx.after(head.ev.line, 80);
        let reason;
        let explained;
        // The message is an unindented line; indented lines are the traceback's source code.
        for (const e of window.filter((x) => !/^\s/.test(x.text))) {
            for (const msg of MESSAGES) {
                const m = msg.re.exec(e.text);
                if (m) {
                    reason = e;
                    explained = msg.explain(m);
                    break;
                }
            }
            if (reason)
                break;
        }
        if (!reason) {
            // Fall back to the last line of the traceback: "package.ErrorName: message".
            reason = window.find((e) => /^[\w.]*(?:Error|error): /.test(e.text));
        }
        const message = reason ? reason.text.replace(/^[\w.]*(?:Error|error): /, '') : undefined;
        const base = `Klipper stopped at startup with "Config error"${message ? `: ${message}` : ''}.`;
        return {
            detail: explained ? `${base} ${explained.detail}` : base,
            fix: explained?.fix,
            evidence: reason ? [head.ev, reason] : [head.ev],
        };
    },
};
