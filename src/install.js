import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './catalog.js';
import {
  contained, hashFile, readManifestWithIdentity, writeManifest, recordSkill,
  refuseStaleWrite,
  removeManifest,
} from './manifest.js';
import {
  hasPending, addPending, clearPending, markCommitted, withdrawRecorded, recoverPending,
  rollBack, sweepKept, stagingPath, stagingKey, previousPath, previousKey,
  usesReservedName, RESERVED_SUFFIXES,
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
 * Paths holding something at the name this run moves an old file ASIDE to.
 *
 * Separate from `untrackedCollisions`, and checked whether or not `--force` is
 * set, which is the whole point of it standing alone. `--force` means "remove
 * something I edited that is in the way of a file you must write". Nothing is
 * written at this name: it is where this tool chooses to put bytes it is
 * choosing to preserve, and choosing to preserve one file must never cost the
 * user a different one. Inside the `--force` branch the rename simply replaced
 * whatever stood there, with no check and no report.
 *
 * The staging name stays in `untrackedCollisions`, where `--force` does dispose
 * of it. That name is scratch space the copy MUST have, so a file there really
 * does block a write, and PR #54 settled that disposition deliberately.
 *
 * It stands at every path the run DESTROYS — the shipped ones it overwrites and
 * the recorded ones it retires, so the check ranges over both. That is the same
 * rule the two `reachability` passes below carry, and the reason is stated
 * there.
 */
async function reservedCollisions(destDir, sourceRels, retiredRels) {
  const hits = new Set();
  for (const rel of new Set([...sourceRels, ...retiredRels])) {
    if (await destinationState(previousPath(path.join(destDir, rel))) !== 'absent') {
      hits.add(previousKey(rel));
    }
  }
  return [...hits].sort();
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
      hits.add(stagingKey(rel));
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
      // `/` and not path.join: these are manifest keys, spelled `/` everywhere.
      if (under.length && under.every((sub) => known.has(`${rel}/${sub}`))) continue;
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
async function undo(targetDir, name, stated, written) {
  const { manifest, identity } = await readManifestWithIdentity(targetDir);
  // `written` and not the statement, because this run knows which of those
  // paths it reached. A file at a path it never got to holds somebody else's
  // work, and a user who edited it to exactly the bytes this release ships
  // satisfies the content proof that recovery has to rely on. Recovery has no
  // choice — it reads a statement its own run did not live to explain. This one
  // does.
  //
  // The rollback puts back what this run moved aside, so the record it leaves
  // is true about the tree again. What it could not put back it reports, and
  // the record stops naming it — the reconciliation that used to be written out
  // here for retirement alone, now covering every path the run destroyed.
  const { missing } = await rollBack(targetDir, name, stated, manifest, written);
  const withdrawn = withdrawRecorded(manifest, name, missing);
  const dropped = withdrawn !== manifest;

  // The statement is ours to withdraw only while it is still ours. A run that
  // replaced it owns what it names now, and clearing it by name would leave
  // that run's files with nothing to reach them — this defect, from the other
  // side.
  const mine = JSON.stringify(manifest.pending?.[name]) === JSON.stringify(stated);
  if (!mine && !dropped) return;
  await writeManifest(targetDir, mine ? clearPending(withdrawn, name) : withdrawn, identity);
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

/**
 * The same install, for a caller that already holds the target lock.
 *
 * `update` must decide what to refresh and refresh it under one held lock,
 * because a work list read outside the lock can name a skill that an
 * uninstall removes before the lock is taken — and acting on that list
 * reinstalls what the user just removed. Taking the lock here would deadlock
 * that caller, so this returns `emptied` for the caller to act on after its
 * own lock is released.
 */
export async function installHeld(options) {
  const catalog = await loadCatalog(options.repoRoot);
  const byName = new Map(catalog.map((s) => [s.name, s]));
  for (const name of options.names) {
    if (!byName.has(name)) throw new Error(`Unknown skill "${name}".`);
  }
  return installUnderLock(byName, options);
}

async function installUnderLock(byName, {
  targetDir, names, pathway = 'engine', now, force = false,
}) {
  // A half-finished manifest write left in the way would refuse every write
  // below, and the lock cannot prove whose file it is — so it is refused by
  // name here, before anything is copied or deleted.
  await refuseStaleWrite(targetDir);
  // The identity travels from the read to every write this run makes. It is
  // what makes each write a statement about the file this command read, rather
  // than about whatever stands at the path by then.
  let { manifest, identity } = await readManifestWithIdentity(targetDir);
  const installed = [];
  const skipped = [];
  const recovered = [];
  const restored = [];
  const cleared = [];

  // An earlier run stated what it was about to write and did not come back.
  // Clearing its leavings before this run inspects the tree is what stops them
  // from reading as the user's own files, and putting back what it displaced is
  // what stops the tree holding half of two releases.
  if (hasPending(manifest)) {
    const done = await recoverPending(targetDir, manifest);
    recovered.push(...done.removed);
    restored.push(...done.restored);
    cleared.push(...done.cleared);
    manifest = done.manifest;
    identity = await writeManifest(targetDir, manifest, identity);
  }

  // The read side refuses these spellings, so the write side must never
  // record one. A colon is a legal POSIX filename character: without this
  // check, install writes a manifest that the very next read refuses, and
  // the only exit is deleting the manifest by hand, orphaning every file
  // it recorded. Preflighted over EVERY selected skill before the first
  // copy, because a refusal thrown mid-loop would leave the earlier skills'
  // files on disk with the manifest write after the loop never reached —
  // unrecorded, so the next install refuses them as user-owned collisions.
  const relsByName = new Map();
  for (const name of names) {
    const rels = await walk(byName.get(name).dir);
    for (const rel of rels) {
      if (!contained(rel)) {
        throw new Error(
          `Skill "${name}" ships a file whose name cannot be recorded portably: ${rel}`);
      }
    }
    // The reserved names are the destination plus a suffix, so a skill that
    // shipped both `A` and `A.stylewright-part` would have the copy of `A` use
    // the second one as scratch space and clear it, and one that shipped
    // `A.stylewright-prev` would have an update of `A` bury it. That is a
    // shipped file treated as this engine's leavings, and no message could make
    // it right, so the shape is refused where it enters.
    //
    // Here, with the portability rule, and not in the loop that copies. A rule
    // about what a request may CONTAIN belongs with the other preflights: run
    // per skill inside that loop, it threw after an earlier skill had already
    // been copied and committed, so the command failed without ever reporting
    // the install that had happened. That is issue 72.
    const reserved = rels.filter(usesReservedName);
    if (reserved.length) {
      throw new Error(
        `Skill "${name}" ships ${reserved.join(', ')}, and this tool keeps `
        + `${RESERVED_SUFFIXES.join(' and ')} for its own scratch space. Rename the file.`);
    }
    relsByName.set(name, rels);
  }

  for (const name of names) {
    const skill = byName.get(name);
    const destDir = path.join(targetDir, name);
    const recorded = manifest.skills[name]?.files;
    const rels = relsByName.get(name);

    // The skill's own directory is the outermost ancestor of every path it
    // ships, and it is the one `ancestorsOf` cannot name, because the paths it
    // walks are relative to it. Leaving it out put the same collision one
    // level up, where it crashed the copy instead of being reported.
    const known = new Set(Object.keys(recorded ?? {}));
    // A recorded ancestor that is still a plain file is the file-to-directory
    // release transition, and retirement completes it.
    const exempt = (dir, state) => state === 'file' && known.has(dir);
    // Recorded paths that `--force` destroys by clearing an ancestor, and the
    // ancestors themselves. Named here because the statement below has to carry
    // the paths and the removal has to happen after it, and filled in the force
    // branch, which is the only thing that can raze a path this way.
    const razed = [];
    const cleared = [];
    const toClear = [];
    const retired = retiredFiles(recorded, rels);
    // Two passes, because `--force` disposes of one and not the other. An
    // ancestor of a path we SHIP stands in the way of a write, and force clears
    // it. An ancestor reached only by a RETIRED path stands in the way of a
    // deletion, and nothing is written through it, so the round-six rule holds:
    // force may clear what blocks a write, and not what blocks nothing.
    // Two passes and not one, but both sets all the same. A rule about paths
    // has to range over all of them, and stating it over the ones that happened
    // to be convenient is how it comes back. This check walked only the shipped
    // paths once, so a release that dropped the last file beneath a symlinked
    // directory deleted through the link. Ranging one set over the union
    // deleted a user file through the retired half.
    //
    // `let`, because `--force` clears blockers further down and the reading has
    // to be taken again once they are gone.
    let write = await reachability(destDir, rels, exempt);
    const retire = await reachability(destDir, retired, exempt);
    const blockedWrite = write.blocked;
    const blockedRetire = retire.blocked;
    const blocked = new Set([...blockedWrite, ...blockedRetire]);
    const destBlocked = write.baseBlocked;

    // Before the force branch, and outside it. A file at the name this run
    // moves old bytes to blocks nothing that must be written, so `--force` has
    // no business deleting it — the round-six rule, at the one name PR #54 did
    // not have. Narrowed to the paths the walk could reach, like every other
    // check: a blocker force will clear takes whatever is under it, and that is
    // force clearing a blocker rather than force taking this file.
    const reserved = await reservedCollisions(
      destDir,
      rels.filter((r) => write.reachable.includes(r)),
      retired.filter((r) => retire.reachable.includes(r)));
    if (reserved.length) {
      skipped.push({ name, reason: 'not-ours', files: reserved });
      continue;
    }

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
      // What force will clear, decided here and REMOVED further down, after the
      // statement is on disk. Outermost first, so removing a directory takes
      // its descendants and the inner entries become absent rather than stale.
      //
      // The removal used to happen right here, and that put a destruction ahead
      // of the record that names it — the one ordering this engine exists to
      // forbid. A run killed at that `rm` left the record naming every path
      // under the blocker with no statement to withdraw them, and no command
      // could reconcile it.
      if (destBlocked) toClear.push(destDir);
      for (const dir of [...blockedWrite].sort()) {
        toClear.push(path.join(destDir, dir));
        // Cleared, so it no longer blocks the retirement below either. This is
        // bookkeeping rather than a change to the tree, so it stays here where
        // the classification below reads it.
        blockedRetire.delete(dir);
        cleared.push(dir);
      }
      if (destBlocked) cleared.push('');
      // A recorded path beneath what force will remove is one THIS RUN
      // destroys. Its bytes cannot be moved aside, because they sit behind a
      // blocker this run refuses to walk through — so the statement carries the
      // path with the hash the record holds, and nothing under the reserved
      // name. A rollback then finds nothing to put back and withdraws the path
      // instead, which is the repair ADR-0019 names. Leaving these out of the
      // statement was the omission: the record went on over-claiming and no
      // command could reconcile it.
      if (cleared.length) {
        for (const rel of Object.keys(recorded ?? {})) {
          const under = cleared.includes('')
            || ancestorsOf(rel).some((dir) => cleared.includes(dir));
          if (under) razed.push(rel);
        }
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
    // fromEntries, not assignment, so a file named `__proto__` is stated
    // like any other — the same discipline as the record it precedes.
    const statedPairs = [];
    for (const rel of rels) statedPairs.push([rel, await hashFile(path.join(skill.dir, rel))]);
    const stated = Object.fromEntries(statedPairs);

    // What this run will DESTROY, decided before it says so and before it does
    // it. Orphan-free was only ever half of atomic: the statement above names
    // the files a killed run may have created, and nothing named the files it
    // had already deleted or overwritten. So a second pass classifies every
    // path this run is about to take away, and the statement carries the bytes
    // each one holds.
    //
    // The classification happens here rather than inside the copy loop below
    // because a statement made after the deletion is not a statement at all.
    // The lock is what makes the reading still true when it is acted on: only
    // one run holds a target directory, so nothing of ours moves in between,
    // and everything else is content-proved when the time comes.
    const keep = {};
    const setAside = [];
    const dropDirs = [];
    for (const rel of retired) {
      // Whose ancestors force did not clear, because it had no reason to. A
      // deletion through a symbolic link is the defect PR #54 opened on, and
      // the retired half is the last place it could still reach.
      if (ancestorsOf(rel).some((dir) => blockedRetire.has(dir))) continue;
      const abs = path.join(destDir, rel);
      const state = await destinationState(abs);
      // Nothing is written here, so the boundary decides the whole question: a
      // retired leaf goes only if it is still the thing we wrote. Without
      // --force `alteredFiles` refused the skill outright, and WITH --force
      // that check is skipped, so an edit at a retired path would be deleted
      // while the user was forcing an overwrite of some other, still-shipping
      // file. An empty directory still goes, because removing it destroys
      // nothing — and it is not stated, because nothing was there to keep.
      if (state === 'directory') {
        if (!(await fs.readdir(abs)).length) dropDirs.push(rel);
        continue;
      }
      if (state !== 'file') continue; // A link. Nothing is written through it either.
      const held = await hashFile(abs);
      if (held !== recorded?.[rel]) continue;
      keep[rel] = held;
      setAside.push(rel);
    }
    // Only the leaves the walk could reach, for the reason every other consumer
    // takes this set: an `lstat` through a blocker throws ELOOP out of the
    // command where a refusal was the whole point. Under --force a blocker
    // cleared above is no longer in the way, and this set was taken before that
    // — so such a path is copied without being kept. It is the same line
    // --force already draws, one step along.
    const open = new Set(write.reachable);
    for (const rel of rels) {
      // A shipping path holding a plain file is one the copy will replace, so
      // its bytes are stated and moved aside like a retired one's. Without
      // --force the checks above proved it is the file we recorded. WITH
      // --force it can be anything, and the hash states what is actually there
      // rather than what the record claims — a rollback has to put back the
      // file that was on disk, not the one the manifest remembers.
      //
      // Only a plain file. A directory or a link at a shipping path is cleared
      // by the copy below under --force, and neither can be moved aside as the
      // bytes of a file.
      if (!open.has(rel)) continue;
      const abs = path.join(destDir, rel);
      if (await destinationState(abs) !== 'file') continue;
      keep[rel] = await hashFile(abs);
      setAside.push(rel);
    }
    // The paths force razed. Stated with the hash the record holds and never
    // set aside, because the bytes went with the ancestor before this run could
    // reach them. The statement is what lets a rollback withdraw them.
    for (const rel of razed) {
      if (!Object.hasOwn(keep, rel)) keep[rel] = recorded[rel];
    }

    manifest = addPending(manifest, name, stated, keep);
    // Held in its own binding, because `manifest` moves under it. The commit
    // below withdraws the statement in the same assignment that records the
    // skill, so a failure in that write left the catch reading `pending` off a
    // manifest that no longer had one.
    const statement = manifest.pending[name];
    identity = await writeManifest(targetDir, manifest, identity);

    // Named out here so the undo below knows what this run actually wrote. A
    // Map, not an object literal, for the reason migrateLegacyKeys builds
    // through fromEntries: a file named `__proto__` must become a recorded key,
    // and assignment would set a prototype.
    const files = new Map();
    let committed = false;
    try {
      // What force asked to clear, cleared now that the statement naming
      // everything under it is on disk. Outermost first, so an inner entry
      // becomes absent rather than stale.
      for (const abs of toClear) await removeAt(abs);

      // Move aside BEFORE anything else, and by rename. A copy into the second
      // reserved name could stop half way, which is the fragment problem the
      // staging name exists to avoid, one suffix along. A rename either happened
      // or did not, and it performs the retirement deletion in the same step:
      // after it, the destination is absent and the bytes are still on disk
      // under a name the statement reaches.
      for (const rel of setAside) {
        const abs = path.join(destDir, rel);
        const previous = previousPath(abs);
        // Still the file the statement named, asked of the filesystem before
        // anything is removed. Two entries can resolve to ONE file: a release
        // that changes only the case of a name retires `Notes.md` and ships
        // `notes.md`, and a case-folding target makes those one path — and
        // their two reserved names one path as well. Without this guard the
        // second pass cleared the reserved name the first had just moved the
        // user's bytes into, then threw a raw ENOENT renaming a file that was
        // no longer there. That is the `recordedAs` lesson from PR #54, one
        // suffix along: identity is the filesystem's answer, not the
        // spelling's.
        //
        // The hash is the second half of the same question. A destination that
        // changed under the run would be moved aside under a hash that no
        // longer describes it, and a rollback could never identify it again —
        // so it is left where it is and the copy overwrites it, which is what
        // --force asked for and what `alteredFiles` already refused without it.
        if (await destinationState(abs) !== 'file') continue;
        if (await hashFile(abs) !== keep[rel]) continue;
        // The name belongs to this tool, and the collision check refused a
        // file the user had put there. What can still stand here is this
        // engine's own leftover, and recovery cleared those before this ran.
        await removeAt(previous);
        await fs.rename(abs, previous);
      }
      // Retire the empty directories the statement does not name. Nothing was
      // in them, so nothing has to come back.
      for (const rel of dropDirs) {
        const abs = path.join(destDir, rel);
        await removeAt(abs);
        await pruneEmpty(path.dirname(abs), destDir);
      }
      // Retirement is what makes a file-to-directory release transition
      // possible: a release can replace a directory of files with a single file
      // of the same name, and `copyFile` cannot write over a directory. Doing it
      // after the copies made that transition impossible to complete, with or
      // without --force.
      //
      // The pruning a retired path's directory would get happens in the sweep
      // instead, because the bytes moved aside are still sitting in it.

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
        files.set(rel, await hashFile(staged));
        // The statement was made from the source before the copy, and it is
        // what lets a later command prove this file is ours. A source that
        // changed in between would put bytes at the destination that no
        // statement names, so the run stops while the only thing on disk is a
        // staging file that recovery removes by name.
        if (files.get(rel) !== stated[rel]) {
          throw new Error(
            `"${name}" changed in ${skill.dir} while this command was running. Run again.`);
        }
        await fs.rename(staged, to);
      }

      // The commit. It records the files in one write, so a run that dies
      // before it leaves the statement standing for the next one.
      const withRecord = recordSkill(manifest, {
        name, tier: skill.tier, pathway, files: Object.fromEntries(files), now,
      });
      if (!setAside.length) {
        // Nothing was moved aside, so the record and the withdrawal are one
        // write — the shape a first install has always had, and the one the
        // conformance suite compares.
        manifest = clearPending(withRecord, name);
        identity = await writeManifest(targetDir, manifest, identity);
        committed = true;
        installed.push(name);
      } else {
        // The record and the mark that turns the statement forwards go on disk
        // together. That single write is the commit: before it, a recovery
        // rolls this run back, and after it, no recovery can — the same write
        // that makes the new version the recorded one makes the old bytes
        // rubbish to be swept.
        manifest = markCommitted(withRecord, name);
        identity = await writeManifest(targetDir, manifest, identity);
        committed = true;
        installed.push(name);
        // Tidying, after the fact. The statement stays on disk until the bytes
        // it names are gone, so a run killed in here leaves them reachable from
        // a record that was written before them — which is the whole of the
        // orphan rule, applied to the one thing this change adds to a tree.
        await sweepKept(targetDir, name, statement);
        manifest = clearPending(manifest, name);
        identity = await writeManifest(targetDir, manifest, identity);
      }
    } catch (err) {
      // The original failure is the one the caller needs. A failure inside the
      // undo leaves the pending statement on disk, which is exactly the state
      // the next command recovers from, so it is not worth reporting over the
      // error that caused it.
      //
      // Not once the record has landed. A rollback then would delete the files
      // the manifest names, and the statement on disk already says which
      // direction the next command must run.
      if (!committed) {
        await undo(
          targetDir, name, statement, Object.fromEntries(files)).catch(() => {});
      }
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
  return { installed, skipped, recovered, restored, cleared, emptied };
}
