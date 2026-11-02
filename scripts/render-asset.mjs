// Renders real CLI output to assets/demo.svg (vhs is not required).
// Usage: node scripts/render-asset.mjs <fixture> <out.svg>   (build first: npm run build)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [fixture = 'test/fixtures/config-error-invalid-option.log', out = 'assets/demo.svg'] = process.argv.slice(2);

const r = spawnSync(process.execPath, [join(root, 'dist/cli.js'), '--color', fixture], { cwd: root, encoding: 'utf8' });
const lines = r.stdout.replace(/\n$/, '').split('\n');

const COLORS = { 31: '#ff7b72', 32: '#7ee787', 33: '#e3b341', 36: '#79c0ff' };
const FG = '#c9d1d9';
const DIM = '#8b949e';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CHAR_W = 8.4;
const LINE_H = 20;
const PAD = 20;
let maxLen = 0;
const rendered = lines.map((line) => {
  let fill = FG;
  let bold = false;
  const spans = [];
  let plain = 0;
  for (const part of line.split(/(\u001b\[\d+m)/)) {
    const m = /^\u001b\[(\d+)m$/.exec(part);
    if (m) {
      const c = Number(m[1]);
      if (c === 0) { fill = FG; bold = false; }
      else if (c === 1) bold = true;
      else if (c === 2) fill = DIM;
      else if (COLORS[c]) fill = COLORS[c];
    } else if (part) {
      spans.push(`<tspan fill="${fill}"${bold ? ' font-weight="700"' : ''}>${esc(part)}</tspan>`);
      plain += part.length;
    }
  }
  maxLen = Math.max(maxLen, plain);
  return spans.join('');
});

const width = Math.ceil(maxLen * CHAR_W + PAD * 2 + 12);
const height = lines.length * LINE_H + PAD * 2;
const body = rendered
  .map((s, i) => `<text x="${PAD}" y="${PAD + 14 + i * LINE_H}" xml:space="preserve">${s}</text>`)
  .join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="klipper-doctor output for a klippy.log">
<rect width="100%" height="100%" rx="10" fill="#0d1117"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14" fill="${FG}">
${body}
</g>
</svg>
`;
writeFileSync(join(root, out), svg);
console.log(`wrote ${out} (${width}x${height}) from ${fixture}`);
