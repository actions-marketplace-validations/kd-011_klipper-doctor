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

export interface CfgOption {
  /** Lowercased, as Klipper stores it. */
  name: string;
  rawName: string;
  /** First-line value, then continuation lines joined with "\n". */
  value: string;
  line: number;
  /** Line numbers of continuation lines. */
  continuation: number[];
  saveConfig: boolean;
}

export interface CfgSection {
  name: string;
  line: number;
  options: CfgOption[];
  saveConfig: boolean;
}

export interface CfgInclude {
  spec: string;
  line: number;
}

export interface CfgProblem {
  line: number;
  text: string;
  /** What the line follows, to say whether it broke a macro. */
  section?: string;
  option?: string;
  /** True when the previous option was a multi-line value (a gcode: block or similar). */
  afterMultiline: boolean;
}

export interface ParsedConfig {
  sections: CfgSection[];
  includes: CfgInclude[];
  problems: CfgProblem[];
  saveConfigLine?: number;
  /** All main-config and SAVE_CONFIG sections with this exact name. */
  sectionsNamed(name: string): CfgSection[];
  hasSection(name: string): boolean;
  /** Value Klipper would use: the main config wins over the SAVE_CONFIG block, last repeat wins. */
  option(section: string, name: string): CfgOption | undefined;
  /** Section names matching a pattern, in file order, without repeats. */
  sectionNames(re: RegExp): string[];
}

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
export function parseConfig(lines: string[], firstLine: number, raw: boolean): ParsedConfig {
  const sections: CfgSection[] = [];
  const includes: CfgInclude[] = [];
  const problems: CfgProblem[] = [];
  let saveConfigLine: number | undefined;

  let cursect: CfgSection | undefined;
  let curopt: CfgOption | undefined;
  let inSave = false;
  let indentLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const no = firstLine + i;
    let line = lines[i] as string;

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
      if (line.startsWith('#*# ')) line = line.slice(4);
      else if (line.startsWith('#*#')) line = '';
      else continue;
      // Second line of Klipper's AUTOSAVE_HEADER.
      if (line.startsWith('DO NOT EDIT THIS BLOCK OR BELOW.')) continue;
    }
    if (raw) {
      const hash = line.indexOf('#');
      if (hash >= 0) line = line.slice(0, hash);
    }

    const text = stripSemicolonComment(line).trim();
    if (text === '') continue;

    const indent = line.search(/\S/);
    if (cursect && curopt && indent > indentLevel) {
      curopt.value += '\n' + text;
      curopt.continuation.push(no);
      continue;
    }
    indentLevel = indent;

    const sm = SECTION_RE.exec(text);
    if (sm) {
      const header = sm[1] as string;
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
      if (raw) problems.push(problem(no, lines[i] as string, cursect, curopt));
      continue;
    }
    if (raw && NOT_A_KEY.test(key) && !key.toLowerCase().startsWith('variable_')) {
      problems.push(problem(no, lines[i] as string, cursect, curopt));
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

  const byName = new Map<string, CfgSection[]>();
  for (const s of sections) {
    const l = byName.get(s.name);
    if (l) l.push(s);
    else byName.set(s.name, [s]);
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
      if (!secs) return undefined;
      let main: CfgOption | undefined;
      let saved: CfgOption | undefined;
      for (const s of secs) {
        for (const o of s.options) {
          if (o.name !== name) continue;
          if (o.saveConfig) saved = o;
          else main = o;
        }
      }
      return main ?? saved;
    },
    sectionNames(re) {
      const out: string[] = [];
      for (const name of byName.keys()) if (re.test(name)) out.push(name);
      return out;
    },
  };
}

/** A ";" starts a comment at the start of a line or after whitespace (RawConfigParser._read). */
function stripSemicolonComment(line: string): string {
  if (line.trimStart().startsWith(';')) return '';
  for (let at = line.indexOf(';'); at >= 0; at = line.indexOf(';', at + 1)) {
    if (at === 0 || /\s/.test(line.charAt(at - 1))) return line.slice(0, at);
  }
  return line;
}

function delimiterAt(text: string): number {
  const colon = text.indexOf(':');
  const equals = text.indexOf('=');
  if (colon < 0) return equals;
  return equals < 0 ? colon : Math.min(colon, equals);
}

function problem(line: number, text: string, sec?: CfgSection, opt?: CfgOption): CfgProblem {
  const afterMultiline =
    !!opt && (opt.continuation.length > 0 || opt.value === '' || GCODE_OPTION.test(opt.name));
  return { line, text, section: sec?.name, option: opt?.name, afterMultiline };
}
