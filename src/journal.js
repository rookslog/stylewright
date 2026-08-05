import path from 'node:path';
import { destinationState, removeAt, pruneEmpty, reachability } from './tree.js';

/**
 * The record a run writes before it copies, and the recovery that reads it.
 *
 * An atomic manifest write stops a torn record. It does not stop a record that
 * disagrees with the tree: `installSkills` copied every file and wrote one
 * record at the end, so a run that died after the copies left files on disk
 * that nothing named, and `uninstall` removes only what the manifest records.
 *
 * The order is the fix. A run states which paths it is about to write, commits
 * that statement to the manifest, and only then copies. Every file it can
 * create is therefore named by a record that was on disk before the file was,
 * whatever kills the run and however far it got. The next command deletes what
 * the interrupted one left.
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
 */

export function hasPending(manifest) {
  return Object.keys(manifest.pending ?? {}).length > 0;
}

/** The manifest, plus the statement that `name` is about to receive `rels`. */
export function addPending(manifest, name, rels) {
  return { ...manifest, pending: { ...manifest.pending, [name]: [...rels] } };
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
 * Delete each of `rels` under `<targetDir>/<name>` that no record names, and
 * report what went.
 *
 * One rule decides every case: **a path the manifest records is never touched
 * here.** The defect being closed is a file that no record names, so a recorded
 * path is not an instance of it — `uninstall` reaches it, `install` compares it
 * against its hash, and both already know what to do with whatever it holds.
 *
 * An earlier draft of this went further and removed a recorded path whose
 * content no longer matched its hash, on the reasoning that a killed `copyFile`
 * leaves a fragment. Nothing on disk distinguishes that fragment from an edit
 * the user made after the interrupted run, so the rule deleted the user's work
 * without `--force` — the one thing this tool promises never to do. The cost of
 * the narrower rule is that an interrupted update can leave a fragment at a
 * recorded path, which install then refuses as locally modified and `--force`
 * overwrites. A refusal the user can act on beats a deletion they cannot undo.
 *
 * What is NOT a file is left alone as well: this engine writes files, so a
 * directory or a link at a pending path is something it did not put there. The
 * paths are walked through `reachability` for the same reason every other
 * consumer is — a deletion must not travel through a symbolic link that
 * appeared in the middle of a recorded path.
 */
export async function discardUnrecorded(targetDir, name, rels, manifest) {
  const destDir = path.join(targetDir, name);
  const recorded = manifest.skills?.[name]?.files ?? {};
  const { baseBlocked, reachable } = await reachability(destDir, rels);
  if (baseBlocked) return []; // The skill directory is not ours. Nothing under it is either.

  const removed = [];
  for (const rel of reachable) {
    if (Object.hasOwn(recorded, rel)) continue;
    const abs = path.join(destDir, rel);
    if (await destinationState(abs) !== 'file') continue;
    await removeAt(abs);
    await pruneEmpty(path.dirname(abs), destDir);
    removed.push(`${name}/${rel}`);
  }
  // Only when no record keeps the directory alive. A skill the manifest still
  // holds keeps its directory even when every file under it went, because the
  // record is what the next install restores from.
  if (!manifest.skills?.[name]) await pruneEmpty(destDir, targetDir);
  return removed.sort();
}

/**
 * Clear every pending statement in `manifest`, and report what was deleted.
 *
 * It deletes first and returns the cleared manifest for the caller to write,
 * rather than writing first and deleting after. A run interrupted here has to
 * leave the statement standing, because the statement is the only thing that
 * can reach the files a second time.
 */
export async function recoverPending(targetDir, manifest) {
  const removed = [];
  let out = manifest;
  for (const [name, rels] of Object.entries(manifest.pending ?? {})) {
    removed.push(...await discardUnrecorded(targetDir, name, rels, manifest));
    out = clearPending(out, name);
  }
  return { manifest: out, removed: removed.sort() };
}
