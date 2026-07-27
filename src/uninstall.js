import fs from 'node:fs/promises';
import path from 'node:path';
import { hashFile, readManifest, writeManifest, MANIFEST_NAME } from './manifest.js';
import { pruneEmpty, removeAt, destinationState, blockedAncestors } from './tree.js';

/**
 * Recorded paths that no longer hold the file we wrote there.
 *
 * `uninstall` promises to remove only, and all of, what the installer wrote. A
 * file the user has since rewritten is not what the installer wrote, and this
 * is the same rule `install` applies before it overwrites one. Uninstall
 * removed it regardless, so the guarantee held in one direction only.
 */
async function altered(destDir, files) {
  const bad = [];
  for (const [rel, expected] of Object.entries(files)) {
    const abs = path.join(destDir, rel);
    const state = await destinationState(abs);
    if (state === 'absent') continue; // Already gone. Nothing to refuse.
    if (state !== 'file') { bad.push(rel); continue; }
    if (await hashFile(abs) !== expected) bad.push(rel);
  }
  return bad.sort();
}

export async function uninstallSkills({ targetDir, names, force = false }) {
  const manifest = await readManifest(targetDir);
  const removed = [];
  const missing = [];
  const skipped = [];
  const skills = { ...manifest.skills };

  for (const name of names) {
    const entry = skills[name];
    if (!entry) {
      missing.push(name);
      continue;
    }
    const destDir = path.join(targetDir, name);
    const rels = Object.keys(entry.files);

    // The checks `install` makes before it writes, made here before we delete.
    // This module reached `fs.rm` directly and imported one of the four
    // filesystem primitives, so every rule the install path learned across four
    // review rounds was still absent here. A symlinked ancestor sent the
    // deletion outside the target tree, and a recorded path that had become a
    // directory threw part-way through the loop, leaving files gone and the
    // manifest still claiming them.
    const blocked = await blockedAncestors(destDir, rels);
    const drifted = force ? [] : await altered(destDir, entry.files);
    if (blocked.size || drifted.length) {
      skipped.push({
        name,
        reason: drifted.length ? 'locally-modified' : 'not-ours',
        files: [...blocked, ...drifted].sort(),
      });
      continue;
    }

    for (const rel of rels) {
      const abs = path.join(destDir, rel);
      await removeAt(abs); // Classifies first, so a directory here cannot throw.
      await pruneEmpty(path.dirname(abs), destDir);
    }
    await pruneEmpty(destDir, targetDir);
    delete skills[name];
    removed.push(name);
  }

  // Removing nothing writes nothing. `writeManifest` creates the directory it
  // writes into, so uninstalling a skill from a machine that never had one
  // used to leave behind a skills directory and an empty manifest.
  if (!removed.length) return { removed, missing, skipped };

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
  return { removed, missing, skipped };
}
