#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { analyze, rulesMetadata, toGithub, toMarkdown, toText, VERSION } from './core/index.js';
import { completionScript } from './completions.js';
import { DEFAULT_KEY_VAR, FORMATS, SHELLS, USAGE, helpText } from './options.js';
const DEFAULT_TIMEOUT_SECONDS = 30;
// Moonraker's docs call this route a fallback: until Klippy connects it points at /tmp/klippy.log, so it can
// answer 404 when Klipper is down, which is when the log matters. The logs root has the file either way.
const MOONRAKER_LOG_PATH = '/server/files/klippy.log';
const MOONRAKER_LOGS_ROOT_PATH = '/server/files/logs/klippy.log';
const SAMPLE_LOG = 'https://raw.githubusercontent.com/kd-011/klipper-doctor/main/test/fixtures/demo.log';
const isUrl = (s) => /^https?:\/\//i.test(s);
function fail(message) {
    process.stderr.write(`klipper-doctor: ${message}\n`);
    process.exit(2);
}
function parseArgs(argv) {
    const o = {
        configOnly: false,
        color: !!process.stdout.isTTY && !process.env['NO_COLOR'],
        ignore: [],
        timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
        inputs: [],
    };
    const setFormat = (f) => {
        if (o.format !== undefined && o.format !== f)
            fail(`--${o.format} and --${f} cannot be combined; pick one output format`);
        o.format = f;
    };
    let optionsEnded = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        // "--flag=value", or "--flag value" for the options that take one.
        const eq = !optionsEnded && arg.startsWith('--') ? arg.indexOf('=') : -1;
        const flag = eq > 0 ? arg.slice(0, eq) : arg;
        const inline = eq > 0 ? arg.slice(eq + 1) : undefined;
        const value = () => {
            if (inline !== undefined)
                return inline;
            const next = argv[++i];
            if (next === undefined)
                fail(`${flag} needs a value. Try --help.`);
            return next;
        };
        if (optionsEnded || arg === '-' || !arg.startsWith('-')) {
            o.inputs.push(arg);
        }
        else if (arg === '--') {
            optionsEnded = true;
        }
        else if (flag === '-h' || flag === '--help') {
            process.stdout.write(helpText(VERSION) + '\n');
            return 0;
        }
        else if (flag === '-v' || flag === '--version') {
            process.stdout.write(VERSION + '\n');
            return 0;
        }
        else if (flag === '--json')
            setFormat('json');
        else if (flag === '--md')
            setFormat('md');
        else if (flag === '--format') {
            const f = value();
            if (!FORMATS.includes(f))
                fail(`unknown format ${f}. Use one of: ${FORMATS.join(', ')}.`);
            setFormat(f);
        }
        else if (flag === '--config-only')
            o.configOnly = true;
        else if (flag === '--color')
            o.color = true;
        else if (flag === '--no-color')
            o.color = false;
        else if (flag === '--ignore') {
            for (const id of value().split(','))
                if (id.trim())
                    o.ignore.push(id.trim());
        }
        else if (flag === '--api-key')
            o.keyVar = inline === undefined ? DEFAULT_KEY_VAR : inline;
        else if (flag === '--timeout') {
            const seconds = Number(value());
            if (!(seconds > 0))
                fail('--timeout takes a number of seconds, such as 10');
            o.timeoutSeconds = seconds;
        }
        else
            fail(`unknown option ${arg}. Try --help.`);
    }
    return o;
}
/** --ignore only hides config rules the engine allows to be hidden. A typo must not silently hide nothing. */
function checkIgnore(ids) {
    const rules = new Map(rulesMetadata().map((r) => [r.id, r]));
    for (const id of ids) {
        const rule = rules.get(id);
        if (!rule)
            fail(`--ignore: unknown rule id ${id}. Config rule ids are listed in the README.`);
        if (!rule.suppressible)
            fail(`--ignore: ${id} cannot be ignored. Crash findings, and unusable-input, are never hidden.`);
    }
}
function readApiKey(varName) {
    const key = process.env[varName];
    if (key)
        return key;
    // A person who types the key itself after --api-key= must not see it printed back.
    if (!/^[A-Z][A-Z0-9_]*$/.test(varName)) {
        fail('--api-key=NAME takes the name of an environment variable, not the key itself. Put the key in a variable, such as MOONRAKER_API_KEY.');
    }
    fail(`--api-key needs the environment variable ${varName} to hold the Moonraker API key, and it is not set.`);
}
const CAUSES = {
    ECONNREFUSED: 'connection refused: is Moonraker running, and is that the right port? Moonraker listens on 7125 unless it was changed',
    ENOTFOUND: 'the host name was not found',
    EAI_AGAIN: 'the host name could not be looked up',
    EHOSTUNREACH: 'no route to the host',
    ENETUNREACH: 'no route to the network',
    ETIMEDOUT: 'the connection timed out',
    ECONNRESET: 'the connection was reset',
    CERT_HAS_EXPIRED: 'the TLS certificate has expired',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'the TLS certificate is self-signed',
    SELF_SIGNED_CERT_IN_CHAIN: 'the TLS certificate is self-signed',
};
function describeNetworkError(e, seconds) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        return `it did not answer within ${seconds} seconds (change this with --timeout)`;
    }
    const cause = e instanceof Error ? e.cause : undefined;
    const code = cause?.code;
    return (code && CAUSES[code]) || cause?.message || (e instanceof Error ? e.message : String(e));
}
/** Moonraker's file API (docs: external_api/file_manager, "Download klippy.log"). */
async function fetchKlippyLog(arg, apiKey, seconds) {
    let url;
    try {
        url = new URL(arg);
    }
    catch {
        fail('that is not a valid URL. Use something like http://voron.local:7125');
    }
    if (url.username || url.password) {
        fail('a user name or password in the URL is not used. Put the Moonraker API key in MOONRAKER_API_KEY and run with --api-key.');
    }
    const prefix = url.pathname.replace(/\/+$/, '');
    const shown = url.origin + prefix;
    const target = url.origin + prefix + MOONRAKER_LOG_PATH;
    const headers = apiKey ? { 'X-Api-Key': apiKey } : {};
    let status = 0;
    let statusText = '';
    let location = null;
    let body = '';
    for (const path of [MOONRAKER_LOG_PATH, MOONRAKER_LOGS_ROOT_PATH]) {
        try {
            // A redirect is not followed: a custom header such as X-Api-Key would go to wherever it points.
            const res = await fetch(url.origin + prefix + path, { headers, redirect: 'manual', signal: AbortSignal.timeout(seconds * 1000) });
            status = res.type === 'opaqueredirect' ? 302 : res.status;
            statusText = res.statusText;
            location = res.headers.get('location');
            if (res.ok)
                body = await res.text();
        }
        catch (e) {
            fail(`could not reach ${shown}: ${describeNetworkError(e, seconds)}.`);
        }
        if (status !== 404)
            break;
    }
    if (status >= 200 && status < 300)
        return body;
    if (status >= 300 && status < 400) {
        let to = '';
        try {
            const next = new URL(location ?? '', target);
            to = ` to ${next.origin}${next.pathname.replace(/[^\x20-\x7e]/g, '')}`;
        }
        catch {
            // No usable Location header.
        }
        fail(`${shown} redirected the request${to}. klipper-doctor does not follow redirects, so the API key never goes to another address. Use the address it redirects to.`);
    }
    if (status === 401 || status === 403) {
        if (apiKey)
            fail(`${shown} rejected the API key (HTTP ${status}). Check that the key in your environment variable is the current one for this printer.`);
        fail(`${shown} needs authentication (HTTP ${status}). Give it an API key: put the key in ${DEFAULT_KEY_VAR} and run with --api-key. ` +
            'Or add this computer to trusted_clients in the [authorization] section of moonraker.conf.');
    }
    if (status === 404) {
        fail(`${shown} answered 404 for ${MOONRAKER_LOG_PATH} and ${MOONRAKER_LOGS_ROOT_PATH}, so it has no klippy.log to give. Check that the address is Moonraker itself (port 7125 unless changed), not a web page in front of it that does not pass /server through.`);
    }
    fail(`${shown} answered HTTP ${status}${statusText ? ' ' + statusText : ''} for ${MOONRAKER_LOG_PATH}.`);
}
/** The first thing most people type, on a machine that does not have the log yet. */
const WHERE_THE_LOG_IS = 'klippy.log is on the printer host, in ~/printer_data/logs. Download it from Mainsail or Fluidd, which list it under their log files, or let klipper-doctor fetch it through Moonraker: klipper-doctor http://your-printer:7125';
function readFile(file) {
    try {
        return { file, label: file, text: readFileSync(file === '-' ? 0 : file, 'utf8'), filename: file };
    }
    catch (e) {
        const code = e.code;
        const message = e instanceof Error ? e.message : String(e);
        if (code === 'EISDIR')
            fail(`${file} is a directory. Give it a klippy.log or a printer.cfg.`);
        // Common under WSL and over ssh: a path copied from Windows Explorer.
        const windows = process.platform !== 'win32' && /^(?:[A-Za-z]:[\\/]|\\\\)/.test(file);
        // "voron.local:7125" is read as a file name.
        const host = /^[A-Za-z0-9.-]+:\d{2,5}$/.test(file);
        const missing = code === 'ENOENT' ? `no such file: ${file}` : message;
        fail(windows
            ? `${missing}\nThat looks like a Windows path. Under WSL the C: drive is /mnt/c, and a host reached over ssh has its own paths.`
            : host
                ? `${missing}\nIf that is a Moonraker address, give the whole URL: http://${file}`
                : code === 'ENOENT' && /klippy[^/\\]*$/i.test(file)
                    ? `${missing}\n${WHERE_THE_LOG_IS}`
                    : missing);
    }
}
async function load(inputs, keyVar, seconds) {
    const apiKey = keyVar !== undefined ? readApiKey(keyVar) : undefined;
    const sources = [];
    for (const input of inputs) {
        if (isUrl(input)) {
            sources.push({ label: input, text: await fetchKlippyLog(input, apiKey, seconds), filename: 'klippy.log' });
        }
        else if (input === '-') {
            sources.push({ label: '<stdin>', text: readFileSync(0, 'utf8') });
        }
        else {
            sources.push(readFile(input));
        }
    }
    return sources;
}
function usageFail(message) {
    process.stderr.write(`klipper-doctor: ${message}\n\n${USAGE}\n`);
    process.exit(2);
}
async function main(argv) {
    if (argv[0] === 'completions') {
        const shell = argv[1];
        if (!SHELLS.includes(shell ?? ''))
            fail(`completions needs a shell: ${SHELLS.join(', ')}.`);
        process.stdout.write(completionScript(shell));
        return 0;
    }
    const parsed = parseArgs(argv);
    if (typeof parsed === 'number')
        return parsed;
    const o = parsed;
    checkIgnore(o.ignore);
    if (o.keyVar !== undefined && !o.inputs.some(isUrl))
        fail('--api-key is for a Moonraker URL, and none was given.');
    if (o.inputs.filter((i) => i === '-').length > 1)
        fail('stdin (-) can be read once.');
    if (o.inputs.length === 0) {
        const fallback = join(homedir(), 'printer_data', 'logs', 'klippy.log');
        if (!existsSync(fallback)) {
            usageFail(`no file given, and ${fallback} does not exist.\n${WHERE_THE_LOG_IS}\nTo see what a report looks like: curl -s ${SAMPLE_LOG} | klipper-doctor -`);
        }
        process.stderr.write(`klipper-doctor: no file given, using ${fallback}\n`);
        o.inputs.push(fallback);
    }
    const sources = await load(o.inputs, o.keyVar, o.timeoutSeconds);
    const format = o.format ?? 'text';
    const results = sources.map((s) => {
        const report = analyze(s.text, { filename: s.filename, ignore: o.ignore });
        if (o.configOnly)
            report.crash = [];
        return { source: s, report };
    });
    const render = ({ source, report }) => format === 'json' ? JSON.stringify(report, null, 2)
        : format === 'md' ? toMarkdown(report)
            : format === 'github' ? toGithub(report, { file: source.file === '-' ? undefined : source.file })
                : toText(report, { color: o.color });
    let out;
    if (results.length === 1) {
        out = render(results[0]);
    }
    else if (format === 'json') {
        out = JSON.stringify(results.map((r) => ({ file: r.source.label, report: r.report })), null, 2);
    }
    else if (format === 'github') {
        out = results.map(render).filter(Boolean).join('\n');
    }
    else {
        out = results.map((r) => `==> ${r.source.label} <==\n${render(r)}`).join('\n\n');
    }
    if (out)
        process.stdout.write(out + '\n');
    return results.some((r) => [...r.report.crash, ...r.report.config].some((f) => f.severity === 'error')) ? 1 : 0;
}
// "klipper-doctor x | head" closes the pipe early, which is not an error worth reporting.
process.stdout.on('error', (e) => {
    if (e.code !== 'EPIPE')
        throw e;
    process.exit(process.exitCode ?? 0);
});
main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
}, (e) => fail(e instanceof Error ? e.message : String(e)));
