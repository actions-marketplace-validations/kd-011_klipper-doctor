export type Severity = 'error' | 'warning' | 'note';
export interface Evidence {
    /** 1-based line number in the text that was analysed. */
    line: number;
    text: string;
}
export interface Finding {
    /** Rule id. Several findings can share one id (one per option, driver, and so on). */
    id: string;
    severity: Severity;
    title: string;
    detail: string;
    /** One line saying what to change. */
    fix: string;
    docs?: string;
    evidence: Evidence[];
}
export interface McuInfo {
    name: string;
    version?: string;
}
export interface ReportMeta {
    inputKind: 'klippy.log' | 'printer.cfg';
    klipperVersion?: string;
    mcus: McuInfo[];
    /** Klipper starts found in the log (0 for a raw printer.cfg). */
    sessions: number;
    linesRead: number;
    /** 1-based number of the session that was analysed (0 for a raw printer.cfg). */
    analysedSession: number;
}
export interface Report {
    meta: ReportMeta;
    config: Finding[];
    crash: Finding[];
}
export interface AnalyzeOptions {
    filename?: string;
}
/** What a rule returns for one occurrence. Unset text falls back to the rule's own. */
export interface Hit {
    title?: string;
    detail?: string;
    fix?: string;
    severity?: Severity;
    evidence: Evidence[];
}
export interface RuleMeta {
    id: string;
    severity: Severity;
    /** Generic one-line description, used in the README rule table. */
    title: string;
    detail: string;
    fix: string;
    /** The Klipper docs page or source file the rule comes from. */
    docs: string;
}
