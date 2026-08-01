import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { destinationState } from './tree.js';
import { VERSION } from './version.js';

export const MANIFEST_NAME = '.stylewright-manifest.json';

export async function hashFile(absPath) {
  const buf = await fs.readFile(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function emptyManifest() {
  return { schema: 1, stylewrightVersion: VERSION, skills: {} };
}

/**
 * A path from the manifest that stays inside the directory it belongs to.
 *
 * `path.join` neutralises a leading separator and does not neutralise `..`, so
 * a recorded key of `../../../victim` resolves outside the tree. That was
 * harmless while the manifest was only a hint: the worst a bad entry could do
 * was cause a skip. Retirement made it a delete instruction, executed
 * verbatim, and a recorded `..` took the whole skills directory.
 */
function contained(rel) {
  if (typeof rel !== 'string' || rel === '' || path.isAbsolute(rel)) return false;
  // **The key must already be in normal form.** Every consumer joins the RAW
  // key, so a key that normalization would change is a key whose text and whose
  // effect disagree — and every containment escape found on this pull request
  // has been an instance of exactly that. `.` and `sub/..` normalize to `.`.
  // `a/.` and `a/b/..` normalize to `a`, an intermediate DIRECTORY, which
  // removeAt deletes recursively along with files the manifest never recorded.
  // `a//b` and `a/./b` name a file by a path that is not the recorded one.
  //
  // Four review rounds went into rejecting those one shape at a time, and each
  // round found another shape. This states the rule instead: the recorded text
  // is the resolved path, or the manifest is refused.
  //
  // It settles the separator question too. Where `path.sep` is `\`, the key
  // `link/file` is not in normal form, so it is refused rather than read as one
  // component by a check that splits on `path.sep` and as two by `path.join` —
  // which would walk a symlinked `link` that no ancestor check had inspected.
  const norm = path.normalize(rel);
  if (norm !== rel) return false;
  // Normal form is not by itself containment. `..`, `.` and `a/` are all
  // already normal, and none of them names a file below this directory.
  if (norm.split(path.sep).includes('..')) return false;
  if (norm === '.' || norm.endsWith(path.sep)) return false;
  // Normal form is not enough for a second reason: `path.normalize` is not the
  // resolver the filesystem uses. Win32 strips trailing spaces and periods from
  // a path component and `path.normalize` keeps them, so a key of `.. \victim`
  // is already normal, has no component equal to `..`, and is still resolved
  // through the parent directory. Any component whose spelling would be trimmed
  // is ambiguous between our check and the resolver, so it is refused rather
  // than interpreted. [REPORTED — the Win32 trimming rule is documented
  // behaviour; this repository has never run its tests on Windows.]
  return !norm.split(path.sep).some((part) => /[ .]+$/.test(part));
}

/** A skill name is one path segment, because it is joined as one. */
function nameContained(name) {
  return contained(name) && !name.includes('/') && !name.includes(path.sep)
    && name !== '.';
}

/**
 * The manifest is a plain file that anyone can edit, and every path in it is
 * dereferenced by install, update, uninstall and doctor. Checking it here means
 * those four inherit the check rather than each restating it — and one of them
 * restating it wrongly is the defect this whole pull request keeps finding.
 *
 * It refuses rather than dropping the bad entries. A manifest naming a path
 * outside its own directory is not a manifest with one bad row; it is a file we
 * should not act on at all.
 */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The manifest holds what this tool wrote, in the shape this tool writes.
 *
 * Containment was checked before shape, and the containment walk reached every
 * field through `?.`, so a file whose JSON parsed and whose shape was wrong
 * passed it. The wrong shape then surfaced as an unhandled type error deep in
 * install or uninstall — `Object.keys(entry.files)` on `undefined` — which
 * tells a user nothing about the file that caused it. Refusing here names the
 * file and the field.
 */
function checkShape(manifest, targetDir) {
  const refuse = (what) => {
    throw new Error(`Manifest in ${targetDir} is not one this tool wrote: ${what}.`);
  };
  if (!isObject(manifest)) refuse('the file does not hold an object');
  if (manifest.schema !== 1) refuse(`"schema" is ${JSON.stringify(manifest.schema)}, not 1`);
  if (!isObject(manifest.skills)) refuse('"skills" is not an object');
  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (!isObject(entry)) refuse(`"${name}" is not an object`);
    if (!isObject(entry.files)) refuse(`"${name}" records no files`);
    for (const [rel, hash] of Object.entries(entry.files)) {
      if (typeof hash !== 'string') refuse(`"${name}" records no hash for "${rel}"`);
    }
  }
  return manifest;
}

/**
 * The manifest is read through, written through, and acted on. A symbolic link
 * standing where it belongs sends all three somewhere else.
 *
 * `src/tree.js` classifies every destination install and uninstall touch, and
 * the manifest was the one path that never went through it. So a manifest
 * linked to a file elsewhere on disk was read through and then replaced with
 * manifest JSON, the link survived, and the command exited zero. No `--force`
 * was involved, because no check was involved.
 */
async function regularOrAbsent(abs, targetDir) {
  const state = await destinationState(abs);
  if (state === 'absent' || state === 'file') return state;
  throw new Error(
    `Manifest in ${targetDir} is a ${state}, not a regular file. Remove it and run again.`);
}

function checkContained(manifest, targetDir) {
  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (!nameContained(name)) {
      throw new Error(
        `Manifest in ${targetDir} records a skill name that is not a directory name: "${name}".`);
    }
    for (const rel of Object.keys(entry.files)) {
      if (!contained(rel)) {
        throw new Error(
          `Manifest in ${targetDir} records a path outside "${name}": "${rel}".`);
      }
    }
  }
  return manifest;
}

export async function readManifest(targetDir) {
  const abs = path.join(targetDir, MANIFEST_NAME);
  if (await regularOrAbsent(abs, targetDir) === 'absent') return emptyManifest();
  let raw;
  try {
    raw = await fs.readFile(abs, 'utf8');
  } catch (err) {
    // The file was there a moment ago and is gone now. Treat it as absent
    // rather than as a crash, which is what a caller would see otherwise.
    if (err.code === 'ENOENT') return emptyManifest();
    throw err;
  }
  return checkContained(checkShape(JSON.parse(raw), targetDir), targetDir);
}

/**
 * The stamp names the release that last wrote this file, not the one that
 * created it. It is applied here rather than by the caller, because a caller
 * can forget: install stamped the manifest and uninstall did not, so a partial
 * uninstall left the file claiming a release that had not touched it.
 */
export async function writeManifest(targetDir, manifest) {
  await fs.mkdir(targetDir, { recursive: true });
  const abs = path.join(targetDir, MANIFEST_NAME);
  await regularOrAbsent(abs, targetDir);
  const body = `${JSON.stringify({ ...manifest, stylewrightVersion: VERSION }, null, 2)}\n`;
  // Write beside it and rename over it. Two things follow, and both were
  // defects. A rename does not follow a symbolic link, so nothing this function
  // does can reach outside the directory even if the link appears between the
  // check above and the write. And a reader never sees half a manifest, because
  // the file is replaced in one step rather than truncated and refilled.
  //
  // The suffix is random so that two runs against one directory cannot fight
  // over the same temporary name. It never survives the call, so a manifest
  // still compares equal across install pathways.
  const tmp = `${abs}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tmp, body, { flag: 'wx' });
    // A rename replaces the file AND its mode. Somebody who set 0600 on their
    // manifest had it widened to whatever the umask gives on the next update,
    // which is a permission the tool loosened without being asked.
    const mode = await fs.stat(abs).then((st) => st.mode & 0o7777, () => null);
    if (mode !== null) await fs.chmod(tmp, mode);
    await fs.rename(tmp, abs);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

export function recordSkill(manifest, { name, tier, pathway, files, now }) {
  return {
    ...manifest,
    skills: {
      ...manifest.skills,
      [name]: { tier, pathway, installedAt: now, files },
    },
  };
}
