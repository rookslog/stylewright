import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashFile } from './manifest.js';
import { destinationState, removeAt, pruneEmpty, reachability } from './tree.js';

/**
 * Which recorded key, if any, names the file that `rel` RESOLVES to?
 *
 * Asked of the filesystem, not guessed from the platform. A case-folding target
 * makes two spellings one file, so acting through the stated one acts on the
 * file the record still names. A case-sensitive target makes them two files,
 * where the record names one of them and the other is nobody's by that record.
 * Identity, not spelling, is the comparison — the same rule the manifest read
 * applies to its own handle.
 *
 * It answers with the key rather than with a verdict, because identity settles
 * WHICH record reaches the file and not what that record says, and one caller
 * has to read the content the record claims.
 */
async function recordedAs(destDir, rel, recorded) {
  const keys = Object.keys(recorded).filter((k) => k.toLowerCase() === rel.toLowerCase());
  if (!keys.length) return null;
  // A path names itself on every filesystem, so the record at that spelling
  // needs no resolver and no file on disk to reach.
  if (keys.includes(rel)) return rel;
  const here = await fs.lstat(path.join(destDir, rel)).catch(() => null);
  if (!here) return null;
  for (const k of keys) {
    const there = await fs.lstat(path.join(destDir, k)).catch(() => null);
    if (there && here.dev === there.dev && here.ino === there.ino) return k;
  }
  return null;
}

/**
 * The record a run writes before it copies, and the recovery that reads it.
 *
 * An atomic manifest write stops a torn record. It does not stop a record that
 * disagrees with the tree: `installSkills` copied every file and wrote one
 * record at the end, so a run that died after the copies left files on disk
 * that nothing named, and `uninstall` removes only what the manifest records.
 *
 * The order is the fix. A run states which paths it is about to write AND what
 * it is about to write there, commits that statement, and only then copies.
 * Every file it can create is therefore named by a record that was on disk
 * before the file was, whatever kills the run and however far it got. The next
 * command deletes what the interrupted one left.
 *
 * This is not a rollback. A rollback runs inside the process that failed, and
 * the failure that matters here — the process being killed — is the one that
 * never reaches it.
 *
 * The statement lives IN the manifest rather than in a file beside it, because
 * the commit has to record the files and withdraw the statement together. Two
 * files cannot be written in one step, and whichever order they were written in
 * would leave a window: a statement withdrawn first orphans the files it named,
 * and a record written first is a record of an install that may still fail.
 *
 * **The statement carries a hash per path, and that hash is what proves the
 * file is ours to delete.** Two review rounds went into the ownership question
 * and each answer was a guess: "every pending path is mine" deletes a file the
 * user created at one of those paths after the interrupted run, and "no
 * recorded path is mine" leaves a file this engine wrote at a path some other
 * run had recorded. A content match is not a guess. The engine copies a file
 * whole, through a staging name and a rename, so a path either holds the bytes
 * the run intended or holds something the run did not put there.
 */

/**
 * Where a copy lands before it is renamed into place.
 *
 * `copyFile` writes into the destination and can be interrupted half way, which
 * leaves a fragment that nothing can identify. Staging and renaming means the
 * destination only ever holds a whole file, and the staging path is derived
 * from the destination rather than recorded, so recovery can find it from the
 * statement alone.
 */
export const STAGING_SUFFIX = '.stylewright-part';

/**
 * The longest one component of a path may be. Every filesystem this tool runs
 * on stops at 255 — bytes on ext4 and APFS, UTF-16 units on NTFS — and counting
 * bytes is the stricter of the two readings for the names a skill ships.
 */
const MAX_COMPONENT = 255;

/** `text`, shortened until it fits `limit` bytes, never splitting a character. */
function clipBytes(text, limit) {
  const chars = Array.from(text);
  while (chars.length && Buffer.byteLength(chars.join('')) > limit) chars.pop();
  return chars.join('');
}

/**
 * The staging basename for a destination basename.
 *
 * A suffix alone cannot be the whole answer. A skill may ship a name that is
 * legal and nearly as long as a component may be, and appending to it produces
 * a name the filesystem refuses — so the first install failed with
 * ENAMETOOLONG after committing its statement, and every later command failed
 * on the same path while trying to recover, leaving a target that only hand
 * editing the manifest could repair. A name that cannot be written is worse
 * than a name that cannot be read.
 *
 * So an over-long one is clipped and given a digest of the name it came from.
 * The digest is what keeps two clipped names apart, since clipping alone maps
 * every name sharing a long head onto one staging path. It is computed from the
 * destination and nothing else, which is the property recovery depends on: a
 * run that died left only its statement, and the next command has to reach the
 * staging path from the stated path alone.
 *
 * Short names — every name in practice — are untouched, so the staging file
 * beside a destination still reads as that destination's.
 */
export function stagingName(base) {
  const plain = `${base}${STAGING_SUFFIX}`;
  if (Buffer.byteLength(plain) <= MAX_COMPONENT) return plain;
  const digest = crypto.createHash('sha256').update(base).digest('hex').slice(0, 16);
  const tail = `-${digest}${STAGING_SUFFIX}`;
  return `${clipBytes(base, MAX_COMPONENT - Buffer.byteLength(tail))}${tail}`;
}

export function stagingPath(abs) {
  return path.join(path.dirname(abs), stagingName(path.basename(abs)));
}

/**
 * The same derivation over a manifest key, which is spelled with `/` on every
 * platform and so cannot go through `path`.
 */
export function stagingKey(rel) {
  const parts = rel.split('/');
  parts[parts.length - 1] = stagingName(parts[parts.length - 1]);
  return parts.join('/');
}

export function hasPending(manifest) {
  return Object.keys(manifest.pending ?? {}).length > 0;
}

/** The manifest, plus the statement that `name` is about to receive `files`. */
export function addPending(manifest, name, files) {
  return { ...manifest, pending: { ...manifest.pending, [name]: { ...files } } };
}

/** The manifest, with the statement about `name` withdrawn. */
export function clearPending(manifest, name) {
  const pending = { ...manifest.pending };
  delete pending[name];
  const out = { ...manifest, pending };
  if (Object.keys(pending).length === 0) delete out.pending;
  return out;
}

/**
 * Delete what an interrupted run left under `<targetDir>/<name>`, and report
 * what went.
 *
 * One rule decides every case: **a file goes when it holds exactly what the
 * statement said would be written there, and the manifest does not record that
 * same content.** Both halves carry weight.
 *
 * - The content match is the proof of ownership. A file the user wrote at a
 *   pending path does not match, so it stays and the ordinary collision check
 *   reports it. A file this engine wrote matches, whoever recorded the path.
 * - The record check keeps a file another run committed. When two runs install
 *   the same version, the winner's file is byte for byte what the loser meant
 *   to write, and deleting it would leave the winner's record naming nothing.
 *
 * Anything else is left where it is: a fragment cannot exist at a destination,
 * because a copy is staged and renamed, and a directory or a link at a pending
 * path is something this engine did not put there. The staging path itself is
 * removed whatever it holds, because its name belongs to this tool — unless it
 * resolves to a file the manifest records, which install refuses to ship and an
 * older release may still have left.
 *
 * The paths are walked through `reachability` for the same reason every other
 * consumer is: a deletion must not travel through a symbolic link that appeared
 * in the middle of a recorded path.
 *
 * `wrote` is the paths this run actually copied, and only a caller still alive
 * to know them can pass it. Recovery cannot: it reads a statement some dead run
 * left, so it passes null and the content match is the whole of its proof. A
 * live undo does know, and knowledge beats proof — a file holding the stated
 * bytes at a path the run never reached is somebody else's work that happens to
 * match, and deleting it was a live run destroying a file it had not written.
 *
 * It narrows the destinations only. The staging name belongs to this tool at
 * every stated path, whether or not the copy got far enough to be counted, and
 * a fragment left by the copy that failed is exactly the one that was never
 * counted.
 */
export async function discardStated(targetDir, name, stated, manifest, wrote = null) {
  const destDir = path.join(targetDir, name);
  // `hasOwn`, because `constructor` is a legal skill name and a bare lookup
  // finds the prototype's member for it — an entry that does not exist reads
  // as one that does. The same class as a file named `__proto__`, one
  // property up.
  const recorded = Object.hasOwn(manifest.skills ?? {}, name)
    ? manifest.skills[name]?.files ?? {} : {};
  const rels = Object.keys(stated ?? {});
  const { baseBlocked, reachable } = await reachability(destDir, rels);
  if (baseBlocked) return []; // The skill directory is not ours. Nothing under it is either.

  const removed = [];
  for (const rel of reachable) {
    const abs = path.join(destDir, rel);
    const staged = stagingPath(abs);
    let took = false;
    // A recorded file is never a staging leftover, whatever its name ends with.
    // The suffix belongs to this tool, but a manifest that records a path
    // spelled that way records an installed file, and removing it would leave
    // the record naming nothing. Install refuses to ship such a name in any
    // case, so only a manifest an older release wrote can carry one.
    //
    // Through the resolver, because the spelling answers a different question.
    // A case-folding target makes the staging path and a record spelled in
    // another case one file, which has to stay. A case-sensitive target makes
    // them two, where the record's file is not the one this removal reaches and
    // the scratch file beside it is ours — protecting that one by spelling left
    // it standing for the next install to refuse as a collision.
    //
    // No content test here, unlike the destination below. There the file is
    // provably this engine's, so a record that disagrees is a record to restore
    // from. Here the file is the record's own and deletion is the irreversible
    // move, so identity alone decides.
    if (await destinationState(staged) === 'file'
      && await recordedAs(destDir, stagingKey(rel), recorded) === null) {
      await removeAt(staged);
      took = true;
    }
    // Which record, if any, reaches this file. An interrupted case-only rename
    // leaves one file under two spellings on a case-folding target, and the
    // resolver is what executes the deletion, so the record that can keep the
    // file is the one at whichever spelling reaches it.
    const owner = await recordedAs(destDir, rel, recorded);
    if ((wrote === null || Object.hasOwn(wrote, rel))
      && await destinationState(abs) === 'file'
      && await hashFile(abs) === stated[rel]
      // Content decides, not identity. A record naming these bytes is one this
      // deletion would leave pointing at nothing. A record naming other bytes
      // already disagrees with the disk, and keeping the file is what makes
      // every later update and uninstall refuse it as one the user edited —
      // deleting it leaves that record free to restore what it does say.
      && (owner === null || recorded[owner] !== stated[rel])) {
      await removeAt(abs);
      removed.push(`${name}/${rel}`);
      took = true;
    }
    // Only where something went. Pruning after a path this pass left alone
    // would take an empty directory that was standing before the run began.
    if (took) await pruneEmpty(path.dirname(abs), destDir);
  }
  // Only when no record keeps the directory alive. A skill the manifest still
  // holds keeps its directory even when every file under it went, because the
  // record is what the next install restores from. `hasOwn` for the same
  // reason as above: a pending skill named `constructor` has no record, and
  // the inherited property made this condition say it did, so its emptied
  // directory was retained.
  if (!Object.hasOwn(manifest.skills ?? {}, name)) await pruneEmpty(destDir, targetDir);
  return removed.sort();
}

/**
 * Clear every statement in `manifest`, and report what was deleted.
 *
 * It deletes first and returns the cleared manifest for the caller to write,
 * rather than writing first and deleting after. A run interrupted here has to
 * leave the statement standing, because the statement is the only thing that
 * can reach the files a second time.
 */
export async function recoverPending(targetDir, manifest) {
  const removed = [];
  const cleared = [];
  let out = manifest;
  for (const [name, stated] of Object.entries(manifest.pending ?? {})) {
    removed.push(...await discardStated(targetDir, name, stated, manifest));
    // Named whether or not a file went. A run killed between the statement and
    // its first copy leaves nothing on disk, and withdrawing the statement is
    // still a change to a tree that a command must not report as no change at
    // all.
    cleared.push(name);
    out = clearPending(out, name);
  }
  return { manifest: out, removed: removed.sort(), cleared: cleared.sort() };
}
