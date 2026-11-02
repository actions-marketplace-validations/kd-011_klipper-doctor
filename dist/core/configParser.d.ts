export declare const AUTOSAVE_MARKER = "#*# <---------------------- SAVE_CONFIG ---------------------->";
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
/**
 * @param lines  text lines as they appear in the file
 * @param firstLine  1-based line number of lines[0] in the analysed text
 * @param raw  true for a hand-written printer.cfg, false for the config Klipper dumped into klippy.log
 */
export declare function parseConfig(lines: string[], firstLine: number, raw: boolean): ParsedConfig;
