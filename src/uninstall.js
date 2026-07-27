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

  // The manifest is a file the installer wrote, so a full uninstall must take
  // it too. Leaving it behind with an empty skills map contradicts the promise
  // that uninstall removes only, and all of, what the installer wrote.
  //
  // `removed.length` guards it. Without that, uninstalling a skill that was
  // never here deletes a directory this tool never wrote to.
  if (removed.length && Object.keys(skills).length === 0) {
    await fs.rm(path.join(targetDir, MANIFEST_NAME), { force: true });
    // Only when nothing else is there. A hand-written skill in the same
    // directory keeps it alive, and that is correct.
    await fs.rmdir(targetDir).catch(() => {});
  } else {
    await writeManifest(targetDir, { ...manifest, skills });
  }
  return { removed, missing };
}
