// Renders the README and social images from the engine's real output.
// Usage: node scripts/render-assets.mjs   (build first: npm run build)
// Writes assets/demo.png, assets/demo-hero.png and assets/social-preview.png.
// Needs a headless Chromium. Set CHROME_BIN, or have chromium, google-chrome or a
// Playwright chrome-headless-shell on the machine. Fonts: JetBrains Mono, with
// system monospace fallbacks.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, toText, VERSION } from '../dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(root, 'test/fixtures/demo.log');

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const pw = join(homedir(), '.cache/ms-playwright');
  if (existsSync(pw)) {
    for (const d of readdirSync(pw).sort().reverse()) {
      if (!d.startsWith('chromium_headless_shell')) continue;
      const base = join(pw, d);
      for (const sub of readdirSync(base)) {
        const bin = join(base, sub, 'chrome-headless-shell');
        if (existsSync(bin)) return bin;
      }
    }
  }
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    for (const dir of (process.env.PATH ?? '').split(':')) if (existsSync(join(dir, name))) return join(dir, name);
  }
  throw new Error('no headless Chromium found. Set CHROME_BIN.');
}

const C = { bg: '#0d1117', bar: '#161b22', line: '#21262d', fg: '#e6edf3', dim: '#8b949e', red: '#ff7b72', green: '#7ee787', yellow: '#e3b341', blue: '#79c0ff', amber: '#f0a040' };
const COLORS = { 31: C.red, 32: C.green, 33: C.yellow, 36: C.blue };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Real report text, as the CLI would print it with --color, for a given wrap width.
const report = analyze(readFileSync(FIXTURE, 'utf8'), { filename: 'klippy.log' });
const plain = (width) => toText(report, { color: false, width }).split('\n');
const colored = (width) => toText(report, { color: true, width }).split('\n');

// ANSI line -> HTML spans.
function ansiToHtml(line) {
  let cls = '';
  let out = '';
  for (const part of line.split(/(\u001b\[\d+m)/)) {
    const m = /^\u001b\[(\d+)m$/.exec(part);
    if (m) {
      const c = Number(m[1]);
      if (c === 0) cls = '';
      else if (c === 1) cls = 'b';
      else if (c === 2) cls = 'dim';
      else if (COLORS[c]) cls = `c${c}`;
    } else if (part) out += cls ? `<span class="${cls}">${esc(part)}</span>` : esc(part);
  }
  return out;
}

function wrap(text, width) {
  const out = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    if (cur && cur.length + 1 + word.length > width) { out.push(cur); cur = word; }
    else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) out.push(cur);
  return out;
}

// Header line without the trailing segments that would run past the card.
const fitHeader = (l, cols) => {
  const p = plainOf(l);
  if (p.length <= cols || !p.startsWith('klipper-doctor')) return l;
  const keep = p.split(' | ');
  while (keep.length > 1 && keep.join(' | ').length > cols) keep.pop();
  return `${'\u001b[1m'}klipper-doctor ${VERSION}${'\u001b[0m'}${'\u001b[2m'}${keep.join(' | ').slice(`klipper-doctor ${VERSION}`.length)}${'\u001b[0m'}`;
};

// The crash finding laid out narrow, for the shareable crop and the social card.
function crashLines(cols) {
  const f = report.crash[0];
  const sev = { error: '\u001b[31m', warning: '\u001b[33m', note: '\u001b[36m' }[f.severity];
  return [
    `${sev}${f.severity}\u001b[0m  \u001b[2m[${f.id}]\u001b[0m`,
    ...wrap(f.title, cols).map((l) => `\u001b[1m${l}\u001b[0m`),
    '',
    ...wrap(f.detail, cols),
    '',
    ...wrap(`Fix: ${f.fix}`, cols).map((l, i) => (i === 0 ? l.replace('Fix:', '\u001b[32mFix:\u001b[0m') : l)),
  ];
}

// In the CONFIG block keep each finding's title and Fix lines and drop its explanation.
function compact(lines) {
  const out = [];
  let inConfig = false;
  let skipping = false;
  for (const l of lines) {
    const p = plainOf(l);
    if (p.startsWith('CONFIG')) inConfig = true;
    if (!inConfig || !p.startsWith('          ') && p.trim() !== '' && !/^\s{2}(note|warning|error)/.test(p)) { out.push(l); skipping = false; continue; }
    if (/^\s{2}(note|warning|error)/.test(p)) { out.push(l); skipping = true; continue; }
    if (p.trim() === '') { out.push(l); skipping = false; continue; }
    if (p.trim().startsWith('Fix:')) skipping = false;
    if (!skipping) out.push(l);
  }
  return out;
}

const KEEP_OUT = (l) => !/^\s+https?:\/\//.test(plainOf(l)) && !/^\s+line \d+:/.test(plainOf(l));
const plainOf = (l) => l.replace(/\u001b\[\d+m/g, '');

const FONT = `'JetBrains Mono', 'Fira Mono', 'DejaVu Sans Mono', ui-monospace, Menlo, Consolas, monospace`;
const baseCss = (size, lh) => `
*{box-sizing:border-box;margin:0}
html,body{background:transparent}
body{font-family:${FONT};font-size:${size}px;line-height:${lh}px;color:${C.fg};font-variant-ligatures:none}
.dim{color:${C.dim}}.b{font-weight:700}.c31{color:${C.red}}.c32{color:${C.green}}.c33{color:${C.yellow}}.c36{color:${C.blue}}
.prompt{color:${C.amber};font-weight:700}
pre{font:inherit;white-space:pre}
`;

// A terminal card: slim title bar, command line, then the report lines.
function terminalCard({ width, size, lh, title, command, lines, pad }) {
  const bar = Math.round(lh * 1.9);
  const height = bar + pad + lh * (1 + 1 + lines.length) + pad;
  const html = `<!doctype html><meta charset="utf-8"><style>${baseCss(size, lh)}
.card{width:${width}px;height:${height}px;background:${C.bg};border-radius:${Math.round(size * 0.8)}px;overflow:hidden;border:1px solid ${C.line}}
.bar{height:${bar}px;background:${C.bar};border-bottom:1px solid ${C.line};display:flex;align-items:center;padding:0 ${pad}px;gap:${Math.round(size * 0.5)}px}
.dot{width:${Math.round(size * 0.75)}px;height:${Math.round(size * 0.75)}px;border-radius:50%;background:#30363d}
.title{flex:1;text-align:center;color:${C.dim};font-size:${Math.round(size * 0.85)}px;margin-right:${Math.round(size * 3)}px}
.body{padding:${pad}px}
</style><div class="card"><div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><div class="title">${esc(title)}</div></div>
<div class="body"><pre><span class="prompt">$</span> ${esc(command)}\n\n${lines.map(ansiToHtml).join('\n')}</pre></div></div>`;
  return { html, w: width, h: height };
}

function socialCard() {
  const W = 1280, H = 640;
  const snippet = crashLines(46).slice(0, 14);
  const html = `<!doctype html><meta charset="utf-8"><style>${baseCss(20, 29)}
body{width:${W}px;height:${H}px;background:${C.bg};position:relative;overflow:hidden}
.glow{position:absolute;inset:0;background:radial-gradient(900px 500px at 8% 0%,rgba(240,160,64,.16),transparent 60%)}
.left{position:absolute;left:72px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center}
.name{font-size:66px;line-height:76px;font-weight:700;letter-spacing:-1.5px;white-space:nowrap}
.name i{font-style:normal;color:${C.amber}}
.tag{font-family:system-ui,'Inter','Helvetica Neue',Arial,sans-serif;font-size:40px;line-height:50px;margin-top:26px;color:#c9d1d9;letter-spacing:-.3px}
.cmd{margin-top:44px;align-self:flex-start;border:1px solid #30363d;background:#161b22;border-radius:12px;padding:16px 24px;font-size:27px;line-height:36px;white-space:nowrap}
.cmd span{color:${C.amber}}
.term{position:absolute;left:672px;top:92px;width:536px;height:456px;background:#161b22;border:1px solid ${C.line};border-radius:18px;padding:32px 28px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.term pre{font-size:18px;line-height:28px}
.fade{position:absolute;left:0;right:0;bottom:0;height:80px;background:linear-gradient(transparent,#161b22)}
</style><div class="glow"></div>
<div class="left"><div class="name">klipper<i>-</i>doctor</div>
<div class="tag">Why your Klipper print died, in plain English.</div>
<div class="cmd"><span>$</span> npx klipper-doctor klippy.log</div></div>
<div class="term"><pre>${snippet.map(ansiToHtml).join('\n')}</pre><div class="fade"></div></div>`;
  return { html, w: W, h: H };
}

const chrome = findChrome();
const tmp = mkdtempSync(join(tmpdir(), 'kd-assets-'));
mkdirSync(join(root, 'assets'), { recursive: true });
function shoot(name, { html, w, h }, scale) {
  const page = join(tmp, `${name}.html`);
  writeFileSync(page, html);
  const out = join(root, 'assets', `${name}.png`);
  execFileSync(chrome, ['--headless', '--no-sandbox', '--hide-scrollbars', '--default-background-color=00000000', `--force-device-scale-factor=${scale}`, `--window-size=${w},${h}`, `--screenshot=${out}`, `file://${page}`], { stdio: 'ignore' });
  console.log(`wrote assets/${name}.png (${w * scale}x${h * scale})`);
}

// README demo: the full report minus evidence and link lines, so it stays short.
shoot('demo', terminalCard({ width: 820, size: 14, lh: 21, pad: 28, title: 'klipper-doctor klippy.log', command: 'klipper-doctor klippy.log', lines: compact(colored(88).filter(KEEP_OUT)).map((l) => fitHeader(l, 88)) }), 2);
// Shareable crop: narrow, large type, one finding, so it reads at phone width.
{
  const lines = [...crashLines(50), '', `\u001b[2m+ ${report.config.length} notes on the config, from the same log\u001b[0m`];
  shoot('demo-hero', terminalCard({ width: 680, size: 20, lh: 30, pad: 32, title: 'klipper-doctor klippy.log', command: 'klipper-doctor klippy.log', lines }), 2);
}
shoot('social-preview', socialCard(), 1);
rmSync(tmp, { recursive: true, force: true });
console.log(`klipper-doctor ${VERSION}`);
