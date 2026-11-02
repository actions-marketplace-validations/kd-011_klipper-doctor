// Runs from the npm "version" lifecycle: writes the new package.json version into
// src/core/version.ts so the VERSION export (and the test that compares it) stay in step.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const file = join(root, 'src/core/version.ts');
const next = readFileSync(file, 'utf8').replace(/VERSION = '[^']*'/, `VERSION = '${version}'`);
writeFileSync(file, next);
console.log(`src/core/version.ts -> ${version}`);
