import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { MANIFEST_NAME } from '../../src/manifest.js';

export async function treeOf(dir, base = '') {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const e of entries) {
    if (e.name === MANIFEST_NAME) continue;
    const rel = path.join(base, e.name);
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await treeOf(abs, rel));
    else {
      out.push({
        rel,
        sha256: crypto.createHash('sha256').update(await fs.readFile(abs)).digest('hex'),
      });
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
