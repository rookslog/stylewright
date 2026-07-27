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
  if (typeof rel !== 'string' || rel === '' || path.isAbsolute(rel)) return false;
  const norm = path.normalize(rel);
  if (norm.split(path.sep).includes('..')) return false;
  // Scanning for `..` is not sufficient, because normalization can consume every
  // one of them and leave nothing to find. `.` and `sub/..` both normalize to
  // `.`, and `path.join` then yields the skill directory rather than a file in
  // it — which `removeAt` deletes whole, taking the files the manifest never
  // recorded. A trailing separator reaches a directory the same way. The rule
  // the check is really making is that a recorded path names a file BELOW the
  // directory, so state that, rather than enumerate the ways to escape it.
  return norm !== '.' && !norm.endsWith(path.sep);
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
