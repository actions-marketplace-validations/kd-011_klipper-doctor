import type { AnalyzeOptions, Report, RuleMeta } from './types.js';
export type { AnalyzeOptions, Evidence, Finding, McuInfo, Report, ReportMeta, Severity } from './types.js';
export { toMarkdown, toText, toGithub, verdict, countBySeverity } from './report.js';
export { VERSION } from './version.js';
/** Never throws: a file that breaks the engine gets a finding saying so, and asks for a report. */
export declare function analyze(text: string, opts?: AnalyzeOptions): Report;
export interface RuleInfo extends RuleMeta {
    kind: 'config' | 'crash';
    /** True for a config rule that `ignore` and `# klipper-doctor: ignore` can hide. */
    suppressible: boolean;
}
/** Every rule klipper-doctor can fire, for the README table and for docs. */
export declare function rulesMetadata(): RuleInfo[];
