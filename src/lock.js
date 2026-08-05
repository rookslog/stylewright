import fs from 'node:fs/promises';
import path from 'node:path';
import { destinationState } from './tree.js';

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
export async function withTargetLock(targetDir, run, { create = true } = {}) {
  const abs = path.join(targetDir, LOCK_NAME);
  if (!create && await destinationState(targetDir) !== 'directory') {
    // Nothing to hold. A directory that does not exist holds no work of ours,
    // and creating one to lock it is how `uninstall` used to leave a skills
    // directory behind on a machine that never had one.
    return run();
  }
  await fs.mkdir(targetDir, { recursive: true });
  try {
    await fs.writeFile(abs, '', { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    throw new Error(
      `Another stylewright command is working in ${targetDir}. Run again when it `
      + `has finished, or remove ${abs} if no other run is active.`);
  }
  try {
    return await run();
  } finally {
    await fs.rm(abs, { force: true });
  }
}
