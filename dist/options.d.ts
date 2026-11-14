export declare const FORMATS: readonly ['text', 'json', 'md', 'github'];
export declare const SHELLS: readonly ['bash', 'zsh', 'fish'];
export declare const DEFAULT_KEY_VAR = "MOONRAKER_API_KEY";
export interface CliOption {
    /** Long name first, then any short alias. */
    flags: string[];
    /** What the option takes, for --help. Unset for a plain switch. */
    value?: string;
    /** What the shells offer after the option. */
    offers?: readonly string[] | 'rules';
    description: string;
}
export declare const OPTIONS: CliOption[];
export declare const USAGE = "Usage:\n  klipper-doctor [options] <file>...          a klippy.log or a printer.cfg\n  klipper-doctor [options] -                  read from stdin\n  klipper-doctor [options] <http://host:7125> fetch klippy.log from Moonraker\n  klipper-doctor [options]                    use ~/printer_data/logs/klippy.log\n  klipper-doctor completions <bash|zsh|fish>  print a shell completion script";
export declare function helpText(version: string): string;
