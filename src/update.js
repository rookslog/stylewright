import { PLATFORMS, SCOPES, resolveTarget } from './targets.js';
import { readManifest } from './manifest.js';
import { installSkills } from './install.js';
import { loadCatalog } from './catalog.js';

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
      const manifest = await readManifest(targetDir);
      const names = Object.keys(manifest.skills);
      if (!names.length) continue;
      seen.add(targetDir);
      found.push({ platform, scope, targetDir, names });
    }
  }
  return found;
}

export async function updateSkills({
  repoRoot, home, cwd, platforms, scopes, names, now, force = false,
}) {
  const known = new Set((await loadCatalog(repoRoot)).map((s) => s.name));
  const installs = await findInstalls({ home, cwd, platforms, scopes });

  // --skill is the third consumer of the same rule as --platform and --scope,
  // and it was missed the first time. A misspelling filtered every install to
  // nothing, printed nothing, and exited zero looking successful.
  //
  // A withdrawn skill is still a valid name here, because it is installed and
  // the user may be asking about exactly that.
  if (names?.length) {
    const installedNames = new Set(installs.flatMap((i) => i.names));
    const bad = names.filter((n) => !known.has(n) && !installedNames.has(n));
    if (bad.length) {
      throw new Error(
        `Unknown skill: ${bad.join(', ')}. Not in this repository, and not installed.`);
    }
  }

  const results = [];

  for (const install of installs) {
    let wanted = install.names;
    if (names?.length) wanted = wanted.filter((n) => names.includes(n));

    // A skill can be renamed or withdrawn between releases. Its files stay on
    // disk and its manifest row stays valid, so report it rather than throwing.
    const orphaned = wanted.filter((n) => !known.has(n));
    const fresh = wanted.filter((n) => known.has(n));

    const res = fresh.length
      ? await installSkills({ repoRoot, targetDir: install.targetDir, names: fresh, now, force })
      : { installed: [], skipped: [] };

    results.push({ ...install, ...res, orphaned });
  }
  return results;
}
