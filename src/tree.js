import fs from 'node:fs/promises';
import path from 'node:path';

// Filesystem tree helpers shared by install and uninstall. They lived in the
// two modules separately until install also needed to prune, and a second copy
// is a second thing to drift.

/** Every file under `dir`, as paths relative to it, sorted. */
export async function walk(dir, base = '') {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = path.join(base, e.name);
    if (e.isDirectory()) out.push(...await walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

/**
 * Remove `dir` and its empty parents, stopping below `stopAt`. A directory that
 * still holds anything is left alone, which is what keeps a file the user added
 * from taking its directory with it.
 */
export async function pruneEmpty(dir, stopAt) {
  let current = dir;
  while (current.startsWith(stopAt) && current !== stopAt) {
    let entries;
    try {
      entries = await fs.readdir(current);
    } catch {
      return;
    }
    if (entries.length) return;
    await fs.rmdir(current);
    current = path.dirname(current);
  }
}
