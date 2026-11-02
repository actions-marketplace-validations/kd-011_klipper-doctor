#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { analyze, toMarkdown, toText, VERSION } from './core/index.js';
import type { Report } from './core/index.js';

const HELP = `klipper-doctor ${VERSION}
Explain why a Klipper print died and lint the printer config.

Usage:
  klipper-doctor [options] <file>
  klipper-doctor [options] -        read from stdin

<file> is a klippy.log or a printer.cfg.

Options:
  --json         print the report as JSON
  --md           print a paste-ready markdown summary
  --config-only  skip the crash report
  --color        force colour even when piped
  --no-color     no colour in the text output
  -h, --help     show this help
  -v, --version  show the version

Exit codes: 0 no errors, 1 at least one error finding, 2 usage or read error.
Runs on your machine. Nothing is uploaded.`;

function fail(message: string): never {
  process.stderr.write(`klipper-doctor: ${message}\n`);
  process.exit(2);
}

function main(argv: string[]): number {
  let json = false;
  let md = false;
  let configOnly = false;
  let color = !!process.stdout.isTTY && !process.env['NO_COLOR'];
  let file: string | undefined;

  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(HELP + '\n');
      return 0;
    }
    if (arg === '-v' || arg === '--version') {
      process.stdout.write(VERSION + '\n');
      return 0;
    }
    if (arg === '--json') json = true;
    else if (arg === '--md') md = true;
    else if (arg === '--config-only') configOnly = true;
    else if (arg === '--color') color = true;
    else if (arg === '--no-color') color = false;
    else if (arg === '-') file = '-';
    else if (arg.startsWith('-')) fail(`unknown option ${arg}. Try --help.`);
    else if (file !== undefined) fail(`only one file at a time, got ${file} and ${arg}`);
    else file = arg;
  }
  if (json && md) fail('--json and --md cannot be combined');
  if (file === undefined) fail('no file given. Usage: klipper-doctor <klippy.log|printer.cfg|->');

  let text: string;
  try {
    text = readFileSync(file === '-' ? 0 : file, 'utf8');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Common under WSL and over ssh: a path copied from Windows Explorer.
    const windows = process.platform !== 'win32' && /^(?:[A-Za-z]:[\\/]|\\\\)/.test(file);
    fail(windows ? `${message}\nThat looks like a Windows path. Under WSL the C: drive is /mnt/c, and a host reached over ssh has its own paths.` : message);
  }

  const report: Report = analyze(text, { filename: file === '-' ? undefined : file });
  if (configOnly) report.crash = [];

  if (json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else if (md) process.stdout.write(toMarkdown(report) + '\n');
  else process.stdout.write(toText(report, { color }) + '\n');

  return [...report.crash, ...report.config].some((f) => f.severity === 'error') ? 1 : 0;
}

// "klipper-doctor x | head" closes the pipe early, which is not an error worth reporting.
process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code !== 'EPIPE') throw e;
  process.exit(process.exitCode ?? 0);
});

process.exitCode = main(process.argv.slice(2));
