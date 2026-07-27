import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadCatalog, readFrontmatter } from '../src/catalog.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');

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
