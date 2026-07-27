import fs from 'node:fs/promises';
import path from 'node:path';
import { hashFile, readManifest, writeManifest, MANIFEST_NAME } from './manifest.js';
import { pruneEmpty, removeAt, destinationState, blockedAncestors, ancestorsOf } from './tree.js';

/**
 * Recorded paths that hold something other than a file.
 *
 * These are separated from the edited ones because **`--force` must not
 * dispose of them.** `--force` means "remove a file I edited". A directory
 * standing where a recorded file used to be holds files the manifest never
 * recorded, and `removeAt` deletes a directory recursively: a recorded
 * `LICENSE` replaced by `LICENSE/notes.md` lost `notes.md`, which the installer
 * never wrote and uninstall promises never to touch. The refusal was already
 * correct without `--force`, and the CLI's own advice was to pass `--force`.
 */
async function wrongType(destDir, files) {
  const bad = [];
  for (const rel of Object.keys(files)) {
    const abs = path.join(destDir, rel);
    const state = await destinationState(abs);
    if (state === 'absent' || state === 'file') continue;
    // An EMPTY directory is the exception, and the distinction is the whole
    // rule: what force must not destroy is content the manifest never
    // recorded. An empty directory holds none, so removing it destroys
    // nothing and force may dispose of it below. Anything with contents, and
    // any symbolic link, stays.
    if (state === 'directory' && (await fs.readdir(abs)).length === 0) continue;
    bad.push(rel);
  }
  return bad.sort();
}

/**
 * Recorded paths holding a file whose content is not the one we wrote.
 *
 * `uninstall` promises to remove only, and all of, what the installer wrote. A
 * file the user has since rewritten is not what the installer wrote, and this
 * is the same rule `install` applies before it overwrites one. Uninstall
 * removed it regardless, so the guarantee held in one direction only.
 *
 * This one IS force-able: the user is telling us they know the file is theirs
 * and want it gone anyway, and one file is what goes.
 */
async function altered(destDir, files) {
  const bad = [];
  for (const [rel, expected] of Object.entries(files)) {
    const abs = path.join(destDir, rel);
    const state = await destinationState(abs);
    if (state === 'absent') continue; // Already gone. Nothing to refuse.
    // Not a file, and wrongType let it through, so it is an empty directory:
    // changed from what we wrote, holding nothing, force-able.
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
    // Two refusals with different dispositions. A blocked ancestor and a
    // recorded path that is no longer a file are refused whether or not you
    // pass `--force`, because in neither case is a file we wrote the thing that
    // would be deleted. Only an edited file is force-able, so only that reason
    // may carry the advice to force. Reporting them under one reason is what
    // sent the user round the loop twice with nothing left to try.
    const blocked = await blockedAncestors(destDir, rels);
    // A leaf beneath a known blocker is not inspected. Once the ancestor has
    // been found, the skill is refused whatever the leaf turns out to be, and
    // reaching for it is a syscall through the very thing we just refused to
    // trust: a self-referential symlink at `references` made `lstat` on
    // `references/guide.md` throw ELOOP instead of reporting `not-ours`, and a
    // FIFO would hang the hash read rather than throw at all.
    const reachable = Object.fromEntries(Object.entries(entry.files)
      .filter(([rel]) => !ancestorsOf(rel).some((dir) => blocked.has(dir))));
    const stuck = await wrongType(destDir, reachable);
    const drifted = force ? [] : await altered(destDir, reachable);
    if (blocked.size || stuck.length || drifted.length) {
      skipped.push({
        name,
        reason: (blocked.size || stuck.length) ? 'not-ours' : 'locally-modified',
        // Deduplicated: the two file checks overlap by design on a path that
        // is not a file, and a path reported twice reads as two problems.
        files: [...new Set([...blocked, ...stuck, ...drifted])].sort(),
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
