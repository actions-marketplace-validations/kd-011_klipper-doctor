import { KLIPPER_DOCS, KLIPPER_SRC } from '../types.js';
import { COMMAND_ERRORS } from './commandErrorTable.js';
// klippy/gcode.py _respond_error() logs a command error as a bare line and Klipper keeps running. Nothing marks that
// line as an error, so the rule recognises it from the messages the source can raise (scripts/gen-command-errors.mjs).
// Whole lines only, in the lines before the first shutdown, so a quoted message or the cascade does not count.
// These have their own rules, with specific advice.
const HAS_OWN_RULE = /^(?:Move out of range|Must home axis first|No trigger on |Endstop .* still triggered|Probe triggered prior|(?:Error during homing [^:]*: )?Communication timeout during homing|BLTouch failed|Extrude below minimum|Extrude only move too long|Move exceeds maximum extrusion|TMC |Unable to (?:read|write) tmc)/;
// Keyed on the first word, because a long log has far more lines than the table has messages.
let table;
function byFirstWord() {
    if (table)
        return table;
    table = new Map();
    for (const [message, file] of COMMAND_ERRORS) {
        const pattern = message
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/%%/g, '%')
            .replace(/%[-\\.\d]*[a-zA-Z]/g, '.*');
        const word = message.split(' ')[0];
        const list = table.get(word) ?? [];
        list.push({ re: new RegExp(`^${pattern}\\s*$`), file });
        table.set(word, list);
    }
    return table;
}
function fileOf(line) {
    if (line.length > 400 || HAS_OWN_RULE.test(line))
        return undefined;
    const space = line.indexOf(' ');
    const known = byFirstWord().get(space < 0 ? line : line.slice(0, space));
    return known?.find((k) => k.re.test(line))?.file;
}
export const commandError = {
    id: 'command-error',
    severity: 'warning',
    title: 'A G-code command failed',
    detail: 'Klipper refused a command and logged one of the messages its source raises as a command error. Klipper keeps running, but a print from the virtual SD card stops on one.',
    fix: 'The message says what Klipper wanted. If a macro or the slicer start G-code ran the command, fix it there.',
    docs: KLIPPER_DOCS + 'G-Codes.html',
    check(ctx) {
        let last;
        const distinct = new Set();
        for (const ev of ctx.causal) {
            const file = fileOf(ev.text);
            if (!file)
                continue;
            last = { ev, file };
            distinct.add(ev.text.trimEnd());
        }
        if (!last)
            return null;
        const text = last.ev.text.trimEnd();
        distinct.delete(text);
        const others = [...distinct].slice(0, 5).map((t) => `"${t}"`);
        return {
            title: `A command failed: ${text}`,
            detail: `Klipper refused a command and logged "${text}", which comes from ${last.file} in the Klipper source. Klipper keeps running after a command error, but a print from the virtual SD card stops on one.${others.length ? ` Earlier in this session it also logged ${others.join(', ')}.` : ''}`,
            docs: KLIPPER_SRC + last.file,
            evidence: [last.ev],
        };
    },
};
