import fs from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from './manifest.js';
import { destinationState, removeAt, pruneEmpty, reachability } from './tree.js';

/**
 * Does the stated path RESOLVE to a file a recorded key names in different
 * case? Asked of the filesystem, not guessed from the platform: on a
 * case-folding target the two spellings are one file, and deleting through
 * the stated one takes the file the record still names. Identity, not
 * spelling, is the comparison — the same rule the manifest read applies to
 * its own handle.
 */
async function recordedThroughFold(destDir, rel, recorded) {
  const aliases = Object.keys(recorded).filter(
    (k) => k !== rel && k.toLowerCase() === rel.toLowerCase());
  if (!aliases.length) return false;
  const here = await fs.lstat(path.join(destDir, rel)).catch(() => null);
  if (!here) return false;
  for (const k of aliases) {
    const there = await fs.lstat(path.join(destDir, k)).catch(() => null);
    if (there && here.dev === there.dev && here.ino === there.ino) return true;
  }
  return false;
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
 */

/**
 * Where a copy lands before it is renamed into place.
 *
 * `copyFile` writes into the destination and can be interrupted half way, which
 * leaves a fragment that nothing can identify. Staging and renaming means the
 * destination only ever holds a whole file, and the staging path is derived
 * from the destination rather than recorded, so recovery can find it from the
 * statement alone.
 */
export const STAGING_SUFFIX = '.stylewright-part';

export function stagingPath(abs) {
  return `${abs}${STAGING_SUFFIX}`;
}

export function hasPending(manifest) {
  return Object.keys(manifest.pending ?? {}).length > 0;
}

/** The manifest, plus the statement that `name` is about to receive `files`. */
export function addPending(manifest, name, files) {
  return { ...manifest, pending: { ...manifest.pending, [name]: { ...files } } };
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
 * Delete what an interrupted run left under `<targetDir>/<name>`, and report
 * what went.
 *
 * One rule decides every case: **a file goes when it holds exactly what the
 * statement said would be written there, and the manifest does not record that
 * same content.** Both halves carry weight.
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
 * removed whatever it holds, because its name belongs to this tool — unless the
 * manifest records a file at that spelling, which install refuses to ship and
 * an older release may still have left.
 *
 * The paths are walked through `reachability` for the same reason every other
 * consumer is: a deletion must not travel through a symbolic link that appeared
 * in the middle of a recorded path.
 */
export async function discardStated(targetDir, name, stated, manifest) {
  const destDir = path.join(targetDir, name);
  // `hasOwn`, because `constructor` is a legal skill name and a bare lookup
  // finds the prototype's member for it — an entry that does not exist reads
  // as one that does. The same class as a file named `__proto__`, one
  // property up.
  const recorded = Object.hasOwn(manifest.skills ?? {}, name)
    ? manifest.skills[name]?.files ?? {} : {};
  const recordedFold = new Set(Object.keys(recorded).map((k) => k.toLowerCase()));
  const rels = Object.keys(stated ?? {});
  const { baseBlocked, reachable } = await reachability(destDir, rels);
  if (baseBlocked) return []; // The skill directory is not ours. Nothing under it is either.

  const removed = [];
  for (const rel of reachable) {
    const abs = path.join(destDir, rel);
    const staged = stagingPath(abs);
    let took = false;
    // A recorded file is never a staging leftover, whatever its name ends with.
    // The suffix belongs to this tool, but a manifest that records a path
    // spelled that way records an installed file, and removing it would leave
    // the record naming nothing. Compared case-insensitively, because on a
    // case-folding filesystem the staging path RESOLVES to a recorded file
    // whose spelling differs only in case, and install refused new ones but a
    // manifest an older release wrote can still record one.
    if (!recordedFold.has(`${rel}${STAGING_SUFFIX}`.toLowerCase())
      && await destinationState(staged) === 'file') {
      await removeAt(staged);
      took = true;
    }
    if (await destinationState(abs) === 'file'
      && await hashFile(abs) === stated[rel]
      && recorded[rel] !== stated[rel]
      // An interrupted case-only rename leaves one file under two spellings
      // on a case-folding target. The exact-key check above says unrecorded,
      // the resolver says this IS the recorded file, and the resolver is the
      // one that executes the deletion.
      && !(await recordedThroughFold(destDir, rel, recorded))) {
      await removeAt(abs);
      removed.push(`${name}/${rel}`);
      took = true;
    }
    // Only where something went. Pruning after a path this pass left alone
    // would take an empty directory that was standing before the run began.
    if (took) await pruneEmpty(path.dirname(abs), destDir);
  }
  // Only when no record keeps the directory alive. A skill the manifest still
  // holds keeps its directory even when every file under it went, because the
  // record is what the next install restores from. `hasOwn` for the same
  // reason as above: a pending skill named `constructor` has no record, and
  // the inherited property made this condition say it did, so its emptied
  // directory was retained.
  if (!Object.hasOwn(manifest.skills ?? {}, name)) await pruneEmpty(destDir, targetDir);
  return removed.sort();
}

/**
 * Clear every statement in `manifest`, and report what was deleted.
 *
 * It deletes first and returns the cleared manifest for the caller to write,
 * rather than writing first and deleting after. A run interrupted here has to
 * leave the statement standing, because the statement is the only thing that
 * can reach the files a second time.
 */
export async function recoverPending(targetDir, manifest) {
  const removed = [];
  const cleared = [];
  let out = manifest;
  for (const [name, stated] of Object.entries(manifest.pending ?? {})) {
    removed.push(...await discardStated(targetDir, name, stated, manifest));
    // Named whether or not a file went. A run killed between the statement and
    // its first copy leaves nothing on disk, and withdrawing the statement is
    // still a change to a tree that a command must not report as no change at
    // all.
    cleared.push(name);
    out = clearPending(out, name);
  }
  return { manifest: out, removed: removed.sort(), cleared: cleared.sort() };
}
