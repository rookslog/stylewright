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
  // `stat`, which follows a link, and not `lstat`. A target directory that is a
  // symbolic link is one every other write in this tool follows, so a lock that
  // read the link itself as "not a directory" skipped the exclusion exactly
  // where the work still happened — and a live run holding the real directory
  // could then have its files deleted underneath it.
  const there = await fs.stat(targetDir).then((st) => st.isDirectory(), () => false);
  if (!create && !there) {
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
