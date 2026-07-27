import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  MANIFEST_NAME, hashFile, readManifest, writeManifest, emptyManifest, recordSkill,
} from '../src/manifest.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-mf-'));

test('hashFile is stable and content-sensitive', async () => {
  const dir = await tmp();
  const a = path.join(dir, 'a.txt');
  await fs.writeFile(a, 'hello');
  const h1 = await hashFile(a);
  assert.equal(h1, await hashFile(a));
  await fs.writeFile(a, 'hello!');
  assert.notEqual(h1, await hashFile(a));
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('readManifest returns an empty manifest when absent', async () => {
  const dir = await tmp();
  const mf = await readManifest(dir);
  assert.deepEqual(mf.skills, {});
  assert.equal(mf.schema, 1);
});

test('round-trips through disk', async () => {
  const dir = await tmp();
  const mf = recordSkill(emptyManifest(), {
    name: 'demo',
    tier: 'craft',
    pathway: 'engine',
    files: { 'SKILL.md': 'a'.repeat(64) },
    now: '2026-01-01T00:00:00.000Z',
  });
  await writeManifest(dir, mf);
  assert.deepEqual(await readManifest(dir), mf);
  const raw = await fs.readFile(path.join(dir, MANIFEST_NAME), 'utf8');
  assert.ok(raw.endsWith('\n'));
});

test('recordSkill does not mutate its input', () => {
  const base = emptyManifest();
  recordSkill(base, {
    name: 'demo', tier: 'craft', pathway: 'engine', files: {}, now: '2026-01-01T00:00:00.000Z',
  });
  assert.deepEqual(base.skills, {});
});

test('recordSkill stores the injected time, not the clock', () => {
  const mf = recordSkill(emptyManifest(), {
    name: 'demo', tier: 'craft', pathway: 'engine', files: {}, now: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(mf.skills.demo.installedAt, '2026-01-01T00:00:00.000Z');
});

test('refuses a manifest whose recorded path leaves its own directory', async () => {
  // Retirement turned a recorded path into a delete instruction, executed
  // verbatim. path.join neutralises a leading separator and does NOT neutralise
  // `..`, so a matching hash on ../../../victim deleted a file outside the
  // tree with no --force. A bare `..` took the whole skills directory.
  const dir = await tmp();
  for (const rel of ['../../../victim/keep.txt', '..', 'a/../../b']) {
    await fs.writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify({
      schema: 1,
      skills: { 'demo-craft': { tier: 'craft', pathway: 'engine', files: { [rel]: 'a'.repeat(64) } } },
    }));
    await assert.rejects(() => readManifest(dir), /outside/, `must refuse ${rel}`);
  }
});

test('refuses a recorded path that resolves to the skill directory itself', async () => {
  // The `..` scan is not sufficient, because normalization can consume every
  // `..` and leave nothing to find. `.` and `sub/..` both normalize to `.`, and
  // path.join then yields the skill directory, which removeAt deletes whole —
  // including the files the manifest never recorded. `./` and `a/` reach the
  // same place by a trailing separator rather than by `..`.
  const dir = await tmp();
  for (const rel of ['.', 'sub/..', './', 'a/']) {
    await fs.writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify({
      schema: 1,
      skills: { 'demo-craft': { tier: 'craft', pathway: 'engine', files: { [rel]: 'a'.repeat(64) } } },
    }));
    await assert.rejects(() => readManifest(dir), /outside/, `must refuse ${JSON.stringify(rel)}`);
  }
});

test('refuses a recorded path that is not already in normal form', async () => {
  // Consumers join the RAW key, so a key normalization would change is a key
  // whose text and whose effect disagree. `a/.` and `a/b/..` resolve to `a`, an
  // intermediate directory that removeAt deletes recursively. `a//b` and
  // `a/./b` and `./a` name a file by a path that is not the recorded one.
  const dir = await tmp();
  for (const rel of ['a/.', 'a/b/..', 'a//b', 'a/./b', './a']) {
    await fs.writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify({
      schema: 1,
      skills: { 'demo-craft': { tier: 'craft', pathway: 'engine', files: { [rel]: 'a'.repeat(64) } } },
    }));
    await assert.rejects(() => readManifest(dir), /outside/, `must refuse ${JSON.stringify(rel)}`);
  }
});

test('an ordinary nested path is still accepted', async () => {
  const dir = await tmp();
  await fs.writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify({
    schema: 1,
    skills: { 'demo-craft': { tier: 'craft', pathway: 'engine', files: { 'references/guide.md': 'a'.repeat(64) } } },
  }));
  const mf = await readManifest(dir);
  assert.ok(mf.skills['demo-craft'].files['references/guide.md']);
});

test('refuses a manifest whose skill name is not a directory name', async () => {
  // uninstall's name validation was widened to accept any name a manifest
  // records, which is right for a withdrawn skill. The name is then joined as
  // a path component, so ../../../victim passed validation BECAUSE it was
  // recorded, and was then dereferenced.
  const dir = await tmp();
  for (const name of ['../../../victim', 'a/b', '..']) {
    await fs.writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify({
      schema: 1, skills: { [name]: { tier: 'craft', pathway: 'engine', files: {} } },
    }));
    await assert.rejects(() => readManifest(dir), /not a directory name/, `must refuse ${name}`);
  }
});

test('an absolute recorded path is refused too', async () => {
  const dir = await tmp();
  await fs.writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify({
    schema: 1,
    skills: { 'demo-craft': { tier: 'craft', pathway: 'engine', files: { '/etc/hosts': 'a'.repeat(64) } } },
  }));
  await assert.rejects(() => readManifest(dir), /outside/);
});
