import fs from 'node:fs/promises';
import { PLATFORMS, SCOPES, resolveTarget } from './targets.js';
import { readManifest } from './manifest.js';
import { isLocked, withTargetLock, isHeldError } from './lock.js';
import { installHeld } from './install.js';
import { loadCatalog } from './catalog.js';
import { loadResidents } from './resident.js';

function validateNames(given, known, label) {
  const bad = given.filter((v) => !known.includes(v));
  if (bad.length) {
    throw new Error(
      `Unknown ${label}: ${bad.join(', ')}. Known: ${known.join(', ')}`);
  }
}

// `update` refreshes what is already installed, so it reads its own work list
// from the manifests rather than from flags. A user who ran the guided install
// months ago does not remember which platforms they picked, and should not have
// to.
export async function findInstalls({ home, cwd, platforms, scopes }) {
  // A misspelled filter must fail loudly. Swallowing the error turned
  // `--platform cluade` into an empty search, and the command then exited zero
  // claiming nothing was installed.
  //
  // Enumerating the defaults is different. `agents` supports user scope only,
  // so skipping an unsupported pair is correct there and only there.
  if (platforms) validateNames(platforms, PLATFORMS, 'platform');
  if (scopes) validateNames(scopes, SCOPES, 'scope');

  const found = [];
  const locked = [];
  const seen = new Set();
  for (const platform of platforms ?? PLATFORMS) {
    for (const scope of scopes ?? SCOPES) {
      let targetDir;
      try {
        targetDir = resolveTarget({ platform, scope, home, cwd });
      } catch (err) {
        // Skip only the pairs this loop invented. `agents` supports user scope
        // only, so walking past it is right when the defaults produced the
        // pair. When the user named both sides, the pair is theirs and it is
        // wrong: `--platform cowork --scope project` used to report that
        // nothing was installed and exit zero.
        if (platforms && scopes) throw err;
        continue;
      }
      if (seen.has(targetDir)) continue;
      // Asked before the manifest is parsed. A directory a run holds is one
      // whose manifest may be changing under this read, and one a killed run
      // held may hold a manifest from an older release that never finished
      // being written. Neither is this command's to interpret, and a directory
      // it was not going to touch must not stop the ones it was.
      if (await isLocked(targetDir)) {
        seen.add(targetDir);
        locked.push(targetDir);
        continue;
      }
      const manifest = await readManifest(targetDir);
      const names = Object.keys(manifest.skills);
      // A directory holding only the statement of an install that did not come
      // back has no installed skill, and it is exactly the directory that needs
      // this command. Skipping it on the skill count made `update` report that
      // nothing was installed and leave the files that run had copied — while
      // the README promised update as one of the three commands that clear
      // them.
      const pending = Object.keys(manifest.pending ?? {});
      if (!names.length && !pending.length) continue;
      seen.add(targetDir);
      found.push({ platform, scope, targetDir, names, pending });
    }
  }
  return { found, locked };
}

export async function updateSkills({
  repoRoot, home, cwd, platforms, scopes, names, now, force = false,
}) {
  // The resident fragment counts as shipped here, or an installed fragment
  // would be reported as a skill this repository has withdrawn and left to go
  // stale on every update.
  const known = new Set([
    ...(await loadCatalog(repoRoot)).map((s) => s.name),
    ...(await loadResidents(repoRoot)).map((s) => s.name),
  ]);
  const { found: installs, locked } = await findInstalls({ home, cwd, platforms, scopes });

  // --skill is the third consumer of the same rule as --platform and --scope,
  // and it was missed the first time. A misspelling filtered every install to
  // nothing, printed nothing, and exited zero looking successful.
  //
  // A withdrawn skill is still a valid name here, because it is installed and
  // the user may be asking about exactly that.
  //
  // A name a statement carries counts as installed here too, because a skill an
  // interrupted run left behind is exactly what a targeted cleanup names.
  if (names?.length) {
    const installedNames = new Set(installs.flatMap((i) => [...i.names, ...i.pending]));
    // Nothing is unknown while a directory is held. This command refused to
    // read that manifest, so it cannot say the skill is not installed there.
    const bad = locked.length
      ? [] : names.filter((n) => !known.has(n) && !installedNames.has(n));
    if (bad.length) {
      throw new Error(
        `Unknown skill: ${bad.join(', ')}. Not in this repository, and not installed.`);
    }
  }

  const results = [];
  // What the locked rereads actually found. `unmatched` derives from this and
  // never from the snapshot, because a skill can be uninstalled between
  // discovery and the lock — the reread correctly updates nothing, and a
  // report drawn from the snapshot would still call the name matched.
  const matched = new Set();

  for (const install of installs) {
    let wanted = install.names;
    if (names?.length) wanted = wanted.filter((n) => names.includes(n));
    // An install this request does not touch is not a result. Pushing one made
    // the caller skip its "Nothing to update" branch, so a targeted update that
    // matched nothing printed nothing and exited zero, looking like success.
    // A statement left by an interrupted run is work whichever skills were
    // named, because the files it left belong to no skill entry at all.
    if (!wanted.length && !install.pending.length) continue;

    // The decision and the act share one held lock. The snapshot above was
    // read without one, so a concurrent uninstall can complete between that
    // read and the mutation — and acting on the snapshot then reinstalls the
    // skill the user just removed. Everything decided below is decided from a
    // fresh read taken while the directory is held.
    let res;
    try {
      res = await withTargetLock(install.targetDir, async () => {
        const manifest = await readManifest(install.targetDir);
        let wantedNow = Object.keys(manifest.skills);
        if (names?.length) wantedNow = wantedNow.filter((n) => names.includes(n));
        const pendingNow = Object.keys(manifest.pending ?? {});
        for (const n of names ?? []) {
          if (wantedNow.includes(n) || pendingNow.includes(n)) matched.add(n);
        }
        // A skill can be renamed or withdrawn between releases. Its files stay
        // on disk and its manifest row stays valid, so report it rather than
        // throwing.
        const orphaned = wantedNow.filter((n) => !known.has(n));
        const fresh = wantedNow.filter((n) => known.has(n));
        if (!fresh.length && !pendingNow.length) {
          return {
            installed: [],
            skipped: [],
            recovered: [],
            cleared: [],
            orphaned,
            // The directory can be one this command put back. `withTargetLock`
            // creates it to place the lock, so an uninstall that removed the
            // last skill AND the directory between the discovery above and this
            // lock leaves it standing again with nothing in it — recreated by
            // the run that came to update it and found nothing to update.
            // Reported as emptied so the caller's `rmdir` reaches it after the
            // lock is released. That `rmdir` refuses a directory holding
            // anything, so an orphaned skill this branch leaves alone keeps its
            // own directory.
            emptied: !Object.keys(manifest.skills).length && !pendingNow.length,
          };
        }
        const held = await installHeld({
          repoRoot, targetDir: install.targetDir, names: fresh, now, force,
        });
        return { ...held, orphaned };
      });
    } catch (err) {
      // Held is a skip, not a failure: the pre-loop probe asked the same
      // question, and a run that took the directory in between gets the same
      // answer it would have gotten a moment earlier.
      if (!isHeldError(err)) throw err;
      locked.push(install.targetDir);
      continue;
    }
    const { emptied, ...rest } = res;
    // After the lock is released, because the lock file lives in this
    // directory — the same ordering installSkills keeps for itself.
    if (emptied) await fs.rmdir(install.targetDir).catch(() => {});
    results.push({ ...install, ...rest });
  }
  // A name this repository ships but no manifest records matches nothing, and
  // a request that selected nothing must not report success — the same rule
  // that made an unsupported platform-and-scope pair an error. Derived from
  // the locked rereads, over the FINAL locked list: two rounds of review
  // caught this report stale, and both times the fix had moved the
  // computation instead of its source. Nothing is unmatched while any
  // directory is held, because the skill may well be installed in the one
  // this command could not read.
  const unmatched = locked.length ? [] : (names ?? [])
    .filter((n) => !matched.has(n)).sort();

  return { results, unmatched, locked };
}
