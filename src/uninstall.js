import fs from 'node:fs/promises';
import path from 'node:path';
import { readManifest, writeManifest, MANIFEST_NAME } from './manifest.js';
import { pruneEmpty } from './tree.js';

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

  // Removing nothing writes nothing. `writeManifest` creates the directory it
  // writes into, so uninstalling a skill from a machine that never had one
  // used to leave behind a skills directory and an empty manifest — this tool
  // reporting its own absence as a state it had installed.
  if (!removed.length) return { removed, missing };

  // The manifest is a file the installer wrote, so a full uninstall must take
  // it too. Leaving it behind with an empty skills map contradicts the promise
  // that uninstall removes only, and all of, what the installer wrote.
  if (Object.keys(skills).length === 0) {
    await fs.rm(path.join(targetDir, MANIFEST_NAME), { force: true });
    // Only when nothing else is there. A hand-written skill in the same
    // directory keeps it alive, and that is correct.
    await fs.rmdir(targetDir).catch(() => {});
  } else {
    await writeManifest(targetDir, { ...manifest, skills });
  }
  return { removed, missing };
}
