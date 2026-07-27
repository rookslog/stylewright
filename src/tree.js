import fs from 'node:fs/promises';
import path from 'node:path';

// Filesystem tree helpers shared by install and uninstall. They lived in the
// two modules separately until install also needed to prune, and a second copy
// is a second thing to drift.

/**
 * What sits at `abs`, from the point of view of code about to write over it or
 * remove it. Every such question goes through here.
 *
 * It exists because the answer was worked out separately at four call sites,
 * and each one got a different part of it wrong. `access` and `stat` follow a
 * symbolic link, so a link pointing outside the target tree read as absent and
 * the copy wrote through it. `rm` without `recursive` throws on a directory,
 * so a path that changed type between releases could not be cleared. One
 * classification, four consumers, and a new consumer inherits both answers.
 */
export async function destinationState(abs) {
  let st;
  try {
    st = await fs.lstat(abs); // lstat, never stat: the link itself is the thing.
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return 'absent';
    throw err;
  }
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isDirectory()) return 'directory';
  if (st.isFile()) return 'file';
  return 'other'; // A socket, a device node. Not ours, and not writable through.
}

/**
 * Remove whatever is at `abs`, whatever type it turns out to be. It classifies
 * the path itself rather than taking the answer, so a caller holding a state
 * from before some earlier step cannot remove on a stale reading.
 */
export async function removeAt(abs) {
  const state = await destinationState(abs);
  if (state === 'absent') return;
  await fs.rm(abs, { recursive: state === 'directory', force: true });
}

/**
 * Make `dir` exist as a directory, clearing anything of another type along the
 * way, and never rising above `stopAt`.
 *
 * `mkdir` with `recursive` still fails outright when a component of the path
 * is a file or a link: it throws EEXIST, and `lstat` on anything below that
 * component throws ENOTDIR, which reads as absent. So a user file at a name
 * the skill ships as a directory passed every collision check and then crashed
 * the copy, and a release that turned a shipped file into a directory could
 * not complete at all.
 */
export async function ensureDir(dir, stopAt) {
  const rel = path.relative(stopAt, dir);
  if (!rel.startsWith('..')) {
    let current = stopAt;
    for (const part of rel.split(path.sep).filter((p) => p && p !== '.')) {
      current = path.join(current, part);
      const state = await destinationState(current);
      if (state !== 'absent' && state !== 'directory') await removeAt(current);
    }
  }
  await fs.mkdir(dir, { recursive: true });
}

/** The directory components of `rel`, outermost first. */
export function ancestorsOf(rel) {
  const parts = rel.split(path.sep).slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join(path.sep));
}

/** Every file under `dir`, as paths relative to it, sorted. */
export async function walk(dir, base = '') {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = path.join(base, e.name);
    if (e.isDirectory()) out.push(...await walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

/**
 * Remove `dir` and its empty parents, stopping below `stopAt`. A directory that
 * still holds anything is left alone, which is what keeps a file the user added
 * from taking its directory with it.
 */
export async function pruneEmpty(dir, stopAt) {
  let current = dir;
  // `path.relative`, not a string prefix. `startsWith` treats /x/skills-other
  // as living under /x/skills, and would climb out of the tree it was given.
  while (current !== stopAt && !path.relative(stopAt, current).startsWith('..')) {
    let entries;
    try {
      entries = await fs.readdir(current);
    } catch {
      return;
    }
    if (entries.length) return;
    await fs.rmdir(current);
    current = path.dirname(current);
  }
}
