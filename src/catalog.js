import fs from 'node:fs/promises';
import path from 'node:path';

export const TIERS = ['standards', 'craft'];

/** The directory whose files a matrix disposes of, one file at a time. */
export const GRADED_DIR = 'references';

/**
 * Whether a matrix disposes of this file, by its path inside the skill.
 *
 * `SKILL.md` and every Markdown file under `references/` are graded, and each
 * of them one matrix at a time. `agents/` is not: a harness reads it as
 * metadata, the way it reads front matter, and the Markdown walk cannot read
 * YAML at all. `LICENSE` is not: it is a legal notice carrying no rule for a
 * writer.
 */
export const isGraded = (rel) => rel === 'SKILL.md'
  || (rel.startsWith(`${GRADED_DIR}/`) && rel.endsWith('.md'));

/**
 * Where the matrix for one file of a skill lives.
 *
 * A matrix disposes of ONE file, and the file it disposes of is the one its own
 * path names. That is what keeps the row space separate once a skill carries
 * more than one graded file: `Our anchor` names a heading, and two files in one
 * skill can carry the same heading, so a shared row space would let a row claim
 * an occurrence in the wrong file and the check would still pass. Issue #99
 * asked the question and ADR-0030 records the answer.
 *
 * `SKILL.md` keeps the path every document, test and release already names.
 * Every other graded file mirrors its own path under a directory named for the
 * skill, so the mapping is one join and a reader finds the matrix by spelling
 * out the file.
 */
export function matrixPathFor(skill, rel) {
  if (rel === 'SKILL.md') return skill.groundingPath;
  return path.join(skill.groundingDir, ...rel.split('/'));
}

/**
 * The line ending is not a signal about the content, so it is removed before
 * anything reads the text. `.gitattributes` governs a checkout of this
 * repository and nothing else. A Windows user who opens their own scaffolded
 * SKILL.md in an editor that saves CRLF writes a file this parser has to read.
 *
 * One normalisation covers three readings that each assumed the line feed. The
 * opening fence anchored on `^---\n`, so the block was not found at all. The
 * split left a carriage return on the end of every value. The quote strip
 * anchored on the end of the line, where the carriage return sat after the
 * closing quote, so a quoted value kept its quotes.
 */
export function readFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'));
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
        groundingDir: path.join(repoRoot, 'grounding', tier, name),
      });
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
