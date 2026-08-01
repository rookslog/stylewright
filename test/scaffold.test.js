import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scaffoldSkill } from '../src/scaffold.js';
import { checkAll } from '../src/ground.js';
import { loadCatalog } from '../src/catalog.js';
import { lintText } from '../src/lint.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-scaf-'));

const STD = {
  name: 'demo-guide',
  tier: 'standards',
  description: 'A demo skill for the scaffold test.',
  source: 'Demo Guide 2026',
  url: 'https://example.invalid/guide',
  license: 'CC BY 4.0',
};

test('a scaffolded standards skill passes the grounding check immediately', async () => {
  const repo = await tmp();
  await scaffoldSkill({ repoRoot: repo, ...STD });
  const all = await checkAll(repo);
  assert.deepEqual(all['demo-guide'], [],
    'a fresh scaffold must be green, or contributors learn to silence the check');
});

test('a scaffolded skill is a valid catalog entry', async () => {
  const repo = await tmp();
  await scaffoldSkill({ repoRoot: repo, ...STD });
  const cat = await loadCatalog(repo);
  assert.equal(cat.length, 1);
  assert.equal(cat[0].name, 'demo-guide');
  assert.equal(cat[0].tier, 'standards');
});

test('the grounding matrix lands outside the skill directory', async () => {
  const repo = await tmp();
  const written = await scaffoldSkill({ repoRoot: repo, ...STD });
  assert.ok(written.includes(path.join('grounding', 'standards', 'demo-guide.md')));
  const inSkill = written.filter((p) => p.includes(path.join('skills', 'standards', 'demo-guide')));
  assert.equal(inSkill.filter((p) => /grounding/i.test(p)).length, 0);
});

test('a scaffolded skill is lint clean', async () => {
  const repo = await tmp();
  await scaffoldSkill({ repoRoot: repo, ...STD });
  const text = await fs.readFile(
    path.join(repo, 'skills', 'standards', 'demo-guide', 'SKILL.md'), 'utf8');
  assert.deepEqual(lintText(text), []);
});

test('a craft skill needs no source and gets an E row', async () => {
  const repo = await tmp();
  await scaffoldSkill({
    repoRoot: repo, name: 'demo-craft', tier: 'craft', description: 'Craft demo.',
  });
  const matrix = await fs.readFile(
    path.join(repo, 'grounding', 'craft', 'demo-craft.md'), 'utf8');
  assert.match(matrix, /\| E-01 \|/);
  await assert.rejects(
    () => fs.access(path.join(repo, 'skills', 'craft', 'demo-craft', 'SOURCE.md')));
  assert.deepEqual((await checkAll(repo))['demo-craft'], []);
});

test('a standards skill without a source is refused', async () => {
  const repo = await tmp();
  await assert.rejects(
    () => scaffoldSkill({ repoRoot: repo, name: 'x-guide', tier: 'standards' }),
    /--source and --url/);
});

test('rejects a bad name and an unknown tier', async () => {
  const repo = await tmp();
  await assert.rejects(
    () => scaffoldSkill({ repoRoot: repo, ...STD, name: 'Demo_Guide' }), /kebab-case/);
  await assert.rejects(
    () => scaffoldSkill({ repoRoot: repo, ...STD, tier: 'nope' }), /Unknown tier/);
});

test('refuses to overwrite an existing skill', async () => {
  const repo = await tmp();
  await scaffoldSkill({ repoRoot: repo, ...STD });
  await assert.rejects(() => scaffoldSkill({ repoRoot: repo, ...STD }), /already exists/);
});

test('a source name containing a pipe still produces a matrix that passes', async () => {
  // The check learned to read `\\|` and this generator never learned to write
  // it, so the scaffold produced a matrix that failed its own first check.
  const repo = await tmp();
  await scaffoldSkill({
    repoRoot: repo,
    name: 'piped',
    tier: 'standards',
    description: 'A demo skill.',
    source: 'ACME | Standard',
    url: 'https://example.invalid/x',
    license: 'CC BY 4.0',
  });
  const all = await checkAll(repo);
  assert.deepEqual(all.piped, []);
});
