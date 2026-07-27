import fs from 'node:fs/promises';
import path from 'node:path';
import { readManifest, writeManifest } from './manifest.js';

async function pruneEmpty(dir, stopAt) {
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

export async function uninstallSkills({ targetDir, names }) {
  const manifest = await readManifest(targetDir);
  const removed = [];
  const missing = [];
  const skills = { ...manifest.skills };

  for (const name of names) {
    const entry = skills[name];
    if (!entry) {
      missing.push(name);
      continue;
    }
    for (const rel of Object.keys(entry.files)) {
      const abs = path.join(targetDir, name, rel);
      await fs.rm(abs, { force: true });
      await pruneEmpty(path.dirname(abs), targetDir);
    }
    await pruneEmpty(path.join(targetDir, name), targetDir);
    delete skills[name];
    removed.push(name);
  }

  await writeManifest(targetDir, { ...manifest, skills });
  return { removed, missing };
}
