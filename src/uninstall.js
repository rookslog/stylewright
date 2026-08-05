import fs from 'node:fs/promises';
import path from 'node:path';
import {
  hashFile, readManifestWithIdentity, writeManifest, removeManifest, isStale,
} from './manifest.js';
import { hasPending, recoverPending } from './journal.js';
import { pruneEmpty, removeAt, destinationState, reachability } from './tree.js';

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
  let { manifest, identity } = await readManifestWithIdentity(targetDir);
  const removed = [];
  const missing = [];
  const skipped = [];
  const recovered = [];

  // An install that did not come back left files it had stated it would write.
  // This command's promise is that it removes what the installer wrote, so the
  // leavings of a half-finished install are its to clear — and clearing them is
  // the only way anything can, because they belong to no skill entry.
  if (hasPending(manifest)) {
    const done = await recoverPending(targetDir, manifest);
    recovered.push(...done.removed);
    manifest = done.manifest;
    identity = await writeManifest(targetDir, manifest, identity);
  }

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
    // The skill's own directory is classified too, and this is where it was
    // missing. `ancestorsOf` names components BELOW `destDir` and cannot name
    // `destDir` itself, so a skill directory replaced by a symlink to another
    // installation was never seen: the leaves resolved through it, matched
    // their recorded hashes because they were the same files, and the removal
    // then ran inside the other installation. Nothing here is force-able,
    // because nothing under that link is ours to remove.
    const { baseBlocked, blocked, reachable } = await reachability(destDir, rels);
    if (baseBlocked) {
      skipped.push({ name, reason: 'not-ours', files: [name] });
      continue;
    }
    const open = new Set(reachable);
    const seen = Object.fromEntries(Object.entries(entry.files).filter(([rel]) => open.has(rel)));
    const stuck = await wrongType(destDir, seen);
    const drifted = force ? [] : await altered(destDir, seen);
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
  if (!removed.length) return { removed, missing, skipped, recovered };

  // The files are gone by now, so the record has to catch up rather than
  // refuse. A refusal here is not the harmless one install gets: install
  // refuses BEFORE it copies, and this command has already deleted. It leaves
  // the manifest claiming files that are not there, and it exits non-zero on a
  // removal that happened.
  //
  // So the record is reapplied to whatever the manifest now holds, rather than
  // written from what this command read. What it reapplies is exactly what this
  // command did: the entries for the skills it removed, and nothing else. A
  // skill another run installed meanwhile keeps its record.
  await reapply(targetDir, removed);
  return { removed, missing, skipped, recovered };
}

/** Does any file this entry records still stand where it says? */
async function anyFilePresent(targetDir, name, entry) {
  const destDir = path.join(targetDir, name);
  const rels = Object.keys(entry?.files ?? {});
  const { baseBlocked, reachable } = await reachability(destDir, rels);
  if (baseBlocked) return true; // Not ours to judge, so not ours to unrecord.
  for (const rel of reachable) {
    if (await destinationState(path.join(destDir, rel)) !== 'absent') return true;
  }
  return false;
}

/**
 * Take `names` out of the manifest, reading it again for each attempt.
 *
 * Retrying is only correct after the tree has changed. The decisions above are
 * taken from a reading of the tree, so a run that loses a race there must stop
 * and be run again. This one is not a decision. It is the record of a deletion
 * that already happened, and the only wrong answer is to leave it unrecorded.
 */
async function reapply(targetDir, names, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    const { manifest, identity } = await readManifestWithIdentity(targetDir);
    const skills = { ...manifest.skills };
    for (const name of names) {
      // Only where the record still names nothing. Another run can reinstall a
      // skill between the deletion above and this write, and its files are on
      // disk under its record — so taking the entry out would strand every one
      // of them, which is the defect this whole change exists to close,
      // arriving from the other direction. The tree decides, not the name.
      if (await anyFilePresent(targetDir, name, skills[name])) continue;
      delete skills[name];
    }
    try {
      // The manifest is a file the installer wrote, so a full uninstall must
      // take it too. Leaving it behind with an empty skills map contradicts the
      // promise that uninstall removes only, and all of, what the installer
      // wrote.
      if (Object.keys(skills).length === 0 && !hasPending(manifest)) {
        await removeManifest(targetDir, identity);
        // Only when nothing else is there. A hand-written skill in the same
        // directory keeps it alive, and that is correct.
        await fs.rmdir(targetDir).catch(() => {});
      } else {
        await writeManifest(targetDir, { ...manifest, skills }, identity);
      }
      return;
    } catch (err) {
      if (!isStale(err) || attempt >= attempts) throw err;
    }
  }
}
