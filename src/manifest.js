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
  // `pending` is the record a run writes BEFORE it copies, and recovery reads
  // it as a list of files to delete. That makes it the same kind of thing the
  // `skills` map is — a delete instruction executed verbatim — so it is held to
  // the same shape rule rather than trusted for being ours.
  if (manifest.pending !== undefined) {
    if (!isObject(manifest.pending)) refuse('"pending" is not an object');
    for (const [name, rels] of Object.entries(manifest.pending)) {
      if (!Array.isArray(rels)) refuse(`"pending" lists no paths for "${name}"`);
      for (const rel of rels) {
        if (typeof rel !== 'string') refuse(`"pending" lists a path that is not a string for "${name}"`);
      }
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
  for (const [name, rels] of Object.entries(manifest.pending ?? {})) {
    if (!nameContained(name)) {
      throw new Error(
        `Manifest in ${targetDir} awaits a skill name that is not a directory name: "${name}".`);
    }
    for (const rel of rels) {
      if (!contained(rel)) {
        throw new Error(
          `Manifest in ${targetDir} awaits a path outside "${name}": "${rel}".`);
      }
    }
  }
  return manifest;
}

/**
 * The manifest, and the identity of the file it came out of.
 *
 * A command that writes has to know which file it read, because the decision
 * between creating and replacing belongs to that reading and not to a fresh
 * look. Taking a fresh look is what let two first-time installs into one
 * directory both succeed: the second read absence, the first created the
 * manifest, and the second then classified the file as existing and replaced
 * it, recording only its own skills while the first install's files stayed on
 * disk with nothing naming them.
 *
 * `null` means the read found no manifest. Otherwise it is the device and
 * inode of the file whose bytes were parsed — taken from the open handle, so
 * it names what was read and not what stands at the path now.
 */
export async function readManifestWithIdentity(targetDir) {
  const abs = path.join(targetDir, MANIFEST_NAME);
  const absent = { manifest: emptyManifest(), identity: null };
  if (await regularOrAbsent(abs, targetDir) === 'absent') return absent;
  let raw;
  let identity;
  let fh;
  try {
    fh = await fs.open(abs, 'r');
  } catch (err) {
    // The file was there a moment ago and is gone now. Treat it as absent
    // rather than as a crash, which is what a caller would see otherwise.
    if (err.code === 'ENOENT') return absent;
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
    identity = { dev: byHandle.dev, ino: byHandle.ino };
  } finally {
    await fh.close();
  }
  return {
    manifest: checkContained(checkShape(JSON.parse(raw), targetDir), targetDir),
    identity,
  };
}

export async function readManifest(targetDir) {
  return (await readManifestWithIdentity(targetDir)).manifest;
}

/** Two readings of the manifest path that name the same file. */
function sameFile(a, b) {
  return a !== null && b !== null && a.dev === b.dev && a.ino === b.ino;
}

/**
 * A refusal caused by another run rather than by anything wrong with the
 * request. A caller that has already changed the tree can act on it — by
 * reading again and reapplying — where a caller that has not must simply stop.
 * The distinction is carried by a code rather than by matching on the message,
 * which drifts.
 */
const STALE = 'ESTYLEWRIGHTSTALE';

function stale(message) {
  const err = new Error(message);
  err.code = STALE;
  return err;
}

export function isStale(err) {
  return err?.code === STALE;
}

/**
 * The one path this module writes beside the manifest, and the exclusion that
 * admits a single writer.
 *
 * Its name is fixed rather than random. `wx` is the only test and set POSIX
 * offers, so a fixed name turns the temporary file into the lock: a second
 * writer's creation fails, and the rename that commits the manifest is also
 * what releases it, in one step with nothing in between.
 */
function tmpPath(abs) {
  return `${abs}.tmp`;
}

async function identityAt(abs, targetDir) {
  if (await regularOrAbsent(abs, targetDir) === 'absent') return null;
  const st = await fs.lstat(abs).catch((err) => {
    if (err.code === 'ENOENT') return null;
    throw err;
  });
  return st?.isFile() ? { dev: st.dev, ino: st.ino } : null;
}

/**
 * What goes on disk: the release stamp, and no empty pending record.
 *
 * `pending` names files a run may have created and not yet recorded, so an
 * empty one names nothing. Dropping the key here rather than at each writer
 * keeps a finished run's manifest identical to the one the release before this
 * wrote, which is what the conformance suite compares.
 */
function stamped(manifest) {
  const out = { ...manifest, stylewrightVersion: VERSION };
  if (!out.pending || Object.keys(out.pending).length === 0) delete out.pending;
  return out;
}

/**
 * The stamp names the release that last wrote this file, not the one that
 * created it. It is applied here rather than by the caller, because a caller
 * can forget: install stamped the manifest and uninstall did not, so a partial
 * uninstall left the file claiming a release that had not touched it.
 */
export async function writeManifest(targetDir, manifest, expected) {
  // The third argument is what the command read, and there is no default for
  // it. A default would be the defect: `writeManifest` classified the path
  // afresh, which is a different question from "is this still the file I read",
  // and every caller inherited the wrong answer. A new caller now has to say.
  if (expected === undefined) {
    throw new TypeError(
      'writeManifest needs the manifest identity its caller read. Pass null when the read found none.');
  }
  await fs.mkdir(targetDir, { recursive: true });
  const abs = path.join(targetDir, MANIFEST_NAME);
  const body = `${JSON.stringify(stamped(manifest), null, 2)}\n`;
  const tmp = tmpPath(abs);
  // Before either branch, and on both of them: a manifest that is a link or a
  // directory is refused whatever the caller read. Classifying only on the way
  // to a replacement would have left the creating branch writing at a path
  // nothing had inspected. The answer is not kept, because a classification is
  // stale the moment it is taken — the comparison that matters happens below,
  // inside the exclusion.
  await regularOrAbsent(abs, targetDir);

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
  //
  // WHICH operation this is comes from `expected`, not from the path. A read
  // that found nothing creates, and it creates whatever appeared since.
  if (expected === null) {
    await fs.writeFile(abs, body, { flag: 'wx' }).catch((err) => {
      if (err.code !== 'EEXIST') throw err;
      throw stale(
        `Manifest in ${targetDir} appeared while this command was writing it. Run again.`);
    });
    return identityAt(abs, targetDir);
  }

  // Replacing. Write beside it and rename over it, so no reader sees half a
  // manifest and no write passes through a link that appears after the check.
  //
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
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    throw stale(
      `Another run is writing the manifest in ${targetDir}. Run again, `
      + `or remove ${tmp} if no other run is active.`);
  }
  try {
    // Compared while the exclusion is held, and released by the rename that
    // acts on the comparison. Comparing before taking it was the defect a
    // reviewer reproduced: two runs both saw the file they had read, and the
    // second rename overwrote a record the first had just committed, stranding
    // the files that record named. The order here is what makes the answer
    // still true when it is acted on.
    if (!sameFile(await identityAt(abs, targetDir), expected)) {
      throw stale(`Manifest in ${targetDir} changed while this command was running. Run again.`);
    }
    // The umask trims the creation mode and never widens it, so this restores
    // a bit the umask took and cannot be the first thing to grant one.
    if (mode !== null) await fs.chmod(tmp, mode);
    await fs.rename(tmp, abs);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  return identityAt(abs, targetDir);
}

/**
 * Remove the manifest, and only the file the command read.
 *
 * `uninstall` deletes it when the last skill goes, and it deleted whatever
 * stood at the path. A manifest another run created after this one read the
 * directory names that run's files, so removing it orphans them — the same
 * defect as replacing it, through the other door.
 */
export async function removeManifest(targetDir, expected) {
  const abs = path.join(targetDir, MANIFEST_NAME);
  const tmp = tmpPath(abs);
  // The same exclusion a replacement takes, for the same reason: the comparison
  // and the act on it must not have another run's write between them.
  try {
    await fs.writeFile(tmp, '', { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    throw stale(
      `Another run is writing the manifest in ${targetDir}. Run again, `
      + `or remove ${tmp} if no other run is active.`);
  }
  try {
    const observed = await identityAt(abs, targetDir);
    if (observed === null) return; // Already gone. Nothing to remove and nothing to refuse.
    if (!sameFile(observed, expected)) {
      throw stale(`Manifest in ${targetDir} changed while this command was running. Run again.`);
    }
    await fs.rm(abs, { force: true });
  } finally {
    await fs.rm(tmp, { force: true });
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
