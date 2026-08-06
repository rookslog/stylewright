import fs from 'node:fs/promises';
import path from 'node:path';


export const LOCK_NAME = '.stylewright-lock';

/**
 * One writer at a time in a target directory.
 *
 * Three review rounds produced findings that were all the same shape: two runs
 * inside one directory, each acting on a reading the other had already
 * invalidated. A recovery cleared a statement the other run was still writing
 * under. An undo withdrew a statement another run had replaced. A deletion was
 * decided from a snapshot that a commit had overtaken. Each was patched, and the
 * next round found the next one, because the tree cannot be read and changed in
 * one step and no amount of rechecking makes it so.
 *
 * `wx` is the one test and set the filesystem offers, so this uses it once, for
 * the whole command. A run either holds the directory or does not act on it. A
 * statement found while holding it belongs to a run that is not writing, because
 * a run that was writing would hold this.
 *
 * **A killed run leaves the file behind, and the next command refuses.** That is
 * the cost, and it is deliberate: telling a live run from a dead one needs
 * either an advisory lock that Node does not expose, or a staleness timeout,
 * which is a guess that deletes a live run's files when it is wrong. The message
 * names the file, and removing it is the one thing only a person can be sure
 * about.
 */
/**
 * Is a run holding this directory?
 *
 * Every command that READS a manifest asks this first. A held directory is one
 * a run may be changing, so its manifest is a picture in motion — and a killed
 * run could have left it mid-write, which used to reach the user as a JSON
 * parse error rather than the name of the file to remove.
 */
export async function isLocked(targetDir) {
  return fs.stat(path.join(targetDir, LOCK_NAME)).then(() => true, () => false);
}

/**
 * A refusal caused by another run holding the directory, carried as a code so
 * a caller can tell it from every other failure. `update` skips a held
 * directory and reports it, and matching on the message is the drift the
 * STALE code in manifest.js already refused once.
 */
const HELD = 'ESTYLEWRIGHTHELD';

export function isHeldError(err) {
  return err?.code === HELD;
}

export async function withTargetLock(targetDir, run, { create = true } = {}) {
  const abs = path.join(targetDir, LOCK_NAME);
  if (create) await fs.mkdir(targetDir, { recursive: true });
  try {
    // The acquisition is also the existence test. Asking `stat` first and
    // running unlocked on "absent" left a window: a concurrent install could
    // create and populate the directory between the look and the callback,
    // which then deleted a fresh install while holding nothing. `wx` through
    // the path resolves a symlinked target the way every other write does,
    // and it fails ENOENT exactly when there is no directory to hold.
    await fs.writeFile(abs, '', { flag: 'wx' });
  } catch (err) {
    // ENOTDIR is the same answer through a different door: the user has a
    // FILE standing at the target path, so nothing of ours is under it and
    // there is no directory to hold.
    if ((err.code === 'ENOENT' || err.code === 'ENOTDIR') && !create) {
      // No directory existed at the moment of acquisition, and creating one
      // to lock it is how `uninstall` used to leave a skills directory behind
      // on a machine that never had one. The callback is told, and must
      // answer from that fact alone — never from a fresh look at a tree that
      // may have appeared since, because nothing here holds it.
      return run({ absent: true });
    }
    if (err.code !== 'EEXIST') throw err;
    const held = new Error(
      `Another stylewright command is working in ${targetDir}. Run again when it `
      + `has finished, or remove ${abs} if no other run is active.`);
    held.code = HELD;
    throw held;
  }
  try {
    return await run();
  } finally {
    await fs.rm(abs, { force: true });
  }
}
