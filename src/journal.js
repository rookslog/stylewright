import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashFile } from './manifest.js';
import {
  destinationState, removeAt, pruneEmpty, reachability, ensureDir,
} from './tree.js';

/**
 * Which recorded key, if any, names the file that `rel` RESOLVES to?
 *
 * Asked of the filesystem, not guessed from the platform. A case-folding target
 * makes two spellings one file, so acting through the stated one acts on the
 * file the record still names. A case-sensitive target makes them two files,
 * where the record names one of them and the other is nobody's by that record.
 * Identity, not spelling, is the comparison — the same rule the manifest read
 * applies to its own handle.
 *
 * It answers with the key rather than with a verdict, because identity settles
 * WHICH record reaches the file and not what that record says, and one caller
 * has to read the content the record claims.
 */
async function recordedAs(destDir, rel, recorded) {
  const keys = Object.keys(recorded).filter((k) => k.toLowerCase() === rel.toLowerCase());
  if (!keys.length) return null;
  // A path names itself on every filesystem, so the record at that spelling
  // needs no resolver and no file on disk to reach.
  if (keys.includes(rel)) return rel;
  const here = await fs.lstat(path.join(destDir, rel)).catch(() => null);
  if (!here) return null;
  for (const k of keys) {
    const there = await fs.lstat(path.join(destDir, k)).catch(() => null);
    if (there && here.dev === there.dev && here.ino === there.ino) return k;
  }
  return null;
}

/**
 * The record a run writes before it copies, and the recovery that reads it.
 *
 * An atomic manifest write stops a torn record. It does not stop a record that
 * disagrees with the tree: `installSkills` copied every file and wrote one
 * record at the end, so a run that died after the copies left files on disk
 * that nothing named, and `uninstall` removes only what the manifest records.
 *
 * The order is the fix. A run states which paths it is about to write AND what
 * it is about to write there, commits that statement, and only then copies.
 * Every file it can create is therefore named by a record that was on disk
 * before the file was, whatever kills the run and however far it got. The next
 * command deletes what the interrupted one left.
 *
 * This is not a rollback. A rollback runs inside the process that failed, and
 * the failure that matters here — the process being killed — is the one that
 * never reaches it.
 *
 * The statement lives IN the manifest rather than in a file beside it, because
 * the commit has to record the files and withdraw the statement together. Two
 * files cannot be written in one step, and whichever order they were written in
 * would leave a window: a statement withdrawn first orphans the files it named,
 * and a record written first is a record of an install that may still fail.
 *
 * **The statement carries a hash per path, and that hash is what proves the
 * file is ours to delete.** Two review rounds went into the ownership question
 * and each answer was a guess: "every pending path is mine" deletes a file the
 * user created at one of those paths after the interrupted run, and "no
 * recorded path is mine" leaves a file this engine wrote at a path some other
 * run had recorded. A content match is not a guess. The engine copies a file
 * whole, through a staging name and a rename, so a path either holds the bytes
 * the run intended or holds something the run did not put there.
 *
 * **Orphan-free is not reversible, and the statement now carries both.** A run
 * that replaced files and then died left this run's bytes at those paths. The
 * recovery above removes them, because leaving them reads as an edit the user
 * made and every later command refuses the skill — and the bytes they replaced
 * were gone, because no process held them. A run killed after retirement left
 * the record naming a path it had already deleted. Both end in a record that
 * over-claims, which this engine repairs rather than prevents.
 *
 * A statement has three parts, and the second two are what close that gap.
 *
 * - `write` names each path the run will write, with the bytes it will put
 *   there. It is the statement PR #54 added, under a name.
 * - `keep` names each path the run will DESTROY — a file it overwrites and a
 *   file it retires alike — with the bytes that path held. Those bytes are
 *   moved aside under `PREVIOUS_SUFFIX` before the destination is touched, so
 *   a rollback puts them back. Where the bytes are gone the statement still
 *   names the path, and a rollback withdraws it from the record instead, which
 *   is the deletion half the record could not see before.
 * - `committed` marks the boundary between the two directions. Until it is set
 *   the run has recorded nothing, so a rollback runs backwards. It is set in
 *   the same manifest write that records the skill, so no reader sees the new
 *   record without it, and from there recovery only runs forwards: it deletes
 *   the moved-aside bytes and withdraws the statement.
 */

/**
 * Where a copy lands before it is renamed into place, and where the file it
 * replaces waits until the commit.
 *
 * `copyFile` writes into the destination and can be interrupted half way, which
 * leaves a fragment that nothing can identify. Staging and renaming means the
 * destination only ever holds a whole file, and the staging path is derived
 * from the destination rather than recorded, so recovery can find it from the
 * statement alone. The second name is derived the same way and for the same
 * reason: a run that died left only its statement, and the bytes it moved aside
 * have to be reachable from a stated path alone.
 *
 * Both names belong to this tool. A skill may ship neither, and install refuses
 * one that does — over every named skill before the first is copied, because a
 * rule about what a request may contain belongs with the other preflights.
 */
export const STAGING_SUFFIX = '.stylewright-part';
export const PREVIOUS_SUFFIX = '.stylewright-prev';

/** Every suffix this tool claims. Install refuses a shipped path ending in one. */
export const RESERVED_SUFFIXES = [STAGING_SUFFIX, PREVIOUS_SUFFIX];

/**
 * The longest one component of a path may be. Every filesystem this tool runs
 * on stops at 255 — bytes on ext4 and APFS, UTF-16 units on NTFS — and counting
 * bytes is the stricter of the two readings for the names a skill ships.
 */
const MAX_COMPONENT = 255;

/** `text`, shortened until it fits `limit` bytes, never splitting a character. */
function clipBytes(text, limit) {
  const chars = Array.from(text);
  while (chars.length && Buffer.byteLength(chars.join('')) > limit) chars.pop();
  return chars.join('');
}

/**
 * The staging basename for a destination basename.
 *
 * A suffix alone cannot be the whole answer. A skill may ship a name that is
 * legal and nearly as long as a component may be, and appending to it produces
 * a name the filesystem refuses — so the first install failed with
 * ENAMETOOLONG after committing its statement, and every later command failed
 * on the same path while trying to recover, leaving a target that only hand
 * editing the manifest could repair. A name that cannot be written is worse
 * than a name that cannot be read.
 *
 * So an over-long one is clipped and given a digest of the name it came from.
 * The digest is what keeps two clipped names apart, since clipping alone maps
 * every name sharing a long head onto one staging path. It is computed from the
 * destination and nothing else, which is the property recovery depends on: a
 * run that died left only its statement, and the next command has to reach the
 * staging path from the stated path alone.
 *
 * Short names — every name in practice — are untouched, so the staging file
 * beside a destination still reads as that destination's.
 */
function reservedName(base, suffix) {
  const plain = `${base}${suffix}`;
  if (Buffer.byteLength(plain) <= MAX_COMPONENT) return plain;
  const digest = crypto.createHash('sha256').update(base).digest('hex').slice(0, 16);
  const tail = `-${digest}${suffix}`;
  return `${clipBytes(base, MAX_COMPONENT - Buffer.byteLength(tail))}${tail}`;
}

/**
 * The same derivation over a manifest key, which is spelled with `/` on every
 * platform and so cannot go through `path`.
 */
function reservedKey(rel, suffix) {
  const parts = rel.split('/');
  parts[parts.length - 1] = reservedName(parts[parts.length - 1], suffix);
  return parts.join('/');
}

export const stagingName = (base) => reservedName(base, STAGING_SUFFIX);
export const previousName = (base) => reservedName(base, PREVIOUS_SUFFIX);

const reservedPath = (abs, suffix) => path.join(
  path.dirname(abs), reservedName(path.basename(abs), suffix));

export const stagingPath = (abs) => reservedPath(abs, STAGING_SUFFIX);
export const previousPath = (abs) => reservedPath(abs, PREVIOUS_SUFFIX);

export const stagingKey = (rel) => reservedKey(rel, STAGING_SUFFIX);
export const previousKey = (rel) => reservedKey(rel, PREVIOUS_SUFFIX);

/**
 * Does any component of `rel` end in a suffix this tool claims?
 *
 * Every segment, not the whole path. `A.stylewright-part/B` puts the reserved
 * name on a DIRECTORY, and the copy of a sibling `A` clears that directory as
 * its own scratch space — the same collision, one level up. Case-insensitively,
 * because a manifest travels and Windows and macOS fold case: a shipped
 * `A.STYLEWRIGHT-PART` aliases the staging name of a sibling `A` on those
 * targets, and recovery would clear a recorded installed file as scratch space.
 * Refused on every platform, like every other spelling that means something
 * different to one resolver.
 */
export function usesReservedName(rel) {
  return rel.split(/[\\/]/).some(
    (part) => RESERVED_SUFFIXES.some((suffix) => part.toLowerCase().endsWith(suffix)));
}

export function hasPending(manifest) {
  return Object.keys(manifest.pending ?? {}).length > 0;
}

/** The paths a statement says will be written, and the bytes each will hold. */
export const writesOf = (stated) => stated?.write ?? {};

/** The paths a statement says will be destroyed, and the bytes each held. */
export const keepsOf = (stated) => stated?.keep ?? {};

/** Has the run behind this statement already recorded its skill? */
export const isCommitted = (stated) => stated?.committed === true;

/**
 * The manifest, plus the statement that `name` is about to write `write` and
 * destroy what stands at every path in `keep`.
 *
 * `keep` is dropped when it is empty, so a first install writes the same
 * statement this engine wrote before there was a second half to state.
 */
export function addPending(manifest, name, write, keep = {}) {
  const stated = { write: { ...write } };
  if (Object.keys(keep).length) stated.keep = { ...keep };
  return { ...manifest, pending: { ...manifest.pending, [name]: stated } };
}

/**
 * The manifest, with the statement about `name` turned forwards.
 *
 * It is applied to the manifest that RECORDS the skill and written with it, in
 * one step. A reader that sees the new record therefore sees the mark, and no
 * recovery can roll back an install whose record has landed.
 */
export function markCommitted(manifest, name) {
  const stated = manifest.pending?.[name];
  return {
    ...manifest,
    pending: { ...manifest.pending, [name]: { ...stated, committed: true } },
  };
}

/**
 * The manifest, with `rels` taken out of what `name` records.
 *
 * This is the deletion half of a rollback. A run states the paths it destroys
 * before it destroys them, so a rollback that cannot put the bytes back can at
 * least stop the record naming a file that is gone — which is the over-claim
 * issue 55 opened on, arriving from the retirement side.
 */
export function withdrawRecorded(manifest, name, rels) {
  if (!rels.length) return manifest;
  // `hasOwn`, because `constructor` is a legal skill name and the bare lookup
  // hands this the prototype's member for it.
  if (!Object.hasOwn(manifest.skills ?? {}, name)) return manifest;
  const entry = manifest.skills[name];
  const files = { ...entry?.files };
  let dropped = false;
  for (const rel of rels) {
    if (!Object.hasOwn(files, rel)) continue;
    delete files[rel];
    dropped = true;
  }
  if (!dropped) return manifest;
  return { ...manifest, skills: { ...manifest.skills, [name]: { ...entry, files } } };
}

/** The manifest, with the statement about `name` withdrawn. */
export function clearPending(manifest, name) {
  const pending = { ...manifest.pending };
  delete pending[name];
  const out = { ...manifest, pending };
  if (Object.keys(pending).length === 0) delete out.pending;
  return out;
}

/**
 * Put `<targetDir>/<name>` back the way the interrupted run found it, and
 * report what went and what came back.
 *
 * Two rules, one per half of the statement.
 *
 * **A file goes when it holds exactly what the statement said would be written
 * there, and the manifest does not record that same content.** Both halves
 * carry weight.
 *
 * - The content match is the proof of ownership. A file the user wrote at a
 *   pending path does not match, so it stays and the ordinary collision check
 *   reports it. A file this engine wrote matches, whoever recorded the path.
 * - The record check keeps a file another run committed. When two runs install
 *   the same version, the winner's file is byte for byte what the loser meant
 *   to write, and deleting it would leave the winner's record naming nothing.
 *
 * Anything else is left where it is: a fragment cannot exist at a destination,
 * because a copy is staged and renamed, and a directory or a link at a pending
 * path is something this engine did not put there. The staging path itself is
 * removed whatever it holds, because its name belongs to this tool — unless it
 * resolves to a file the manifest records, which install refuses to ship and an
 * older release may still have left.
 *
 * **A file comes back when the bytes moved aside under `PREVIOUS_SUFFIX` are
 * exactly the ones the statement said stood there, and the destination is
 * absent.** The hash was taken before the rename that moved them, so a match
 * proves these are the bytes this run displaced. The destination being absent
 * is what stops a restore from overwriting a file another run committed at that
 * path: the deletion pass above keeps such a file, and this pass then leaves it
 * alone rather than burying it under an older version.
 *
 * A file at that name which does not match is left where it is. It is the one
 * thing content cannot identify, and the ordinary collision check names it at
 * the next install, which is the same disposition `refuseStaleWrite` gives the
 * other file this tool cannot prove it wrote. Removing it on the strength of
 * the name alone would be deleting bytes nothing can replace.
 *
 * A stated path that stays absent is reported in `missing`, because the record
 * still names it and the bytes are not coming back. The caller withdraws it.
 *
 * The paths are walked through `reachability` for the same reason every other
 * consumer is: a deletion must not travel through a symbolic link that appeared
 * in the middle of a recorded path.
 *
 * `wrote` is the paths this run actually copied, and only a caller still alive
 * to know them can pass it. Recovery cannot: it reads a statement some dead run
 * left, so it passes null and the content match is the whole of its proof. A
 * live undo does know, and knowledge beats proof — a file holding the stated
 * bytes at a path the run never reached is somebody else's work that happens to
 * match, and deleting it was a live run destroying a file it had not written.
 *
 * It narrows the destinations only. The staging name belongs to this tool at
 * every stated path, whether or not the copy got far enough to be counted, and
 * a fragment left by the copy that failed is exactly the one that was never
 * counted.
 */
export async function rollBack(targetDir, name, stated, manifest, wrote = null) {
  const destDir = path.join(targetDir, name);
  // `hasOwn`, because `constructor` is a legal skill name and a bare lookup
  // finds the prototype's member for it — an entry that does not exist reads
  // as one that does. The same class as a file named `__proto__`, one
  // property up.
  const recorded = Object.hasOwn(manifest.skills ?? {}, name)
    ? manifest.skills[name]?.files ?? {} : {};
  const write = writesOf(stated);
  const keep = keepsOf(stated);
  const removed = [];
  const restored = [];
  const missing = [];
  const writeRels = Object.keys(write).sort();
  const keepRels = Object.keys(keep).sort();

  // The deletions first, and THEN one reading for everything the kept half
  // does. What is load-bearing is the ORDER, not the number of readings: a
  // release transition makes the two halves of the statement change each
  // other's ground, so a reading taken before the deletions is wrong for the
  // kept half by the time it is used.
  //
  // A release that turns a recorded FILE into a directory states `references`
  // under `keep` and `references/guide.md` under `write`. While the copy stands,
  // the destination of `references` is a DIRECTORY, so the restore has nowhere
  // to put the old file — and the deletion that empties that directory happens
  // later in the same loop.
  //
  // A release going the other way, a recorded directory becoming a FILE, is the
  // mirror. While the new `references` file stands it BLOCKS `references/guide.md`,
  // so a single reachability reading drops the child, and the deletion that
  // removes the blocker happens after the reading that needed it gone.
  //
  // Both left the record naming a file that was absent, which is the
  // reconciliation this design promises, defeated exactly where the bytes could
  // not be restored.
  //
  // ONE reading serves the restores and the reconciliation together. A third,
  // taken between them, would have no scenario to answer: a statement cannot
  // hold both `X` and `X/y`, because `recordSkill` walks one source tree and a
  // path is a file or a directory there, not both. So no restore can block
  // another kept path, and a mutant that splits this reading cannot be made to
  // fail. It is not carried.
  const first = await reachability(destDir, writeRels);
  // The skill directory is not ours. Nothing under it is either.
  if (first.baseBlocked) return { removed: [], restored: [], missing: [] };
  for (const rel of first.reachable) {
    const abs = path.join(destDir, rel);
    const staged = stagingPath(abs);
    let took = false;
    {
      // A recorded file is never a staging leftover, whatever its name ends
      // with. The suffix belongs to this tool, but a manifest that records a
      // path spelled that way records an installed file, and removing it would
      // leave the record naming nothing. Install refuses to ship such a name in
      // any case, so only a manifest an older release wrote can carry one.
      //
      // Through the resolver, because the spelling answers a different question.
      // A case-folding target makes the staging path and a record spelled in
      // another case one file, which has to stay. A case-sensitive target makes
      // them two, where the record's file is not the one this removal reaches
      // and the scratch file beside it is ours — protecting that one by spelling
      // left it standing for the next install to refuse as a collision.
      //
      // No content test here, unlike the destination below. There the file is
      // provably this engine's, so a record that disagrees is a record to
      // restore from. Here the file is the record's own and deletion is the
      // irreversible move, so identity alone decides.
      if (await destinationState(staged) === 'file'
        && await recordedAs(destDir, stagingKey(rel), recorded) === null) {
        await removeAt(staged);
        took = true;
      }
      // Which record, if any, reaches this file. An interrupted case-only
      // rename leaves one file under two spellings on a case-folding target,
      // and the resolver is what executes the deletion, so the record that can
      // keep the file is the one at whichever spelling reaches it.
      const owner = await recordedAs(destDir, rel, recorded);
      if ((wrote === null || Object.hasOwn(wrote, rel))
        && await destinationState(abs) === 'file'
        && await hashFile(abs) === write[rel]
        // Content decides, not identity. A record naming these bytes is one
        // this deletion would leave pointing at nothing. A record naming other
        // bytes already disagrees with the disk, and keeping the file is what
        // makes every later update and uninstall refuse it as one the user
        // edited — deleting it leaves that record free to restore what it does
        // say.
        && (owner === null || recorded[owner] !== write[rel])) {
        await removeAt(abs);
        removed.push(`${name}/${rel}`);
        took = true;
      }
    }

    // Only where something went. Pruning after a path this pass left alone
    // would take an empty directory that was standing before the run began.
    if (took) await pruneEmpty(path.dirname(abs), destDir);
  }

  // Taken now that the deletions have happened and their emptied directories
  // are pruned. Everything the kept half does reads this.
  const kept = await reachability(destDir, keepRels);
  const keptOpen = kept.baseBlocked ? [] : kept.reachable;
  for (const rel of keptOpen) {
    const abs = path.join(destDir, rel);
    {
      const previous = previousPath(abs);
      // Content decides whether the file is ours. The destination decides
      // which way it goes. A file under the reserved name that does not match
      // is neither, and it is never touched.
      const mine = await destinationState(previous) === 'file'
        && await hashFile(previous) === keep[rel];
      let state = await destinationState(abs);
      let took = false;
      // An EMPTY directory is not an occupant. A recovery killed between a
      // deletion and the prune that follows it leaves one standing at a
      // recorded file's path, and that state was a fixed point: the restore saw
      // "not absent" and held the bytes, the reconciliation saw "not absent"
      // and never named the path, and every command then refused — install and
      // `--force` on the reserved name, uninstall on the file-against-directory
      // mismatch. The only exit left an unrecorded `.stylewright-prev` behind,
      // which is the orphan class PR #54 exists to prevent.
      //
      // Removing it destroys nothing, which is exactly the rule retirement
      // already applies to an empty directory, so this weakens no ownership
      // proof. Only where the bytes are ours to put back: an empty directory
      // this pass is not going to fill is not this pass's to remove.
      if (mine && state === 'directory' && !(await fs.readdir(abs)).length) {
        await fs.rmdir(abs);
        state = 'absent';
      }
      if (mine && state === 'absent') {
        // The deletion above can have pruned the directory out from under this,
        // and a retired path's directory may have gone with it. `ensureDir`
        // stops at the skill directory and clears only what `reachability` has
        // already passed.
        await ensureDir(path.dirname(abs), destDir);
        await fs.rename(previous, abs);
        restored.push(`${name}/${rel}`);
        took = false; // Nothing to prune. The directory holds this file again.
      } else if (mine) {
        // The destination is occupied, so these bytes have nowhere to go, and
        // what stands there decides whether they are still wanted. Only TWO
        // occupants supersede this file:
        //
        // - The copy this run made, which the deletion pass above kept because
        //   a record names those bytes.
        // - A version another run committed, whose record is live.
        //
        // Everything else leaves it held. **A file the user created after the
        // interrupted run**, at a path that was empty because this run had
        // emptied it, supersedes nothing — and for a retired path those held
        // bytes are the only copy left on the machine, since no release ships
        // them and no record can restore them. Deleting them to tidy a reserved
        // name would be this tool destroying work it did not create, which is
        // the one thing it must never do. A directory or a link at the
        // destination reaches the same answer through the same clause, because
        // `held` asks for content and only a plain file has any.
        //
        // So the file stays, and the ordinary collision check names it at the
        // next install. That is what the write half does with an unmatched
        // destination, and the two halves are the same rule.
        const held = state === 'file' ? await hashFile(abs) : null;
        const owner = await recordedAs(destDir, rel, recorded);
        const superseded = held !== null
          && (held === write[rel] || (owner !== null && recorded[owner] === held));
        if (superseded) {
          await removeAt(previous);
          took = true;
        }
      }
      if (took) await pruneEmpty(path.dirname(abs), destDir);
    }
  }

  // What could not come back. A path is reported only where the walk can reach
  // it: below a blocker this cannot say whether the file is there, and
  // withdrawing a record on a guess is the one move that cannot be undone.
  for (const rel of keptOpen) {
    if (await destinationState(path.join(destDir, rel)) === 'absent') missing.push(rel);
  }

  // Only when no record keeps the directory alive. A skill the manifest still
  // holds keeps its directory even when every file under it went, because the
  // record is what the next install restores from. `hasOwn` for the same
  // reason as above: a pending skill named `constructor` has no record, and
  // the inherited property made this condition say it did, so its emptied
  // directory was retained.
  if (!Object.hasOwn(manifest.skills ?? {}, name)) await pruneEmpty(destDir, targetDir);
  return { removed: removed.sort(), restored: restored.sort(), missing: missing.sort() };
}

/**
 * Delete the bytes a committed run moved aside, and report what went.
 *
 * This is the forward direction, and the record has already landed, so nothing
 * here decides anything: the statement named these paths, the run moved their
 * old contents to a name only this tool writes, and the new version is
 * recorded. The content match is still the test, because a file at that name
 * which does not match is one this run did not put there, and no reading of a
 * statement makes it ours to delete.
 */
export async function sweepKept(targetDir, name, stated) {
  const destDir = path.join(targetDir, name);
  const keep = keepsOf(stated);
  const { baseBlocked, reachable } = await reachability(destDir, Object.keys(keep));
  if (baseBlocked) return [];
  const swept = [];
  for (const rel of reachable) {
    const previous = previousPath(path.join(destDir, rel));
    if (await destinationState(previous) !== 'file') continue;
    if (await hashFile(previous) !== keep[rel]) continue;
    await removeAt(previous);
    swept.push(`${name}/${rel}`);
    // A retired path's directory was held open by this file alone, so the
    // pruning retirement could not do happens here.
    await pruneEmpty(path.dirname(previous), destDir);
  }
  return swept.sort();
}

/**
 * Clear every statement in `manifest`, and report what changed.
 *
 * It acts on the tree first and returns the cleared manifest for the caller to
 * write, rather than writing first and acting after. A run interrupted here has
 * to leave the statement standing, because the statement is the only thing that
 * can reach those files a second time.
 *
 * `committed` picks the direction, and it is the whole of the choice. An
 * uncommitted statement belongs to a run that recorded nothing, so this rolls
 * it back. A committed one belongs to a run whose record landed, so this
 * finishes what that run was doing.
 */
export async function recoverPending(targetDir, manifest) {
  const removed = [];
  const restored = [];
  const cleared = [];
  let out = manifest;
  for (const [name, stated] of Object.entries(manifest.pending ?? {})) {
    if (isCommitted(stated)) {
      await sweepKept(targetDir, name, stated);
    } else {
      const done = await rollBack(targetDir, name, stated, manifest);
      removed.push(...done.removed);
      restored.push(...done.restored);
      // The record names bytes this run destroyed and could not put back, so it
      // stops naming them. Applied to `out`, which carries the withdrawals made
      // for the statements before this one.
      out = withdrawRecorded(out, name, done.missing);
    }
    // Named whether or not anything moved. A run killed between the statement
    // and its first copy leaves nothing on disk, and withdrawing the statement
    // is still a change to a tree that a command must not report as no change
    // at all.
    cleared.push(name);
    out = clearPending(out, name);
  }
  return {
    manifest: out,
    removed: removed.sort(),
    restored: restored.sort(),
    cleared: cleared.sort(),
  };
}
