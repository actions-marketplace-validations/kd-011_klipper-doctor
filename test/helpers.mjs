import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const fixturePath = (name) => join(root, 'test', 'fixtures', name);
export const fixture = (name) => readFileSync(fixturePath(name), 'utf8');
export const ids = (findings) => findings.map((f) => f.id);
