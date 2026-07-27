import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { uninstallSkills } from '../src/uninstall.js';
import { readManifest } from '../src/manifest.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-uninst-'));
const exists = (p) => fs.access(p).then(() => true, () => false);

test('removes exactly what the manifest records', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const stray = path.join(target, 'demo-standard', 'NOTES.md');
  await fs.writeFile(stray, 'user file\n');

  const res = await uninstallSkills({ targetDir: target, names: ['demo-standard'] });
  assert.deepEqual(res.removed, ['demo-standard']);
  assert.ok(await exists(stray), 'must not delete a file it did not install');
  assert.ok(!(await exists(path.join(target, 'demo-standard', 'SKILL.md'))));
  assert.deepEqual((await readManifest(target)).skills, {});
});

test('reports a skill that is not installed', async () => {
  const target = await tmp();
  const res = await uninstallSkills({ targetDir: target, names: ['demo-standard'] });
  assert.deepEqual(res.removed, []);
  assert.deepEqual(res.missing, ['demo-standard']);
});

test('removes the skill directory when it becomes empty', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.ok(!(await exists(path.join(target, 'demo-craft'))));
});
