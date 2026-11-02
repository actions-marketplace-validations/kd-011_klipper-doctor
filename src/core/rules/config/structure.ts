import type { Evidence, Hit } from '../../types.js';
import type { ConfigRule } from '../types.js';
import { KLIPPER_SRC } from '../types.js';

// Klipper reads the file with Python's RawConfigParser(strict=False) in klippy/configfile.py
// (ConfigFileReader._create_fileconfig). With strict=False a repeated option silently keeps the
// last value and a repeated section is merged into the first, so neither stops Klipper from
// starting and both are easy to miss.
const CONFIGFILE = KLIPPER_SRC + 'klippy/configfile.py';

export const duplicateOption: ConfigRule = {
  id: 'duplicate-option',
  scope: 'raw',
  severity: 'warning',
  title: 'Option set twice in one section',
  detail:
    'Klipper reads the config with strict=False, so when an option appears twice in a section it silently keeps the last value.',
  fix: 'Delete the line you do not want.',
  docs: CONFIGFILE,
  check({ cfg, lineText }) {
    const hits: Hit[] = [];
    const seen = new Map<string, { sec: string; name: string; lines: number[] }>();
    for (const s of cfg.sections) {
      if (s.saveConfig) continue;
      for (const o of s.options) {
        // Repeats of a section merge, so key on the section name, not the section block.
        const key = s.name + '\u0000' + o.name;
        const e = seen.get(key);
        if (e) e.lines.push(o.line);
        else seen.set(key, { sec: s.name, name: o.name, lines: [o.line] });
      }
    }
    for (const e of seen.values()) {
      if (e.lines.length < 2) continue;
      hits.push({
        title: `${e.name} is set ${e.lines.length} times in [${e.sec}]`,
        detail: `[${e.sec}] sets ${e.name} on lines ${e.lines.join(', ')}. Klipper uses the last one (line ${e.lines[e.lines.length - 1]}) and ignores the rest, which is rarely what the earlier lines were meant to do.`,
        fix: `Keep one ${e.name} line in [${e.sec}] and delete the others.`,
        evidence: e.lines.map((n): Evidence => ({ line: n, text: lineText(n) })),
      });
    }
    return hits;
  },
};

export const duplicateSection: ConfigRule = {
  id: 'duplicate-section',
  scope: 'raw',
  severity: 'warning',
  title: 'Section appears twice',
  detail:
    'Klipper merges repeated sections, so the second block quietly adds to or overrides the first.',
  fix: 'Merge the two blocks into one section.',
  docs: CONFIGFILE,
  check({ cfg, lineText }) {
    const hits: Hit[] = [];
    const groups = new Map<string, number[]>();
    for (const s of cfg.sections) {
      if (s.saveConfig) continue;
      const l = groups.get(s.name);
      if (l) l.push(s.line);
      else groups.set(s.name, [s.line]);
    }
    for (const [name, lines] of groups) {
      if (lines.length < 2) continue;
      hits.push({
        title: `[${name}] appears ${lines.length} times`,
        detail: `[${name}] starts on lines ${lines.join(', ')}. Klipper merges them into one section and, for any option set in both, keeps the value from the later block.`,
        fix: `Merge the [${name}] blocks into one.`,
        evidence: lines.map((n) => ({ line: n, text: lineText(n) })),
      });
    }
    return hits;
  },
};

// klippy/configfile.py ConfigAutoSave.load_main_config(): _strip_duplicates() comments out any
// SAVE_CONFIG field that the main config already sets, so the main value wins and the saved one
// is dropped without a message.
export const saveConfigDuplicate: ConfigRule = {
  id: 'save-config-duplicate',
  scope: 'raw',
  severity: 'warning',
  title: 'Option is in the main config and the SAVE_CONFIG block',
  detail:
    'When an option is in both places Klipper ignores the SAVE_CONFIG value and uses the main one, so a calibration result never takes effect.',
  fix: 'Delete the option from the main config (above the SAVE_CONFIG line) so the saved value is used.',
  docs: CONFIGFILE,
  check({ cfg, lineText }) {
    const hits: Hit[] = [];
    for (const s of cfg.sections) {
      if (!s.saveConfig) continue;
      for (const o of s.options) {
        const main = cfg
          .sectionsNamed(s.name)
          .filter((x) => !x.saveConfig)
          .flatMap((x) => x.options)
          .filter((x) => x.name === o.name);
        const last = main[main.length - 1];
        if (!last) continue;
        hits.push({
          title: `${o.name} in [${s.name}] is set in both the config and SAVE_CONFIG`,
          detail: `[${s.name}] ${o.name} is set on line ${last.line} and again in the SAVE_CONFIG block on line ${o.line}. Klipper uses the line-${last.line} value and the SAVE_CONFIG value is ignored, so the result of the last calibration is not used.`,
          fix: `Delete ${o.name} from [${s.name}] above the SAVE_CONFIG block.`,
          evidence: [
            { line: last.line, text: lineText(last.line) },
            { line: o.line, text: lineText(o.line) },
          ],
        });
      }
    }
    return hits;
  },
};

// Python's configparser has no "continuation" without leading whitespace: a line at column 0 is
// a new "option: value" or "[section]". Inside a macro that line either has no ":" or "="
// (ParsingError, Klipper will not start) or looks like an option with a nonsense name
// (klippy/configfile.py ConfigValidate.check_unused: "Option '%s' is not valid in section '%s'").
const KLIPPER_COMMAND_TEMPLATES = 'https://www.klipper3d.org/Command_Templates.html';

export const gcodeUnindented: ConfigRule = {
  id: 'gcode-unindented',
  scope: 'raw',
  severity: 'error',
  title: 'Unindented line inside a gcode: block',
  detail:
    'Every line of a gcode: block must be indented. A line at column 0 is read as a new option, which Klipper cannot parse.',
  fix: 'Indent the line with spaces or a tab, like the lines above it.',
  docs: KLIPPER_COMMAND_TEMPLATES,
  check({ cfg }) {
    const hits: Hit[] = [];
    for (const p of cfg.problems) {
      if (!p.afterMultiline) continue;
      const where = p.section ? `[${p.section}]` : 'the config';
      hits.push({
        title: `Line ${p.line} in ${where} is not indented`,
        detail: `Line ${p.line} sits at column 0 right after the ${p.option ?? 'gcode'} block in ${where}. Klipper reads it as a new option, fails to parse it, and the macro ends there.`,
        fix: `Indent line ${p.line} to match the rest of the block.`,
        evidence: [{ line: p.line, text: p.text }],
      });
    }
    return hits;
  },
};

export const unparseableLine: ConfigRule = {
  id: 'unparseable-line',
  scope: 'raw',
  severity: 'error',
  title: 'Line Klipper cannot parse',
  detail:
    'A line outside any indented block has no ":" or "=", or sits before the first [section]. Klipper stops with a config parse error.',
  fix: 'Make it an "option: value" line, indent it if it continues the line above, or comment it out with #.',
  docs: CONFIGFILE,
  check({ cfg }) {
    const hits: Hit[] = [];
    for (const p of cfg.problems) {
      if (p.afterMultiline) continue;
      hits.push({
        title: `Line ${p.line} cannot be parsed`,
        detail: `Line ${p.line} is not a [section], an "option: value" pair or an indented continuation, so Klipper's config reader rejects the file.`,
        fix: `Fix or comment out line ${p.line}.`,
        evidence: [{ line: p.line, text: p.text }],
      });
    }
    return hits;
  },
};

export const includesNotRead: ConfigRule = {
  id: 'includes-not-read',
  scope: 'raw',
  severity: 'note',
  title: 'Included files were not read',
  detail:
    'This file has [include] lines. klipper-doctor only reads the one file you give it, so options in included files are not checked and rules that need the whole config are skipped.',
  fix: 'Run klipper-doctor on klippy.log instead: it holds the config with includes already merged.',
  docs: KLIPPER_SRC + 'klippy/configfile.py',
  check({ cfg, lineText }) {
    if (cfg.includes.length === 0) return [];
    return [
      {
        evidence: cfg.includes.map((i) => ({ line: i.line, text: lineText(i.line) })),
      },
    ];
  },
};
