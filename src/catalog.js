import fs from 'node:fs/promises';
import path from 'node:path';

export const TIERS = ['standards', 'craft'];

export function readFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) throw new Error('SKILL.md has no YAML frontmatter block.');
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  if (!out.name) throw new Error('SKILL.md frontmatter has no name.');
  return out;
}

async function listDirs(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function loadCatalog(repoRoot) {
  const skills = [];
  for (const tier of TIERS) {
    const tierDir = path.join(repoRoot, 'skills', tier);
    for (const name of await listDirs(tierDir)) {
      const dir = path.join(tierDir, name);
      const text = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8');
      const fm = readFrontmatter(text);
      if (fm.name !== name) {
        throw new Error(`Skill "${name}" declares name "${fm.name}" in frontmatter.`);
      }
      skills.push({
        name,
        tier,
        dir,
        description: fm.description ?? '',
        groundingPath: path.join(repoRoot, 'grounding', tier, `${name}.md`),
      });
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
