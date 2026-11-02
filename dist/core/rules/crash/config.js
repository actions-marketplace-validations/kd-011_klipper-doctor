import { KLIPPER_DOCS } from '../types.js';
import { findRemoved } from '../config/removed.js';
// klippy/klippy.py _connect(): config errors are logged as "Config error" followed by the traceback.
// The message strings are from klippy/configfile.py (ConfigWrapper._get_wrapper, ConfigValidate.check_unused,
// ConfigFileReader._resolve_include / read_config_file).
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
            detail: `The config has a [${m[1]}] section that Klipper does not recognise. It is usually a misspelt section name.`,
            fix: `Check the spelling of [${m[1]}] against the Config Reference.`,
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
