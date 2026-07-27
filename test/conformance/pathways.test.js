import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../../src/install.js';
import { treeOf } from './helpers.js';

const REPO = path.join(import.meta.dirname, '..', 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const SKILL = 'demo-standard';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-conf-'));

async function pathwayEngine() {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: [SKILL], now: NOW });
  return target;
}

async function pathwayManualCopy() {
  const target = await tmp();
  await fs.cp(
    path.join(REPO, 'skills', 'standards', SKILL),
    path.join(target, SKILL),
    { recursive: true });
  return target;
}

test('engine and manual copy produce identical trees', async () => {
  const [a, b] = await Promise.all([pathwayEngine(), pathwayManualCopy()]);
  assert.deepEqual(await treeOf(a), await treeOf(b));
});

test('no pathway installs a grounding matrix', async () => {
  for (const make of [pathwayEngine, pathwayManualCopy]) {
    const dir = await make();
    const tree = await treeOf(dir);
    assert.equal(
      tree.filter((f) => /grounding/i.test(f.rel)).length,
      0,
      `pathway leaked a grounding file: ${JSON.stringify(tree.map((f) => f.rel))}`);
  }
});

test('the fixture skill does have a grounding matrix in the repo', async () => {
  await fs.access(path.join(REPO, 'grounding', 'standards', `${SKILL}.md`));
});
