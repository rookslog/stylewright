import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './catalog.js';
import {
  hashFile, readManifestWithIdentity, writeManifest, recordSkill, clearStaleWrite,
  removeManifest,
} from './manifest.js';
import {
  hasPending, addPending, clearPending, recoverPending, discardStated, stagingPath,
  STAGING_SUFFIX,
} from './journal.js';
import { withTargetLock } from './lock.js';
import {
  walk, pruneEmpty, destinationState, removeAt, ensureDir, reachability,
  ancestorsOf,
} from './tree.js';

/** The subset of a recorded map whose keys the walk could reach. */
function pick(recorded, open) {
  return Object.fromEntries(Object.entries(recorded ?? {}).filter(([rel]) => open.has(rel)));
}

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
/**
 * Every path this install touches — the ones it ships AND the ones it retires.
 * A rule about paths has to range over all of them. Stating it over the ones
 * that happened to be convenient is how it comes back: the ancestor check
 * walked only the shipped paths, so a release that dropped the last file
 * beneath a symlinked directory deleted through the link.
 */
function pathsTouched(sourceRels, recorded) {
  return [...sourceRels, ...Object.keys(recorded ?? {})];
}

async function untrackedCollisions(destDir, sourceRels, recorded) {
  const known = new Set(Object.keys(recorded ?? {}));
  const hits = new Set();
  for (const rel of sourceRels) {
    // The staging path is a destination too. The copy clears whatever stands
    // there, so a file the user happened to put at that name was deleted by a
    // write no check had inspected — the same defect as the shipped paths, one
    // suffix along. A stale one of ours never reaches here, because recovery
    // clears it before this runs.
    if (await destinationState(stagingPath(path.join(destDir, rel))) !== 'absent') {
      hits.add(`${rel}${STAGING_SUFFIX}`);
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

/**
 * What a live run does when its own commit is refused.
 *
 * The pending record covers the run that is killed, because a killed run
 * executes nothing. It does not cover this case: another run that committed in
 * between has already cleared our statement, so nothing on disk names the files
 * we copied. The process is still alive and still knows them, so it says so.
 *
 * It reads the manifest fresh, because the run that overtook us wrote it, and
 * its record is what decides which of these paths are now somebody's.
 */
async function undo(targetDir, name, stated, written, retired) {
  const { manifest, identity } = await readManifestWithIdentity(targetDir);
  await discardStated(targetDir, name, stated, manifest);

  // Retirement is a deletion this run made before it copied anything, and a
  // commit that never lands leaves the surviving record naming those paths
  // while they are gone. The record catches up, exactly as uninstall's does
  // after it deletes: only paths this run removed, and only where the tree
  // still agrees they are absent.
  const entry = manifest.skills?.[name];
  const files = { ...entry?.files };
  let dropped = false;
  for (const rel of retired) {
    if (!Object.hasOwn(files, rel)) continue;
    if (await destinationState(path.join(targetDir, name, rel)) !== 'absent') continue;
    delete files[rel];
    dropped = true;
  }

  // The statement is ours to withdraw only while it is still ours. A run that
  // replaced it owns what it names now, and clearing it by name would leave
  // that run's files with nothing to reach them — this defect, from the other
  // side.
  const mine = JSON.stringify(manifest.pending?.[name]) === JSON.stringify(stated);
  if (!mine && !dropped) return;
  const next = mine ? clearPending(manifest, name) : manifest;
  await writeManifest(
    targetDir,
    dropped ? { ...next, skills: { ...next.skills, [name]: { ...entry, files } } } : next,
    identity);
}

export async function installSkills(options) {
  const catalog = await loadCatalog(options.repoRoot);
  const byName = new Map(catalog.map((s) => [s.name, s]));
  for (const name of options.names) {
    if (!byName.has(name)) throw new Error(`Unknown skill "${name}".`);
  }
  // Held for the whole command. Everything below reads the tree and then acts
  // on what it read, and another run inside the same directory invalidates the
  // reading between the two.
  const { emptied, ...result } = await withTargetLock(
    options.targetDir, () => installUnderLock(byName, options));
  // After the lock is released, because the lock file lives in this directory.
  // `rmdir` refuses a directory that is not empty, which is the whole of the
  // check: anything else there keeps it alive.
  if (emptied) await fs.rmdir(options.targetDir).catch(() => {});
  return result;
}

async function installUnderLock(byName, {
  targetDir, names, pathway = 'engine', now, force = false,
}) {
  // This command holds the directory, so a half-finished manifest write can
  // only be a killed run's. Left there it refuses every write below.
  await clearStaleWrite(targetDir);
  // The identity travels from the read to every write this run makes. It is
  // what makes each write a statement about the file this command read, rather
  // than about whatever stands at the path by then.
  let { manifest, identity } = await readManifestWithIdentity(targetDir);
  const installed = [];
  const skipped = [];
  const recovered = [];
  const cleared = [];

  // An earlier run stated what it was about to write and did not come back.
  // Clearing its leavings before this run inspects the tree is what stops them
  // from reading as the user's own files.
  if (hasPending(manifest)) {
    const done = await recoverPending(targetDir, manifest);
    recovered.push(...done.removed);
    cleared.push(...done.cleared);
    manifest = done.manifest;
    identity = await writeManifest(targetDir, manifest, identity);
  }

  for (const name of names) {
    const skill = byName.get(name);
    const destDir = path.join(targetDir, name);
    const recorded = manifest.skills[name]?.files;
    const rels = await walk(skill.dir);
    // The staging name is the destination plus a suffix, so a skill that
    // shipped both `A` and `A.stylewright-part` would have the copy of `A` use
    // the second one as scratch space and clear it. That is a shipped file
    // treated as this engine's leavings, and no message could make it right, so
    // the shape is refused where it enters rather than handled where it bites.
    const reserved = rels.filter((rel) => rel.endsWith(STAGING_SUFFIX));
    if (reserved.length) {
      throw new Error(
        `Skill "${name}" ships ${reserved.join(', ')}, and "${STAGING_SUFFIX}" is the suffix `
        + 'this tool stages a copy under. Rename the file.');
    }

    // The skill's own directory is the outermost ancestor of every path it
    // ships, and it is the one `ancestorsOf` cannot name, because the paths it
    // walks are relative to it. Leaving it out put the same collision one
    // level up, where it crashed the copy instead of being reported.
    const known = new Set(Object.keys(recorded ?? {}));
    // A recorded ancestor that is still a plain file is the file-to-directory
    // release transition, and retirement completes it.
    const exempt = (dir, state) => state === 'file' && known.has(dir);
    const retired = retiredFiles(recorded, rels);
    // Two passes, because `--force` disposes of one and not the other. An
    // ancestor of a path we SHIP stands in the way of a write, and force clears
    // it. An ancestor reached only by a RETIRED path stands in the way of a
    // deletion, and nothing is written through it, so the round-six rule holds:
    // force may clear what blocks a write, and not what blocks nothing. Ranging
    // one set over the union deleted a user file through the retired half.
    const write = await reachability(destDir, rels, exempt);
    const retire = await reachability(destDir, retired, exempt);
    const blockedWrite = write.blocked;
    const blockedRetire = retire.blocked;
    const blocked = new Set([...blockedWrite, ...blockedRetire]);
    const destBlocked = write.baseBlocked;

    if (!force) {
      // Only the leaves the walk could actually reach. Handing every recorded
      // and shipping path to these two turned a blocked ancestor into an ELOOP
      // out of install, where the whole point of finding the blocker was to
      // refuse politely. `reachability` is empty when the base is blocked, so
      // this needs no separate guard.
      const open = new Set([...write.reachable, ...retire.reachable]);
      const drifted = await alteredFiles(destDir, pick(recorded, open));
      const untracked = await untrackedCollisions(
        destDir, rels.filter((r) => open.has(r)), recorded);
      if (destBlocked || blocked.size || drifted.length || untracked.length) {
        skipped.push({
          name,
          reason: drifted.length ? 'locally-modified' : 'not-ours',
          files: [
            ...(destBlocked ? [name] : []), ...blocked, ...drifted, ...untracked,
          ].sort(),
        });
        continue;
      }
    } else {
      // Outermost first, so removing a directory takes its descendants and the
      // inner entries become absent rather than stale. Clearing these BEFORE
      // retirement is what stops a delete from travelling through a link.
      if (destBlocked) await removeAt(destDir);
      for (const dir of [...blockedWrite].sort()) {
        await removeAt(path.join(destDir, dir));
        // Cleared, so it no longer blocks the retirement below either.
        blockedRetire.delete(dir);
      }
    }

    // Everything below this line changes the tree, and the record of what it
    // may change goes on disk first. Copying and then recording leaves a window
    // in which files exist that no record names, and `uninstall` removes only
    // what the manifest records — so a run interrupted inside that window left
    // files nothing could reach. The window is now empty of writes.
    //
    // The statement carries the content, not just the path. What proves a file
    // at one of these paths belongs to this run is that it holds these bytes,
    // and nothing weaker survived review: the path alone claims a file the user
    // wrote there afterwards, and "no recorded path is mine" abandons a file
    // this run wrote at a path another run had recorded.
    const stated = {};
    for (const rel of rels) stated[rel] = await hashFile(path.join(skill.dir, rel));
    manifest = addPending(manifest, name, stated);
    identity = await writeManifest(targetDir, manifest, identity);

    // Named out here so the undo below knows what this run actually wrote and
    // what it removed.
    const files = {};
    const retiredHere = [];
    try {
      // Retire BEFORE copying, not after. A release can replace a directory of
      // files with a single file of the same name, and `copyFile` cannot write
      // over a directory. Retiring afterwards made that transition impossible to
      // complete, with or without --force.
      //
      // The checks above already proved each retired path is either gone or the
      // unmodified file we wrote, so removing it discards nothing the user made.
      //
      // Under --force those checks did not run, and --force does not reach this
      // far. The line it draws: force may destroy what stands in the way of
      // something it must WRITE, and may not destroy what merely stands where
      // nothing is going. Nothing is going to a retired path. So a directory the
      // user built over one keeps its contents, which the manifest never recorded
      // and this engine never wrote. The same rule uninstall applies, in the
      // other consumer of removeAt.
      for (const rel of retired) {
        // Whose ancestors force did not clear, because it had no reason to. A
        // deletion through a symbolic link is the defect this whole pull request
        // opened on, and the retired half is the last place it could still reach.
        if (ancestorsOf(rel).some((dir) => blockedRetire.has(dir))) continue;
        const abs = path.join(destDir, rel);
        const state = await destinationState(abs);
        // Nothing is written here, so the boundary decides the whole question: a
        // retired leaf goes only if it is still the thing we wrote. Without
        // --force `alteredFiles` refused the skill outright, and WITH --force
        // that check was skipped, so an edit at a retired path was deleted while
        // the user was forcing an overwrite of some other, still-shipping file.
        // An empty directory still goes, because removing it destroys nothing.
        if (state === 'directory') {
          if ((await fs.readdir(abs)).length) continue;
        } else if (state === 'file') {
          if (await hashFile(abs) !== recorded?.[rel]) continue;
        } else if (state !== 'absent') {
          continue; // A link. Nothing is written through it either.
        }
        await removeAt(abs);
        retiredHere.push(rel);
        await pruneEmpty(path.dirname(abs), destDir);
      }

      for (const rel of rels) {
        const from = path.join(skill.dir, rel);
        const to = path.join(destDir, rel);
        // Clear anything the write cannot replace or would write THROUGH. A
        // plain file the rename below replaces; a link it also replaces, rather
        // than following it out of the tree, and a directory it cannot touch.
        // Without --force the checks above refused every one of these, so only
        // the emptied leftovers of retirement reach here. With --force the user
        // asked to overwrite whatever sits in the way.
        const state = await destinationState(to);
        if (state !== 'absent' && state !== 'file') await removeAt(to);
        await ensureDir(path.dirname(to), destDir);
        // Staged and renamed, never copied into place. `copyFile` writes into
        // the destination and can stop half way, and a fragment at a
        // destination is a file nothing can identify afterwards — not the
        // user's, not this run's, and not safe to delete on either reading. A
        // rename means the destination holds a whole file or none.
        //
        // Whatever stands at the staging path is cleared, because that name
        // belongs to this tool: it is the destination plus a suffix nothing
        // else writes. A leftover there is this engine's own, from a run that
        // stopped between the copy and the rename.
        const staged = stagingPath(to);
        await removeAt(staged);
        await fs.copyFile(from, staged, fs.constants.COPYFILE_EXCL);
        files[rel] = await hashFile(staged);
        // The statement was made from the source before the copy, and it is
        // what lets a later command prove this file is ours. A source that
        // changed in between would put bytes at the destination that no
        // statement names, so the run stops while the only thing on disk is a
        // staging file that recovery removes by name.
        if (files[rel] !== stated[rel]) {
          throw new Error(
            `"${name}" changed in ${skill.dir} while this command was running. Run again.`);
        }
        await fs.rename(staged, to);
      }

      // The commit. It records the files and withdraws the statement about them
      // in one write, so no reader ever sees both, and a run that dies before
      // it leaves the statement standing for the next one.
      manifest = clearPending(
        recordSkill(manifest, { name, tier: skill.tier, pathway, files, now }), name);
      identity = await writeManifest(targetDir, manifest, identity);
      installed.push(name);
    } catch (err) {
      // The original failure is the one the caller needs. A failure inside the
      // undo leaves the pending statement on disk, which is exactly the state
      // the next command recovers from, so it is not worth reporting over the
      // error that caused it.
      await undo(targetDir, name, stated, files, retiredHere).catch(() => {});
      throw err;
    }
  }

  // A run that committed each skill has already written this manifest. A run
  // that installed nothing has not.
  let emptied = false;
  if (!installed.length) {
    // And a manifest recording nothing is a file this engine wrote and nothing
    // needs, so a run whose only work was clearing up after an interrupted one
    // leaves the directory as it found it. Writing the empty record back kept
    // the interrupted run's last trace, and every later scan read the directory
    // as one this tool owns.
    if (!Object.keys(manifest.skills).length && !hasPending(manifest) && identity !== null) {
      await removeManifest(targetDir, identity);
      emptied = true;
    } else {
      await writeManifest(targetDir, manifest, identity);
    }
  }
  return { installed, skipped, recovered, cleared, emptied };
}
