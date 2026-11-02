// Mirrors how Klipper reads a config (klippy/configfile.py):
//  - RawConfigParser(strict=False, inline_comment_prefixes=(';', '#')): option names are
//    lowercased, a repeated option keeps the LAST value, repeated sections merge.
//  - ConfigFileReader._parse_config strips everything from the first "#" on every line, then
//    handles "[include <glob>]" lines.
//  - A line indented with whitespace continues the previous option (this is how gcode: blocks work).
//  - The SAVE_CONFIG block is every line after the AUTOSAVE_HEADER, each prefixed "#*# ".

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

const OPTION_RE = /^(.*?)\s*([:=])\s*(.*)$/;
const SECTION_RE = /^\[([^\]]+)\]/;
const LOOKS_LIKE_KEY = /^[A-Za-z_][A-Za-z0-9_.\-]*$/;
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

  for (let i = 0; i < lines.length; i++) {
    const no = firstLine + i;
    let line = lines[i] as string;

    if (raw && !inSave && line.startsWith(AUTOSAVE_MARKER)) {
      inSave = true;
      saveConfigLine = no;
      cursect = undefined;
      curopt = undefined;
      continue;
    }
    if (inSave) {
      // "#*# text" -> "text"; a bare "#*#" is a blank line.
      if (line.startsWith('#*# ')) line = line.slice(4);
      else if (line.startsWith('#*#')) line = '';
      else continue;
      // Second line of Klipper's AUTOSAVE_HEADER.
      if (line.startsWith('DO NOT EDIT THIS BLOCK OR BELOW.')) continue;
    } else if (raw) {
      const hash = line.indexOf('#');
      if (hash >= 0) line = line.slice(0, hash);
    }

    // Full-line and inline ";" comments (inline needs whitespace before it).
    const trimmedStart = line.trimStart();
    if (trimmedStart.startsWith(';')) continue;
    const semi = line.search(/\s;/);
    if (semi >= 0) line = line.slice(0, semi);

    if (line.trim() === '') continue;

    if (/^\s/.test(line)) {
      if (curopt) {
        curopt.value += '\n' + line.trim();
        curopt.continuation.push(no);
      }
      continue;
    }

    const sm = SECTION_RE.exec(line);
    if (sm) {
      const header = (sm[1] as string).trim();
      if (header.startsWith('include ')) {
        includes.push({ spec: header.slice(8).trim(), line: no });
        cursect = undefined;
        curopt = undefined;
        continue;
      }
      cursect = { name: header, line: no, options: [], saveConfig: inSave };
      sections.push(cursect);
      curopt = undefined;
      continue;
    }

    const om = OPTION_RE.exec(line);
    const key = om ? (om[1] as string).trim() : '';
    if (om && key !== '' && cursect) {
      if (raw && !LOOKS_LIKE_KEY.test(key)) {
        problems.push(problem(no, lines[i] as string, cursect, curopt));
      } else {
        curopt = {
          name: key.toLowerCase(),
          rawName: key,
          value: (om[3] as string).trim(),
          line: no,
          continuation: [],
          saveConfig: inSave,
        };
        cursect.options.push(curopt);
      }
    } else if (raw) {
      problems.push(problem(no, lines[i] as string, cursect, curopt));
    }
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
      for (const s of sections) if (re.test(s.name) && !out.includes(s.name)) out.push(s.name);
      return out;
    },
  };
}

function problem(line: number, text: string, sec?: CfgSection, opt?: CfgOption): CfgProblem {
  const afterMultiline =
    !!opt && (opt.continuation.length > 0 || opt.value === '' || GCODE_OPTION.test(opt.name));
  return { line, text, section: sec?.name, option: opt?.name, afterMultiline };
}
