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
/**
 * Is `p` strictly below `stopAt`?
 *
 * Two steps, and both were got wrong once. `path.relative` first, because a
 * string prefix on the absolute paths treats `/x/skills-other` as living under
 * `/x/skills`. Then SEGMENTS on the result, not a prefix on that either: a
 * directory legitimately named `..cache` yields a relative path of `..cache`,
 * which `startsWith('..')` reads as an escape, so it is never pruned and keeps
 * its parents alive after the manifest entry is gone.
 *
 * The second mistake was made twice, in two functions, the second of them under
 * a comment warning about the first. That is why it is a named predicate now.
 */
export function isBelow(stopAt, p) {
  const rel = path.relative(stopAt, p);
  if (rel === '' || path.isAbsolute(rel)) return false;
  return !rel.split(path.sep).includes('..');
}

export async function ensureDir(dir, stopAt) {
  const rel = path.relative(stopAt, dir);
  if (isBelow(stopAt, dir)) {
    let current = stopAt;
    for (const part of rel.split(path.sep).filter((p) => p && p !== '.')) {
      current = path.join(current, part);
      const state = await destinationState(current);
      if (state !== 'absent' && state !== 'directory') await removeAt(current);
    }
  }
  await fs.mkdir(dir, { recursive: true });
}

/**
 * The directory components of `rel`, outermost first.
 *
 * `rel` is a manifest key or a `walk` result, and both spell their separator
 * `/` on every platform. Splitting on `path.sep` instead found no ancestors at
 * all on Windows, so the symlink checks consuming this list inspected nothing.
 */
export function ancestorsOf(rel) {
  const parts = rel.split('/').slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

/**
 * Directory components of `rels`, under `baseDir`, that hold something other
 * than a directory.
 *
 * A path's ancestors belong to the operation. `fs.rm` and `fs.copyFile` both
 * resolve them, so a symbolic link in the middle of a path sends the operation
 * out of the tree, and `lstat` below a file component reports ENOTDIR, which
 * reads as absent. Checking only the leaf let an install write outside the
 * target and an uninstall delete outside it.
 *
 * `exempt` states the one difference between the callers rather than giving
 * each its own copy of the walk. Install exempts a recorded ancestor that is
 * still a plain file, because that is the file-to-directory release transition
 * and retirement completes it. Uninstall exempts nothing: it only ever removes
 * beneath these paths, and a non-directory there means the record is wrong.
 */
/**
 * Which directory components refuse to be walked, and which paths survive them.
 *
 * It returns `reachable` as well as `blocked` because returning only `blocked`
 * is what produced the same finding at four separate call sites. Every consumer
 * has to inspect its leaves — hash them, classify them, decide whether to
 * remove them — and each one had to remember on its own not to inspect a leaf
 * that sits under a blocker it had just been handed. Three of them forgot. A
 * leaf below a blocker is refused whatever it turns out to be, so reaching for
 * it buys nothing and spends an `lstat` through the very thing we refused to
 * trust: a self-referential symlink throws `ELOOP` out of the command instead
 * of a polite refusal, and a FIFO hangs the hash read rather than throwing.
 *
 * Handing back the safe set makes the safe thing the easy thing. A caller that
 * ignores `reachable` and iterates its own paths is now visibly doing that.
 *
 * Three rules, and each one was a finding:
 *
 * 1. `baseDir` ITSELF is classified. Starting below it meant a skill directory
 *    replaced by a symlink to another installation was never seen, and the
 *    removal then ran inside that other installation.
 * 2. A path stops at its FIRST blocker. Recording `references` and then
 *    inspecting `references/deep` resolves the second `lstat` through the
 *    blocker, which is the throw we are trying to prevent.
 * 3. Results are memoised per directory, so a shared ancestor costs one syscall
 *    however many recorded paths pass through it.
 */
export async function reachability(baseDir, rels, exempt = () => false) {
  const baseState = await destinationState(baseDir);
  if (baseState !== 'absent' && baseState !== 'directory') {
    return { baseBlocked: true, blocked: new Set(), reachable: [] };
  }
  const blocked = new Set();
  const seen = new Map();
  const reachable = [];
  for (const rel of rels) {
    let open = true;
    for (const dir of ancestorsOf(rel)) {
      if (!seen.has(dir)) {
        const state = await destinationState(path.join(baseDir, dir));
        const bad = state !== 'absent' && state !== 'directory' && !exempt(dir, state);
        seen.set(dir, bad);
        if (bad) blocked.add(dir);
      }
      if (seen.get(dir)) { open = false; break; }
    }
    if (open) reachable.push(rel);
  }
  return { baseBlocked: false, blocked, reachable };
}

/**
 * Every file under `dir`, as paths relative to it, sorted.
 *
 * Joined with `/` and not `path.sep`, because these become manifest keys and a
 * manifest travels between machines. `path.join` recorded `references\guide.md`
 * on Windows, a spelling every other platform's read refuses.
 */
export async function walk(dir, base = '') {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
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
  while (current !== stopAt && isBelow(stopAt, current)) {
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
