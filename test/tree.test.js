import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { walk, ancestorsOf } from '../src/tree.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-tree-'));

test('walk names files with forward slashes on every platform', async () => {
  // walk feeds the manifest, and a manifest travels between machines. Joining
  // with path.sep recorded `references\guide.md` on Windows and
  // `references/guide.md` everywhere else, so the same install produced two
  // spellings of the same file, and each platform refused the other's.
  const dir = await tmp();
  await fs.mkdir(path.join(dir, 'references', 'deep'), { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), 'x');
  await fs.writeFile(path.join(dir, 'references', 'guide.md'), 'x');
  await fs.writeFile(path.join(dir, 'references', 'deep', 'note.md'), 'x');
  assert.deepEqual(await walk(dir), [
    'SKILL.md',
    'references/deep/note.md',
    'references/guide.md',
  ]);
});

test('ancestorsOf splits a manifest key on forward slashes', () => {
  // The keys ancestorsOf receives are manifest keys, and those carry `/` on
  // every platform. Splitting on path.sep found no ancestors on Windows, so
  // the symlink checks that consume this list inspected nothing at all.
  assert.deepEqual(ancestorsOf('a/b/c.md'), ['a', 'a/b']);
  assert.deepEqual(ancestorsOf('SKILL.md'), []);
});
