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
export function contained(rel) {
  if (typeof rel !== 'string' || rel === '') return false;
  // A manifest travels between machines, so a key carries one separator: `/`.
  // `walk` records it, and every check here reads it. Where `path.sep` is `\`,
  // a backslash key would be one component to these checks and two to
  // `path.join`, so `..\victim` walks out of the tree with no `..` component
  // to find. The colon is Win32's other resolver hazard: `C:victim` is
  // relative to another drive's working directory, and `SKILL.md:payload` is
  // an alternate data stream on SKILL.md. Every one of these spellings means
  // something different to the one resolver that treats it specially, so all
  // of them are refused rather than translated — on every platform, because a
  // manifest written on one may be read on another. The one translation that
  // does happen lives in readManifest, which rewrites a legacy path.join key
  // before this check runs. A backslash that survives to here is refused.
  if (rel.includes('\\') || rel.includes(':')) return false;
  if (path.posix.isAbsolute(rel)) return false;
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
  const norm = path.posix.normalize(rel);
  if (norm !== rel) return false;
  // Normal form is not by itself containment. `..`, `.` and `a/` are all
  // already normal, and none of them names a file below this directory.
  const parts = norm.split('/');
  if (parts.includes('..')) return false;
  if (norm === '.' || norm.endsWith('/')) return false;
  // Normal form is not enough for a second reason: `path.normalize` is not the
  // resolver the filesystem uses. Win32 strips trailing spaces and periods from
  // a path component and `path.normalize` keeps them, so a key of `.. /victim`
  // is already normal, has no component equal to `..`, and is still resolved
  // through the parent directory. Any component whose spelling would be trimmed
  // is ambiguous between our check and the resolver, so it is refused rather
  // than interpreted.
  return !parts.some((part) => /[ .]+$/.test(part));
}

/** A skill name is one path segment, because it is joined as one. */
function nameContained(name) {
  return contained(name) && !name.includes('/') && name !== '.';
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

/**
 * Releases up to 0.2.0 built keys with path.join, so a Windows install
 * recorded agents\openai.yaml. Refusing that spelling would strand the
 * install: every command reads the manifest, so not even uninstall could
 * clean it up. The read rewrites the separator instead, and the rewritten
 * manifest faces the same containment gate as any other — an escape spelled
 * with backslashes is refused after the rewrite, exactly as it is spelled
 * with slashes. Two keys that rewrite onto one another are refused too,
 * because a silent merge would drop a recorded hash.
 */
function migrateLegacyKeys(manifest, targetDir) {
  if (!manifest?.skills) return manifest;
  // Built through Object.fromEntries, never by assignment, because
  // `__proto__` is a legal filename and a legal directory name. Assignment
  // into an object literal sets the prototype instead of creating a property,
  // and setting a prototype to a string is a silent no-op — the key vanishes,
  // and uninstall can never reach the file. fromEntries defines the property,
  // so the key survives.
  const skills = Object.entries(manifest.skills).map(([name, entry]) => {
    const pairs = [];
    const seen = new Set();
    for (const [rel, hash] of Object.entries(entry?.files ?? {})) {
      const key = rel.replaceAll('\\', '/');
      if (seen.has(key)) {
        throw new Error(
          `Manifest in ${targetDir} records "${key}" twice, once per separator.`);
      }
      seen.add(key);
      pairs.push([key, hash]);
    }
    return [name, { ...entry, files: Object.fromEntries(pairs) }];
  });
  return { ...manifest, skills: Object.fromEntries(skills) };
}

export async function readManifest(targetDir) {
  const abs = path.join(targetDir, MANIFEST_NAME);
  if (await regularOrAbsent(abs, targetDir) === 'absent') return emptyManifest();
  let raw;
  let fh;
  try {
    fh = await fs.open(abs, 'r');
  } catch (err) {
    // The file was there a moment ago and is gone now. Treat it as absent
    // rather than as a crash, which is what a caller would see otherwise.
    if (err.code === 'ENOENT') return emptyManifest();
    throw err;
  }
  try {
    // The classification and the read are two calls, and a link put here
    // between them is followed by the read. Comparing what the HANDLE holds
    // against what stands at the path settles it: they differ exactly when
    // the path is no longer the file that was classified.
    const byHandle = await fh.stat();
    const byPath = await fs.lstat(abs).catch(() => null);
    if (!byHandle.isFile() || byHandle.dev !== byPath?.dev || byHandle.ino !== byPath?.ino) {
      throw new Error(
        `Manifest in ${targetDir} changed while this command was reading it. Run again.`);
    }
    raw = await fh.readFile('utf8');
  } finally {
    await fh.close();
  }
  return checkContained(
    migrateLegacyKeys(checkShape(JSON.parse(raw), targetDir), targetDir), targetDir);
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
  const existed = await regularOrAbsent(abs, targetDir) === 'file';
  const body = `${JSON.stringify({ ...manifest, stylewrightVersion: VERSION }, null, 2)}\n`;

  // Creating and replacing are different operations, and one mechanism cannot
  // be both. `wx` creates and refuses an existing destination. A rename
  // replaces and refuses nothing, so using it to create let two first-time
  // installs into one directory each copy their files while the second
  // manifest recorded only its own, orphaning the first install's.
  //
  // An earlier version of this fix created through a hard link. That refuses
  // correctly and does not exist on every filesystem, and the skill files are
  // already copied by the time this runs, so a target that rejects links would
  // have left every first install on disk with no manifest able to remove it.
  if (!existed) {
    await fs.writeFile(abs, body, { flag: 'wx' }).catch((err) => {
      if (err.code !== 'EEXIST') throw err;
      throw new Error(
        `Manifest in ${targetDir} appeared while this command was writing it. Run again.`);
    });
    return;
  }

  // Replacing. Write beside it and rename over it, so no reader sees half a
  // manifest and no write passes through a link that appears after the check.
  const tmp = `${abs}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  // A rename replaces the file AND its mode. Somebody who set 0600 on their
  // manifest had it widened to whatever the umask gives on the next update.
  //
  // The mode is read BEFORE the temporary file is created and passed to the
  // creation, so the manifest body never sits on disk under a wider mode than
  // the file it replaces. Creating first and narrowing afterwards left that
  // window open, and a crash inside it left the widened file behind.
  const mode = await fs.stat(abs).then((st) => st.mode & 0o7777, () => null);
  try {
    await fs.writeFile(tmp, body, mode === null ? { flag: 'wx' } : { flag: 'wx', mode });
    // The umask trims the creation mode and never widens it, so this restores
    // a bit the umask took and cannot be the first thing to grant one.
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
