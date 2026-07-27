import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './catalog.js';
import { hashFile, readManifest, writeManifest, recordSkill } from './manifest.js';
import {
  walk, pruneEmpty, destinationState, removeAt, ensureDir, ancestorsOf,
} from './tree.js';

/**
 * Recorded paths that no longer hold the file we wrote there. Writing over one
 * would destroy something we did not create.
 *
 * The type check is not a separate concern from the hash check. A recorded
 * path that has become a symbolic link cannot be hashed for a fair comparison
 * — `hashFile` follows the link and reports on whatever it points at, which
 * may be outside the target tree entirely. Any path that is not a plain file
 * has stopped being ours, whatever it holds.
 */
async function alteredFiles(destDir, recorded) {
  const bad = [];
  for (const [rel, expected] of Object.entries(recorded ?? {})) {
    const abs = path.join(destDir, rel);
    const state = await destinationState(abs);
    if (state === 'absent') continue; // Deleted since. The copy restores it.
    if (state !== 'file') { bad.push(rel); continue; }
    if (await hashFile(abs) !== expected) bad.push(rel);
  }
  return bad.sort();
}

/**
 * Paths this skill is about to write that already hold something we never
 * recorded. It belongs to the user, and copying over it destroys work with no
 * warning and no way back.
 *
 * Checking the manifest alone missed this, because an unrecorded path has no
 * hash to compare. A collision on an unrecorded path is drift, and it is the
 * more dangerous kind.
 */
async function untrackedCollisions(destDir, sourceRels, recorded) {
  const known = new Set(Object.keys(recorded ?? {}));
  const hits = new Set();
  for (const rel of sourceRels) {
    // The directory components count too. A user file named `references`
    // blocks every path under it, and `lstat` on those paths returns ENOTDIR,
    // which reads as absent. So the collision went unreported and the copy
    // crashed on `mkdir` instead. A recorded ancestor is ours, and retirement
    // clears it before the copy, which is how a shipped file becomes a
    // directory in a later release.
    for (const dir of ancestorsOf(rel)) {
      if (known.has(dir)) continue;
      const state = await destinationState(path.join(destDir, dir));
      if (state !== 'absent' && state !== 'directory') hits.add(dir);
    }

    if (known.has(rel)) continue; // A recorded path is `alteredFiles`'s to judge.
    const abs = path.join(destDir, rel);
    const state = await destinationState(abs);
    if (state === 'absent') continue; // Nothing is in the way.

    // A directory holding only files we recorded is ours, not the user's.
    // Those are retired files, and the retirement pass clears them so this
    // path can become a file. Refusing here would make that release
    // transition impossible to complete, even with --force.
    if (state === 'directory') {
      const under = await walk(abs);
      if (under.length && under.every((sub) => known.has(path.join(rel, sub)))) continue;
    }

    hits.add(rel);
  }
  return [...hits].sort();
}

/**
 * Paths the previous version installed that this version no longer ships.
 * Leaving them behind orphans them: the manifest entry is replaced, so
 * uninstall can no longer remove them, and the agent keeps loading them.
 */
function retiredFiles(recorded, sourceRels) {
  const shipping = new Set(sourceRels);
  return Object.keys(recorded ?? {}).filter((rel) => !shipping.has(rel)).sort();
}

export async function installSkills({
  repoRoot, targetDir, names, pathway = 'engine', now, force = false,
}) {
  const catalog = await loadCatalog(repoRoot);
  const byName = new Map(catalog.map((s) => [s.name, s]));
  for (const name of names) {
    if (!byName.has(name)) throw new Error(`Unknown skill "${name}".`);
  }

  let manifest = await readManifest(targetDir);
  const installed = [];
  const skipped = [];

  for (const name of names) {
    const skill = byName.get(name);
    const destDir = path.join(targetDir, name);
    const recorded = manifest.skills[name]?.files;
    const rels = await walk(skill.dir);

    // The skill's own directory is the outermost ancestor of every path it
    // ships, and it is the one `ancestorsOf` cannot name, because the paths it
    // walks are relative to it. Leaving it out put the same collision one
    // level up, where it crashed the copy instead of being reported.
    const destState = await destinationState(destDir);
    const destBlocked = destState !== 'absent' && destState !== 'directory';

    if (!force) {
      const drifted = await alteredFiles(destDir, recorded);
      const untracked = await untrackedCollisions(destDir, rels, recorded);
      if (destBlocked || drifted.length || untracked.length) {
        skipped.push({
          name,
          reason: drifted.length ? 'locally-modified' : 'not-ours',
          files: [...(destBlocked ? [name] : []), ...drifted, ...untracked].sort(),
        });
        continue;
      }
    } else if (destBlocked) {
      await removeAt(destDir);
    }

    // Retire BEFORE copying, not after. A release can replace a directory of
    // files with a single file of the same name, and `copyFile` cannot write
    // over a directory. Retiring afterwards made that transition impossible to
    // complete, with or without --force.
    //
    // The checks above already proved each retired path is either gone or the
    // unmodified file we wrote, so removing it discards nothing the user made.
    // Under --force the user asked for the removal whatever it holds.
    for (const rel of retiredFiles(recorded, rels)) {
      const abs = path.join(destDir, rel);
      await removeAt(abs);
      await pruneEmpty(path.dirname(abs), destDir);
    }

    const files = {};
    for (const rel of rels) {
      const from = path.join(skill.dir, rel);
      const to = path.join(destDir, rel);
      // Clear anything `copyFile` cannot write over or would write THROUGH. A
      // plain file it overwrites in place; a link it follows, out of the tree.
      // Without --force the checks above refused every one of these, so only
      // the emptied leftovers of retirement reach here. With --force the user
      // asked to overwrite whatever sits in the way.
      const state = await destinationState(to);
      if (state !== 'absent' && state !== 'file') await removeAt(to);
      await ensureDir(path.dirname(to), destDir);
      await fs.copyFile(from, to);
      files[rel] = await hashFile(to);
    }

    manifest = recordSkill(manifest, { name, tier: skill.tier, pathway, files, now });
    installed.push(name);
  }

  await writeManifest(targetDir, manifest);
  return { installed, skipped };
}
