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
});
