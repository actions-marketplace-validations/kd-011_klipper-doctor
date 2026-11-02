// Mirrors how Klipper reads a config (klippy/configfile.py):
//  - RawConfigParser(strict=False, inline_comment_prefixes=(';', '#')): option names are
//    lowercased, a repeated option keeps the LAST value, repeated sections merge.
//  - ConfigFileReader._parse_config strips everything from the first "#" on every line, then
//    handles "[include <glob>]" lines. Only a line at column 0 can be an include, and the text after
//    one is parsed separately, so it starts with no current section.
//  - A line continues the previous option only when it is indented deeper than that option
//    (RawConfigParser._read compares indent levels). Blank and comment lines do not change that.
//    An indented line at the same level is a new option, and an indented [section] can start a section.
//  - The SAVE_CONFIG block is every line after the AUTOSAVE_HEADER, each prefixed "#*# ".
// This was checked by running both parsers over every file in Klipper's config/ directory.
export const AUTOSAVE_MARKER = '#*# <---------------------- SAVE_CONFIG ---------------------->';
const SECTION_RE = /^\[([^\]]+)\]/;
// configparser takes any text before the first ":" or "=" as an option name, and Klipper then rejects
// a name it does not read. These characters only appear in a name when a line of G-code or a template
// has lost its indent. gcode_macro reads any name that starts with variable_ (extras/gcode_macro.py).
const NOT_A_KEY = /[\s{}%()'"[\]<>]/;
const GCODE_OPTION = /(^|_)gcode$|^script$/i;
/**
 * @param lines  text lines as they appear in the file
 * @param firstLine  1-based line number of lines[0] in the analysed text
 * @param raw  true for a hand-written printer.cfg, false for the config Klipper dumped into klippy.log
 */
export function parseConfig(lines, firstLine, raw) {
    const sections = [];
    const includes = [];
    const problems = [];
    let saveConfigLine;
    let cursect;
    let curopt;
    let inSave = false;
    let indentLevel = 0;
    for (let i = 0; i < lines.length; i++) {
        const no = firstLine + i;
        let line = lines[i];
        if (raw && !inSave && line.startsWith(AUTOSAVE_MARKER)) {
            inSave = true;
            saveConfigLine = no;
            cursect = undefined;
            curopt = undefined;
            indentLevel = 0;
            continue;
        }
        if (inSave) {
            // "#*# text" -> "text"; a bare "#*#" is a blank line.
            if (line.startsWith('#*# '))
                line = line.slice(4);
            else if (line.startsWith('#*#'))
                line = '';
            else
                continue;
            // Second line of Klipper's AUTOSAVE_HEADER.
            if (line.startsWith('DO NOT EDIT THIS BLOCK OR BELOW.'))
                continue;
        }
        if (raw) {
            const hash = line.indexOf('#');
            if (hash >= 0)
                line = line.slice(0, hash);
        }
        const text = stripSemicolonComment(line).trim();
        if (text === '')
            continue;
        const indent = line.search(/\S/);
        if (cursect && curopt && indent > indentLevel) {
            curopt.value += '\n' + text;
            curopt.continuation.push(no);
            continue;
        }
        indentLevel = indent;
        const sm = SECTION_RE.exec(text);
        if (sm) {
            const header = sm[1];
            if (indent === 0 && !inSave && header.startsWith('include ')) {
                includes.push({ spec: header.slice(8).trim(), line: no });
                cursect = undefined;
                curopt = undefined;
                indentLevel = 0;
                continue;
            }
            cursect = { name: header, line: no, options: [], saveConfig: inSave };
            sections.push(cursect);
            curopt = undefined;
            continue;
        }
        const at = delimiterAt(text);
        const key = at > 0 ? text.slice(0, at).trimEnd() : '';
        if (key === '' || !cursect) {
            if (raw)
                problems.push(problem(no, lines[i], cursect, curopt));
            continue;
        }
        if (raw && NOT_A_KEY.test(key) && !key.toLowerCase().startsWith('variable_')) {
            problems.push(problem(no, lines[i], cursect, curopt));
            continue;
        }
        curopt = {
            name: key.toLowerCase(),
            rawName: key,
            value: text.slice(at + 1).trim(),
            line: no,
            continuation: [],
            saveConfig: inSave,
        };
        cursect.options.push(curopt);
    }
    const byName = new Map();
    for (const s of sections) {
        const l = byName.get(s.name);
        if (l)
            l.push(s);
        else
            byName.set(s.name, [s]);
    }
    return {
        sections,
        includes,
        problems,
        saveConfigLine,
        sectionsNamed: (name) => byName.get(name) ?? [],
        hasSection: (name) => byName.has(name),
        option(section, name) {
            const secs = byName.get(section);
            if (!secs)
                return undefined;
            let main;
            let saved;
            for (const s of secs) {
                for (const o of s.options) {
                    if (o.name !== name)
                        continue;
                    if (o.saveConfig)
                        saved = o;
                    else
                        main = o;
                }
            }
            return main ?? saved;
        },
        sectionNames(re) {
            const out = [];
            for (const name of byName.keys())
                if (re.test(name))
                    out.push(name);
            return out;
        },
    };
}
/** A ";" starts a comment at the start of a line or after whitespace (RawConfigParser._read). */
function stripSemicolonComment(line) {
    if (line.trimStart().startsWith(';'))
        return '';
    for (let at = line.indexOf(';'); at >= 0; at = line.indexOf(';', at + 1)) {
        if (at === 0 || /\s/.test(line.charAt(at - 1)))
            return line.slice(0, at);
    }
    return line;
}
function delimiterAt(text) {
    const colon = text.indexOf(':');
    const equals = text.indexOf('=');
    if (colon < 0)
        return equals;
    return equals < 0 ? colon : Math.min(colon, equals);
}
function problem(line, text, sec, opt) {
    const afterMultiline = !!opt && (opt.continuation.length > 0 || opt.value === '' || GCODE_OPTION.test(opt.name));
    return { line, text, section: sec?.name, option: opt?.name, afterMultiline };
}
