import type { Evidence, McuInfo } from './types.js';

// Markers and line formats below were checked against the Klipper source:
//   klippy/klippy.py       "Starting Klippy...", "Args: ", "Git version: ", "Start printer at ",
//                          "Transition to shutdown state: "
//   klippy/configfile.py   log_config(): "===== Config file =====" ... "======================="
//   klippy/mcu.py          "Loaded MCU '%s' %d commands (%s / %s)"
//   klippy/extras/statistics.py  "Stats %.1f: ..."
//   klippy/queuelogger.py  doRollover() repeats the version and config blocks at the top of a new file

const CONFIG_START = '===== Config file =====';
const START_PRINTER = 'Start printer at ';
const STARTING_KLIPPY = 'Starting Klippy...';
const SHUTDOWN = 'Transition to shutdown state: ';

export interface StatsPoint {
  line: number;
  /** Klipper's reactor clock at that line, in seconds. */
  time: number;
}

export interface LogSession {
  /** 1-based. */
  index: number;
  startLine: number;
  endLine: number;
  startedAt?: string;
  /** Reactor clock at "Start printer at", in seconds. */
  monotonicStart?: number;
  klipperVersion?: string;
  mcus: McuInfo[];
  config?: { startLine: number; lines: string[] };
  statsCount: number;
  firstStats?: StatsPoint;
  lastStats?: StatsPoint;
  /** Every line of the session except Stats lines and the config dump. */
  notable: Evidence[];
  shutdowns: Evidence[];
}

export interface ParsedLog {
  lines: string[];
  sessions: LogSession[];
  /** Number of Klipper starts found (at least 1 when there is any text). */
  startCount: number;
}

export function splitLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (text.includes('\r')) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i] as string;
      if (l.charCodeAt(l.length - 1) === 13) lines[i] = l.slice(0, -1);
    }
  }
  return lines;
}

export function looksLikeLog(lines: string[]): boolean {
  const n = Math.min(lines.length, 400);
  for (let i = 0; i < n; i++) {
    const l = lines[i] as string;
    if (
      l.startsWith(STARTING_KLIPPY) ||
      l.startsWith(START_PRINTER) ||
      l === CONFIG_START ||
      l.startsWith('Git version: ') ||
      l.startsWith('Stats ') ||
      l.startsWith(SHUTDOWN) ||
      l.startsWith('=============== Log rollover')
    ) {
      return true;
    }
  }
  // Log lines can also begin well past the first 400 lines of a pasted tail.
  for (let i = n; i < lines.length; i++) {
    const l = lines[i] as string;
    if (l.startsWith('Stats ') || l.startsWith(SHUTDOWN)) return true;
  }
  return false;
}

function newSession(index: number, startLine: number): LogSession {
  return {
    index,
    startLine,
    endLine: startLine,
    mcus: [],
    statsCount: 0,
    notable: [],
    shutdowns: [],
  };
}

function parseStatsTime(line: string): number | undefined {
  // "Stats 5003.2: gcodein=0 ..."
  const colon = line.indexOf(':', 6);
  if (colon < 0) return undefined;
  const t = Number(line.slice(6, colon));
  return Number.isFinite(t) ? t : undefined;
}

export function parseLog(lines: string[]): ParsedLog {
  const sessions: LogSession[] = [];
  let cur = newSession(1, 1);
  let curHasStart = false;
  let starts = 0;
  let inConfig = false;

  // A segment that already holds runtime activity belongs to an earlier Klipper start. A bare
  // preamble or version block (no Start line, Stats or shutdown yet) stays attached to its own start.
  // This matters for a log rotated at midnight, which opens with the rollover block instead of
  // "Start printer at" (klippy/queuelogger.py doRollover).
  const hasRuntime = () => curHasStart || cur.statsCount > 0 || cur.shutdowns.length > 0;

  const close = (endLine: number) => {
    cur.endLine = endLine;
    sessions.push(cur);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const no = i + 1;

    if (inConfig) {
      // The dump ends at a line made only of "=" characters. Config text never has one.
      if (line.length >= 3 && /^=+$/.test(line)) {
        inConfig = false;
      } else if (cur.config) {
        cur.config.lines.push(line);
      }
      continue;
    }

    if (line.startsWith('Stats ')) {
      const t = parseStatsTime(line);
      cur.statsCount++;
      if (t !== undefined) {
        const p = { line: no, time: t };
        if (!cur.firstStats) cur.firstStats = p;
        cur.lastStats = p;
      }
      continue;
    }

    if (line.startsWith(STARTING_KLIPPY)) {
      if (hasRuntime()) {
        close(no - 1);
        cur = newSession(sessions.length + 1, no);
        curHasStart = false;
      }
      cur.notable.push({ line: no, text: line });
      continue;
    }

    if (line.startsWith(START_PRINTER)) {
      if (hasRuntime()) {
        close(no - 1);
        cur = newSession(sessions.length + 1, no);
      }
      curHasStart = true;
      starts++;
      const m = /^Start printer at (.+) \((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)\)\s*$/.exec(line);
      if (m) {
        cur.startedAt = m[1];
        cur.monotonicStart = Number(m[3]);
      }
      cur.notable.push({ line: no, text: line });
      continue;
    }

    if (line === CONFIG_START) {
      cur.config = { startLine: no + 1, lines: [] };
      inConfig = true;
      continue;
    }

    // Klipper logs nothing that starts with "#" except lines of dumped build files; skip them.
    if (line.charCodeAt(0) === 35) continue;

    if (line.startsWith('Git version: ')) {
      const m = /^Git version: '([^']*)'/.exec(line);
      if (m) cur.klipperVersion = m[1];
    } else if (line.startsWith('Loaded MCU ')) {
      const m = /^Loaded MCU '([^']+)' \d+ commands \((\S+) \/ /.exec(line);
      if (m) cur.mcus.push({ name: m[1] as string, version: m[2] });
    } else if (line.startsWith(SHUTDOWN)) {
      cur.shutdowns.push({ line: no, text: line });
    }
    cur.notable.push({ line: no, text: line });
  }

  close(lines.length);

  // A Klipper RESTART keeps the process, so the version block is only logged once.
  let version: string | undefined;
  for (const s of sessions) {
    if (s.klipperVersion) version = s.klipperVersion;
    else if (version) s.klipperVersion = version;
  }

  return { lines, sessions, startCount: Math.max(starts, 1) };
}

/** Whole seconds the session ran, from the Stats lines, or undefined. */
export function sessionUptime(s: LogSession): number | undefined {
  if (!s.lastStats) return undefined;
  const from = s.monotonicStart ?? s.firstStats?.time;
  if (from === undefined) return undefined;
  const sec = s.lastStats.time - from;
  return sec >= 0 ? Math.round(sec) : undefined;
}
