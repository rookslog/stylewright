import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
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
  // manifest written on one may be read on another.
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
function checkContained(manifest, targetDir) {
  for (const [name, entry] of Object.entries(manifest?.skills ?? {})) {
    if (!nameContained(name)) {
      throw new Error(
        `Manifest in ${targetDir} records a skill name that is not a directory name: "${name}".`);
    }
    for (const rel of Object.keys(entry?.files ?? {})) {
      if (!contained(rel)) {
        throw new Error(
          `Manifest in ${targetDir} records a path outside "${name}": "${rel}".`);
      }
    }
  }
  return manifest;
}

export async function readManifest(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, MANIFEST_NAME), 'utf8');
    return checkContained(JSON.parse(raw), targetDir);
  } catch (err) {
    if (err.code === 'ENOENT') return emptyManifest();
    throw err;
  }
}

/**
 * The stamp names the release that last wrote this file, not the one that
 * created it. It is applied here rather than by the caller, because a caller
 * can forget: install stamped the manifest and uninstall did not, so a partial
 * uninstall left the file claiming a release that had not touched it.
 */
export async function writeManifest(targetDir, manifest) {
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, MANIFEST_NAME),
    `${JSON.stringify({ ...manifest, stylewrightVersion: VERSION }, null, 2)}\n`);
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
