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

export class DuplicateSkillName extends Error {
  constructor(name, first, second) {
    super(
      `Skill name "${name}" is used in two tiers: skills/${first}/${name} and `
      + `skills/${second}/${name}. A skill name is unique across tiers, because `
      + 'every command that reads the catalog selects by name alone.');
    this.name = 'DuplicateSkillName';
    this.skill = name;
    this.tiers = [first, second];
  }
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

/**
 * The two tiers are two directories and one namespace. Every consumer keys on
 * the name alone — install builds a map of it, `ground --check` builds an
 * object of it, `update` builds a set of it — and each of those quietly kept
 * one of the two entries. Install kept the later tier, so a command that asked
 * for the standards skill copied the craft one and recorded it as craft.
 *
 * A name in two tiers is not an ambiguity a consumer can resolve, because the
 * caller named the skill it wanted and the catalog holds two. So it stops here,
 * at the one surface all of them read, rather than at each of them.
 *
 * The error carries a class of its own, because one consumer must survive it.
 * `uninstall` answers what is installed on the user's machine, and the target
 * manifest is the only thing that knows. A collision in the CLONE would
 * otherwise strand a skill on a disk the clone has nothing to do with.
 */
export async function loadCatalog(repoRoot) {
  const skills = [];
  const seen = new Map();
  for (const tier of TIERS) {
    const tierDir = path.join(repoRoot, 'skills', tier);
    for (const name of await listDirs(tierDir)) {
      const dir = path.join(tierDir, name);
      const held = seen.get(name);
      if (held) throw new DuplicateSkillName(name, held, tier);
      seen.set(name, tier);
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
