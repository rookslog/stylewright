import path from 'node:path';
import { hashFile } from './manifest.js';
import { destinationState, removeAt, pruneEmpty, reachability } from './tree.js';

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
 * removed whatever it holds — its name belongs to this tool.
 *
 * The paths are walked through `reachability` for the same reason every other
 * consumer is: a deletion must not travel through a symbolic link that appeared
 * in the middle of a recorded path.
 */
export async function discardStated(targetDir, name, stated, manifest) {
  const destDir = path.join(targetDir, name);
  const recorded = manifest.skills?.[name]?.files ?? {};
  const rels = Object.keys(stated ?? {});
  const { baseBlocked, reachable } = await reachability(destDir, rels);
  if (baseBlocked) return []; // The skill directory is not ours. Nothing under it is either.

  const removed = [];
  for (const rel of reachable) {
    const abs = path.join(destDir, rel);
    const staged = stagingPath(abs);
    let took = false;
    if (await destinationState(staged) === 'file') {
      await removeAt(staged);
      took = true;
    }
    if (await destinationState(abs) === 'file'
      && await hashFile(abs) === stated[rel]
      && recorded[rel] !== stated[rel]) {
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
  // record is what the next install restores from.
  if (!manifest.skills?.[name]) await pruneEmpty(destDir, targetDir);
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
  let out = manifest;
  for (const [name, stated] of Object.entries(manifest.pending ?? {})) {
    removed.push(...await discardStated(targetDir, name, stated, manifest));
    out = clearPending(out, name);
  }
  return { manifest: out, removed: removed.sort() };
}
