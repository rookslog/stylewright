import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './catalog.js';
import { hashFile, readManifest, writeManifest, recordSkill } from './manifest.js';
import { walk, pruneEmpty } from './tree.js';
import { VERSION } from './version.js';

async function modifiedFiles(destDir, recorded) {
  const drifted = [];
  for (const [rel, expected] of Object.entries(recorded ?? {})) {
    const abs = path.join(destDir, rel);
    try {
      if (await hashFile(abs) !== expected) drifted.push(rel);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return drifted.sort();
}

/**
 * Paths this skill is about to write that already hold a file we never
 * recorded. That file belongs to the user, and copying over it destroys work
 * with no warning and no way back.
 *
 * Checking the manifest alone missed this, because an unrecorded path has no
 * hash to compare. A collision on an unrecorded path is drift, and it is the
 * more dangerous kind.
 */
async function untrackedCollisions(destDir, sourceRels, recorded) {
  const known = new Set(Object.keys(recorded ?? {}));
  const hits = [];
  for (const rel of sourceRels) {
    if (known.has(rel)) continue;
    try {
      await fs.access(path.join(destDir, rel));
      hits.push(rel);
    } catch {
      // Absent is the normal case. Nothing is in the way.
    }
  }
  return hits.sort();
}

/**
 * Paths the previous version installed that this version no longer ships.
 * Leaving them behind orphans them: the manifest entry is replaced, so
 * uninstall can no longer remove them, and the agent keeps loading them.
 */
function retiredFiles(recorded, sourceRels) {
  const shipping = new Set(sourceRels);
  return Object.keys(recorded ?? {}).filter((rel) => !shipping.has(rel)).sort();
}

export async function installSkills({
  repoRoot, targetDir, names, pathway = 'engine', now, force = false,
}) {
  const catalog = await loadCatalog(repoRoot);
  const byName = new Map(catalog.map((s) => [s.name, s]));
  for (const name of names) {
    if (!byName.has(name)) throw new Error(`Unknown skill "${name}".`);
  }

  let manifest = await readManifest(targetDir);
  const installed = [];
  const skipped = [];

  for (const name of names) {
    const skill = byName.get(name);
    const destDir = path.join(targetDir, name);
    const recorded = manifest.skills[name]?.files;
    const rels = await walk(skill.dir);

    if (!force) {
      const drifted = await modifiedFiles(destDir, recorded);
      const untracked = await untrackedCollisions(destDir, rels, recorded);
      if (drifted.length || untracked.length) {
        skipped.push({
          name,
          reason: untracked.length && !drifted.length ? 'not-ours' : 'locally-modified',
          files: [...drifted, ...untracked].sort(),
        });
        continue;
      }
    }

    const files = {};
    for (const rel of rels) {
      const from = path.join(skill.dir, rel);
      const to = path.join(destDir, rel);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      files[rel] = await hashFile(to);
    }

    // Every remaining recorded path is one this release dropped. The drift
    // check above already proved each is unmodified, so removing it discards
    // nothing the user wrote.
    for (const rel of retiredFiles(recorded, rels)) {
      const abs = path.join(destDir, rel);
      await fs.rm(abs, { force: true });
      await pruneEmpty(path.dirname(abs), destDir);
    }

    manifest = recordSkill(manifest, { name, tier: skill.tier, pathway, files, now });
    installed.push(name);
  }

  // Record the release that wrote this state, not the one that created the
  // file. A stale stamp makes the manifest useless for diagnosis and for any
  // future schema migration.
  await writeManifest(targetDir, { ...manifest, stylewrightVersion: VERSION });
  return { installed, skipped };
}
