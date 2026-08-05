import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { uninstallSkills } from '../src/uninstall.js';
import { withTargetLock, LOCK_NAME } from '../src/lock.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-lock-'));
const exists = (p) => fs.access(p).then(() => true, () => false);

test('one run at a time holds a target directory', async () => {
  const dir = await tmp();
  let inner = null;
  await withTargetLock(dir, async () => {
    assert.ok(await exists(path.join(dir, LOCK_NAME)), 'the holder can see it holds it');
    inner = await withTargetLock(dir, async () => 'got in').catch((err) => err);
  });
  assert.match(inner.message, /Another stylewright command is working/);
  assert.match(inner.message, /remove .*\.stylewright-lock/, 'and it names the file');
});

test('the directory is let go whether the run finishes or throws', async () => {
  const dir = await tmp();
  await withTargetLock(dir, async () => 'done');
  assert.deepEqual(await fs.readdir(dir), []);

  await assert.rejects(withTargetLock(dir, async () => {
    throw new Error('the run failed');
  }), /the run failed/);
  assert.deepEqual(await fs.readdir(dir), [], 'a failure must not leave it locked');
});

test('a directory that does not exist is not created to be locked', async () => {
  // `uninstall` on a machine that never installed anything must leave no trace,
  // and a lock file is a trace.
  const parent = await tmp();
  const dir = path.join(parent, 'skills');
  assert.equal(await withTargetLock(dir, async () => 'ran', { create: false }), 'ran');
  assert.ok(!(await exists(dir)));
});

test('a command finds a locked directory and refuses without reading it', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  await fs.writeFile(path.join(target, LOCK_NAME), '');

  await assert.rejects(
    installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW }),
    /Another stylewright command is working/);
  await assert.rejects(
    uninstallSkills({ targetDir: target, names: ['demo-craft'] }),
    /Another stylewright command is working/);
  assert.ok(await exists(path.join(target, 'demo-craft', 'SKILL.md')), 'and touches nothing');
  assert.ok(!(await exists(path.join(target, 'demo-standard'))));
});

test('a target directory that is a link is held, not skipped', async () => {
  // `lstat` reads the link itself and calls it "not a directory", so the
  // exclusion was skipped exactly where the work still happens — every other
  // write in this tool follows the link. A live run holding the real directory
  // could then have its files deleted underneath it.
  const real = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: real, names: ['demo-craft'], now: NOW });
  const linked = path.join(await tmp(), 'skills');
  await fs.symlink(real, linked);
  await fs.writeFile(path.join(real, LOCK_NAME), '');

  await assert.rejects(
    uninstallSkills({ targetDir: linked, names: ['demo-craft'] }),
    /Another stylewright command is working/);
  assert.ok(await exists(path.join(real, 'demo-craft', 'SKILL.md')), 'and nothing was removed');
});

test('a target that is a file is left alone, not crashed on', async () => {
  // The user has something else at that path. Nothing of ours is under it, so
  // there is nothing to hold and nothing to clear, and the command reports the
  // skill as not installed rather than throwing about a directory that is not.
  const parent = await tmp();
  const target = path.join(parent, 'skills');
  await fs.writeFile(target, 'mine\n');

  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.deepEqual(res.missing, ['demo-craft']);
  assert.equal(await fs.readFile(target, 'utf8'), 'mine\n');
});

test('a finished command leaves no lock behind', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  assert.ok(!(await exists(path.join(target, LOCK_NAME))));
  await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.ok(!(await exists(target)), 'and the empty directory still goes');
});
