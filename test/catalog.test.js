import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadCatalog, readFrontmatter } from '../src/catalog.js';
import { contained } from '../src/manifest.js';
import { walk } from '../src/tree.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-cat-'));

/** A repository holding one skill for each `[tier, name]` pair given. */
async function repoWith(pairs) {
  const repo = await tmp();
  for (const [tier, name] of pairs) {
    const dir = path.join(repo, 'skills', tier, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: The ${tier} one.\n---\n\n# ${name}\n`);
  }
  return repo;
}

test('reads name and description from frontmatter', () => {
  const fm = readFrontmatter('---\nname: a-skill\ndescription: Does a thing.\n---\n# Body\n');
  assert.equal(fm.name, 'a-skill');
  assert.equal(fm.description, 'Does a thing.');
});

test('throws when frontmatter is missing', () => {
  assert.throws(() => readFrontmatter('# No frontmatter\n'), /frontmatter/i);
});

test('loads both tiers, sorted by name', async () => {
  const cat = await loadCatalog(REPO);
  assert.deepEqual(cat.map((s) => s.name), ['demo-craft', 'demo-standard']);
  assert.equal(cat.find((s) => s.name === 'demo-craft').tier, 'craft');
  assert.equal(cat.find((s) => s.name === 'demo-standard').tier, 'standards');
});

test('grounding path points outside the skill directory', async () => {
  const cat = await loadCatalog(REPO);
  const skill = cat.find((s) => s.name === 'demo-standard');
  assert.ok(skill.groundingPath.endsWith(path.join('grounding', 'standards', 'demo-standard.md')));
  assert.ok(!skill.groundingPath.startsWith(skill.dir));
});

test('frontmatter name must match directory name', async () => {
  const cat = await loadCatalog(REPO);
  for (const s of cat) assert.equal(path.basename(s.dir), s.name);
});

// The two tiers share one flat namespace. Every consumer keys on the name
// alone, so a name in both tiers is not an ambiguity a consumer can resolve.
// The catalog is the one place all of them read, so it is where the collision
// stops.
test('one name in two tiers is refused, and both tiers are named', async () => {
  const repo = await repoWith([['standards', 'twinned'], ['craft', 'twinned']]);
  await assert.rejects(() => loadCatalog(repo), (err) => {
    assert.match(err.message, /twinned/);
    assert.match(err.message, /skills\/standards\/twinned/);
    assert.match(err.message, /skills\/craft\/twinned/);
    return true;
  });
});

test('the same name in one tier only stays a catalog of one', async () => {
  const repo = await repoWith([['craft', 'twinned']]);
  const cat = await loadCatalog(repo);
  assert.deepEqual(cat.map((s) => [s.name, s.tier]), [['twinned', 'craft']]);
});

test('every skill this repository ships records portably', async () => {
  // The write-side gate in install refuses these at run time. This is the
  // build-time partner: a skill shipping a colon, a backslash, or any other
  // spelling `contained` refuses fails CI before it can reach a user.
  const cat = await loadCatalog(path.join(import.meta.dirname, '..'));
  assert.ok(cat.length > 0);
  for (const skill of cat) {
    for (const rel of await walk(skill.dir)) {
      assert.ok(contained(rel), `${skill.name} ships an unrecordable name: ${rel}`);
    }
  }
});
