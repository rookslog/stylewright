import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { doctor } from '../src/doctor.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-doc-'));

test('reports nothing on a clean machine', async () => {
  const home = await tmp();
  const cwd = await tmp();
  assert.deepEqual(await doctor({ repoRoot: REPO, home, cwd }), []);
});

test('detects the same skill installed in two targets', async () => {
  const home = await tmp();
  const cwd = await tmp();
  for (const dir of ['.claude/skills', '.codex/skills']) {
    await installSkills({
      repoRoot: REPO,
      targetDir: path.join(home, dir),
      names: ['demo-standard'],
      now: NOW,
    });
  }
  const found = await doctor({ repoRoot: REPO, home, cwd });
  const dup = found.find((f) => f.code === 'duplicate-install');
  assert.ok(dup, 'expected a duplicate-install finding');
  assert.match(dup.message, /demo-standard/);
  assert.match(dup.message, /2 directories/);
});

test('a single claude install is not a duplicate, despite the cowork alias', async () => {
  // cowork/user resolves to the same path as claude/user. Counting labels
  // instead of paths would report a duplicate for every ordinary install.
  const home = await tmp();
  const cwd = await tmp();
  await installSkills({
    repoRoot: REPO,
    targetDir: path.join(home, '.claude/skills'),
    names: ['demo-standard'],
    now: NOW,
  });
  assert.deepEqual(await doctor({ repoRoot: REPO, home, cwd }), []);
});

test('does not report a duplicate when cwd equals home', async () => {
  // user scope and project scope collapse to one path when the process runs
  // in the home directory.
  const home = await tmp();
  await installSkills({
    repoRoot: REPO,
    targetDir: path.join(home, '.claude/skills'),
    names: ['demo-standard'],
    now: NOW,
  });
  assert.deepEqual(await doctor({ repoRoot: REPO, home, cwd: home }), []);
});
