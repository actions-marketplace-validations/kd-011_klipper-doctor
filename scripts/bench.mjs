// Measures analyze() on generated input: time and peak memory, each size in its own process so one
// run's heap cannot inflate the next. The logs are synthetic, built from Klipper's message formats.
//
//   npm run bench                       build output in dist/, the sizes below
//   node scripts/bench.mjs --dist DIR   measure another build, to compare before and after
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MB = 1024 * 1024;
const SELF = fileURLToPath(import.meta.url);
const DEFAULT_DIST = join(dirname(SELF), '..', 'dist');

const STATS = 'Stats 5003.2: gcodein=0  mcu: mcu_awake=0.001 mcu_task_avg=0.000009 mcu_task_stddev=0.000012 bytes_write=1400 bytes_read=1800 bytes_retransmit=0 bytes_invalid=0 send_seq=100 receive_seq=100 retransmit_seq=0 srtt=0.001 rttvar=0.000 rto=0.025 ready_bytes=0 upcoming_bytes=0 freq=72000123 heater_bed: target=60 temp=59.8 pwm=0.250 sysload=0.22 cputime=2.5 memavail=800000\n';
const SEND = "Sent 5003.2 5003.2 12: seq: 1c, queue_step oid=2 interval=4000 count=10 add=0\n";
const CONFIG = "===== Config file =====\n[printer]\nkinematics = cartesian\nmax_velocity = 300\nmax_accel = 3000\n[gcode_macro A]\ngcode =\n\tG28\n\tG1 X10\n=======================\n";
const START = 'Start printer at Sun Nov  1 10:00:00 2026 (1793527200.0 5000.0)\n';
const CRASH = "Transition to shutdown state: MCU shutdown\nDumping gcode input 0 blocks\nMCU 'mcu' shutdown: Timer too close\nThis often indicates the host computer is overloaded.\n";

/** One long session: every line is scanned by every crash rule, which is the worst case for them. */
export function makeLog(bytes) {
  const block = STATS.repeat(3) + SEND;
  return START + CONFIG + block.repeat(Math.ceil(bytes / block.length)) + CRASH;
}

/** A Klipper start every 64 kB, the shape of a log from a printer that keeps being restarted. */
export function makeRestarts(bytes) {
  const block = START + CONFIG + (STATS.repeat(3) + SEND).repeat(40);
  return block.repeat(Math.ceil(bytes / block.length)) + CRASH;
}

/** A log whose useful part is followed by one enormous line, which is what a corrupted file looks like. */
export function makeLongLine(bytes) {
  return START + CONFIG + 'x'.repeat(bytes) + '\n' + CRASH;
}

/** A printer.cfg with a very long run of spaces on one line: the worst case for option splitting. */
export function makeSpaces(bytes) {
  return '[printer]\nkinematics: none\nmax_velocity: 1\nmax_accel: 1\nx' + ' '.repeat(bytes) + 'y\n[input_shaper]\n';
}

const SCENARIOS = {
  log: makeLog,
  restarts: makeRestarts,
  'long-line': makeLongLine,
  'config-spaces': makeSpaces,
};

async function child(dist, scenario, bytes) {
  const { analyze } = await import(pathToFileURL(join(resolve(dist), 'index.js')).href);
  const text = SCENARIOS[scenario](bytes);
  const t0 = performance.now();
  const report = analyze(text, { filename: scenario === 'config-spaces' ? 'printer.cfg' : 'klippy.log' });
  const ms = performance.now() - t0;
  process.stdout.write(JSON.stringify({
    inputMB: +(text.length / MB).toFixed(1),
    ms: Math.round(ms),
    peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
    findings: report.crash.length + report.config.length,
  }));
}

function run(dist, scenario, bytes, timeoutMs) {
  const r = spawnSync(process.execPath, ['--max-old-space-size=8192', SELF, '--child', dist, scenario, String(bytes)], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  if (r.error || r.status !== 0) return { failed: r.error ? `over ${timeoutMs / 1000} s` : r.stderr.trim().split('\n').pop() };
  return JSON.parse(r.stdout);
}

const argv = process.argv.slice(2);
if (argv[0] === '--child') {
  await child(argv[1], argv[2], Number(argv[3]));
} else if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const distAt = argv.indexOf('--dist');
  const dist = distAt >= 0 ? argv[distAt + 1] : DEFAULT_DIST;
  const cases = [
    ['log', 5 * MB],
    ['log', 50 * MB],
    ['restarts', 5 * MB],
    ['restarts', 50 * MB],
    ['long-line', 5 * MB],
    ['long-line', 50 * MB],
    ['config-spaces', MB / 8],
    ['config-spaces', MB / 2],
  ];
  console.log('scenario        input MB      ms  peak RSS MB');
  for (const [scenario, bytes] of cases) {
    const r = run(dist, scenario, bytes, 120000);
    if (r.failed) console.log(`${scenario.padEnd(14)}  ${(bytes / MB).toFixed(1).padStart(8)}  ${r.failed}`);
    else console.log(`${scenario.padEnd(14)}  ${String(r.inputMB).padStart(8)}  ${String(r.ms).padStart(6)}  ${String(r.peakRssMB).padStart(11)}`);
  }
}
