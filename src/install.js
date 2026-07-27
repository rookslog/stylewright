import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './catalog.js';
import { hashFile, readManifest, writeManifest, recordSkill } from './manifest.js';

async function walk(dir, base = '') {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = path.join(base, e.name);
    if (e.isDirectory()) out.push(...await walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

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

    if (!force) {
      const drifted = await modifiedFiles(destDir, manifest.skills[name]?.files);
      if (drifted.length) {
        skipped.push({ name, reason: 'locally-modified', files: drifted });
        continue;
      }
    }

    const rels = await walk(skill.dir);
    const files = {};
    for (const rel of rels) {
      const from = path.join(skill.dir, rel);
      const to = path.join(destDir, rel);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      files[rel] = await hashFile(to);
    }
    manifest = recordSkill(manifest, { name, tier: skill.tier, pathway, files, now });
    installed.push(name);
  }

  await writeManifest(targetDir, manifest);
  return { installed, skipped };
}
