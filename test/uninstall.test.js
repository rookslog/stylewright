import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { uninstallSkills } from '../src/uninstall.js';
import { readManifest, MANIFEST_NAME } from '../src/manifest.js';
import { VERSION } from '../src/version.js';

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

test('removes its own manifest once the last skill is gone', async () => {
  // README promises uninstall removes only the files the installer wrote. The
  // manifest is a file the installer wrote. Leaving it behind with an empty
  // skills map contradicts that. See issue #16.
  const parent = await tmp();
  const target = path.join(parent, '.claude', 'skills');
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.ok(!(await exists(path.join(target, MANIFEST_NAME))), 'manifest must be gone');
  assert.ok(!(await exists(target)), 'the empty skills directory must be gone');
});

test('keeps the manifest while another skill remains', async () => {
  const target = await tmp();
  await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft', 'demo-standard'], now: NOW,
  });
  await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.ok(await exists(path.join(target, MANIFEST_NAME)));
  assert.deepEqual(Object.keys((await readManifest(target)).skills), ['demo-standard']);
});

test('leaves a directory that holds a file it did not write', async () => {
  const parent = await tmp();
  const target = path.join(parent, '.claude', 'skills');
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const foreign = path.join(target, 'hand-written', 'SKILL.md');
  await fs.mkdir(path.dirname(foreign), { recursive: true });
  await fs.writeFile(foreign, 'not ours\n');

  await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.ok(await exists(foreign), 'must not delete a skill it did not install');
  assert.ok(!(await exists(path.join(target, MANIFEST_NAME))), 'manifest still goes');
  assert.ok(await exists(target), 'the directory stays because it is not empty');
});

test('leaves a directory it never installed into', async () => {
  // The manifest recorded nothing, so there was nothing to remove. Deleting
  // the directory anyway reaches past what this tool ever wrote.
  const parent = await tmp();
  const target = path.join(parent, '.claude', 'skills');
  await fs.mkdir(target, { recursive: true });

  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.deepEqual(res.removed, []);
  assert.deepEqual(res.missing, ['demo-craft']);
  assert.ok(await exists(target), 'a directory we never wrote to must survive');
});

test('an uninstall that removes nothing writes nothing', async () => {
  // writeManifest creates the directory it writes into. Uninstalling a skill
  // from a machine that never had one therefore created a skills directory and
  // an empty manifest: the tool recording its own absence as installed state.
  const target = path.join(await tmp(), 'skills');
  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.deepEqual(res, { removed: [], missing: ['demo-craft'] });
  assert.ok(!(await exists(target)), 'no directory may be created');
});

test('a partial uninstall stamps the release that wrote the manifest', async () => {
  // install stamped it and uninstall did not, so a manifest could name a
  // release that had not touched it since. The stamp now lives in
  // writeManifest, where no writer can leave it off.
  const target = await tmp();
  await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft', 'demo-standard'], now: NOW,
  });
  const stale = await readManifest(target);
  stale.stylewrightVersion = '0.0.1-old';
  await fs.writeFile(
    path.join(target, MANIFEST_NAME), `${JSON.stringify(stale, null, 2)}\n`);

  await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.equal((await readManifest(target)).stylewrightVersion, VERSION);
});
