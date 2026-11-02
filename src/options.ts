// The command line, described once: --help and the shell completions are both generated from this,
// so a new option cannot be in one and missing from the other.

export const FORMATS = ['text', 'json', 'md', 'github'] as const;
export const SHELLS = ['bash', 'zsh', 'fish'] as const;
export const DEFAULT_KEY_VAR = 'MOONRAKER_API_KEY';

export interface CliOption {
  /** Long name first, then any short alias. */
  flags: string[];
  /** What the option takes, for --help. Unset for a plain switch. */
  value?: string;
  /** What the shells offer after the option. */
  offers?: readonly string[] | 'rules';
  description: string;
}

export const OPTIONS: CliOption[] = [
  { flags: ['--format'], value: 'text|json|md|github', offers: FORMATS, description: 'output format. github prints workflow commands that annotate the file' },
  { flags: ['--json'], description: 'same as --format json' },
  { flags: ['--md'], description: 'same as --format md: a paste-ready markdown summary' },
  { flags: ['--config-only'], description: 'skip the crash report' },
  { flags: ['--ignore'], value: 'rule-id,...', offers: 'rules', description: 'hide these config rules. Crash findings are never hidden' },
  { flags: ['--api-key'], value: '[=VAR]', description: 'send the Moonraker API key from $MOONRAKER_API_KEY, or from the variable VAR' },
  { flags: ['--timeout'], value: 'seconds', description: 'give up on a Moonraker URL after this long (default 30)' },
  { flags: ['--color'], description: 'force colour even when piped' },
  { flags: ['--no-color'], description: 'no colour in the text output' },
  { flags: ['--help', '-h'], description: 'show this help' },
  { flags: ['--version', '-v'], description: 'show the version' },
];

export const USAGE = `Usage:
  klipper-doctor [options] <file>...          a klippy.log or a printer.cfg
  klipper-doctor [options] -                  read from stdin
  klipper-doctor [options] <http://host:7125> fetch klippy.log from Moonraker
  klipper-doctor [options]                    use ~/printer_data/logs/klippy.log
  klipper-doctor completions <bash|zsh|fish>  print a shell completion script`;

export function helpText(version: string): string {
  const label = (o: CliOption) => {
    const flags = o.flags.length > 1 ? `${o.flags[1]}, ${o.flags[0]}` : `    ${o.flags[0]}`;
    return o.value ? `${flags}${o.value.startsWith('[') ? '' : ' '}${o.value}` : flags;
  };
  const width = Math.max(...OPTIONS.map((o) => label(o).length));
  const rows = OPTIONS.map((o) => `  ${label(o).padEnd(width)}  ${o.description}`);
  return `klipper-doctor ${version}
Explain why a Klipper print died and lint the printer config.

${USAGE}

Options:
${rows.join('\n')}

Silence one config finding in a printer.cfg with a comment on its line, or above it:
  max_velocity: 300  # klipper-doctor: ignore duplicate-option

Exit codes: 0 no errors, 1 at least one error finding, 2 usage or read error.
Runs on your machine. Nothing is uploaded; a Moonraker URL is fetched from that host only.`;
}
