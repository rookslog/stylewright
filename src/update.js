import { PLATFORMS, SCOPES, resolveTarget } from './targets.js';
import { readManifest } from './manifest.js';
import { installSkills } from './install.js';
import { loadCatalog } from './catalog.js';

// `update` refreshes what is already installed, so it reads its own work list
// from the manifests rather than from flags. A user who ran the guided install
// months ago does not remember which platforms they picked, and should not have
// to.
export async function findInstalls({ home, cwd, platforms, scopes }) {
  const found = [];
  const seen = new Set();
  for (const platform of platforms ?? PLATFORMS) {
    for (const scope of scopes ?? SCOPES) {
      let targetDir;
      try {
        targetDir = resolveTarget({ platform, scope, home, cwd });
      } catch {
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
  const results = [];

  for (const install of await findInstalls({ home, cwd, platforms, scopes })) {
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
