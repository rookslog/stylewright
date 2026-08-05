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

test('refuses a component whose Win32 spelling would be trimmed', async () => {
  // `path.normalize` is not the resolver the filesystem uses. Win32 strips a
  // trailing space or period from a component, so `.. /victim` is already in
  // normal form, has no component equal to `..`, and still resolves through the
  // parent. Ambiguity between our check and the resolver is refused, not read.
  const dir = await tmp();
  for (const rel of ['.. /victim', 'a /b', 'a./b', 'refs/guide.md ']) {
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

// The manifest was the one destination that never went through the checks in
// `src/tree.js`. Everything below reproduces what that cost, against the code
// as published in 0.2.0.

test('a symlinked manifest is refused on read, and never followed', async () => {
  const dir = await tmp();
  const outside = path.join(await tmp(), 'precious.json');
  await fs.writeFile(outside, '{"schema":1,"skills":{}}\n');
  await fs.symlink(outside, path.join(dir, MANIFEST_NAME));

  await assert.rejects(readManifest(dir), /is a symlink, not a regular file/);
});

test('a symlinked manifest is refused on write, and its target survives', async () => {
  const dir = await tmp();
  const outside = path.join(await tmp(), 'precious.txt');
  await fs.writeFile(outside, 'mine\n');
  await fs.symlink(outside, path.join(dir, MANIFEST_NAME));

  await assert.rejects(writeManifest(dir, emptyManifest()), /is a symlink/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'mine\n');
});

test('a manifest that is a directory is refused, not crashed on', async () => {
  const dir = await tmp();
  await fs.mkdir(path.join(dir, MANIFEST_NAME));
  await assert.rejects(readManifest(dir), /is a directory, not a regular file/);
});

test('a manifest of the wrong shape is refused where it is read', async () => {
  const dir = await tmp();
  const write = async (body) => fs.writeFile(path.join(dir, MANIFEST_NAME), body);

  await write('[]\n');
  await assert.rejects(readManifest(dir), /does not hold an object/);

  await write('{"schema":2,"skills":{}}\n');
  await assert.rejects(readManifest(dir), /"schema" is 2, not 1/);

  await write('{"schema":1}\n');
  await assert.rejects(readManifest(dir), /"skills" is not an object/);

  // The shape that reached uninstall as `Object.keys(undefined)`.
  await write('{"schema":1,"skills":{"a":{"tier":"craft"}}}\n');
  await assert.rejects(readManifest(dir), /"a" records no files/);

  await write('{"schema":1,"skills":{"a":{"files":{"SKILL.md":null}}}}\n');
  await assert.rejects(readManifest(dir), /"a" records no hash for "SKILL.md"/);
});

test('a manifest linked away after the check is not read through', async () => {
  const dir = await tmp();
  const abs = path.join(dir, MANIFEST_NAME);
  await fs.writeFile(abs, '{"schema":1,"skills":{}}\n');
  const outside = path.join(await tmp(), 'theirs.json');
  await fs.writeFile(outside, '{"schema":1,"skills":{"theirs":{"files":{}}}}\n');

  const original = fs.lstat;
  let swapped = false;
  fs.lstat = async (...args) => {
    const st = await original.apply(fs, args);
    // The classification passes, and the manifest becomes a link before the
    // read. A read that follows it acts on somebody else's record.
    if (!swapped && String(args[0]) === abs) {
      swapped = true;
      await fs.rm(abs);
      await fs.symlink(outside, abs);
    }
    return st;
  };
  try {
    await assert.rejects(readManifest(dir), /changed while this command was reading it/);
  } finally {
    fs.lstat = original;
  }
});

test('a write leaves no temporary file behind, and replaces in one step', async () => {
  const dir = await tmp();
  await writeManifest(dir, emptyManifest());
  await writeManifest(dir, emptyManifest());
  assert.deepEqual(await fs.readdir(dir), [MANIFEST_NAME]);

  // A rename does not follow a link, so the manifest cannot be the path that
  // carries a write out of its directory.
  const st = await fs.lstat(path.join(dir, MANIFEST_NAME));
  assert.ok(st.isFile());
});
