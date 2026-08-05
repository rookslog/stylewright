import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { readManifestWithIdentity, emptyManifest, writeManifest } from '../src/manifest.js';
import { recoverPending, addPending, clearPending, hasPending } from '../src/journal.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-jrnl-'));
const exists = (p) => fs.access(p).then(() => true, () => false);

/**
 * The state an interrupted run leaves: a manifest that states what it was about
 * to write, and whatever of it reached the disk.
 */
async function interrupted(target, { pending, manifest = emptyManifest() }) {
  const { identity } = await readManifestWithIdentity(target);
  await writeManifest(target, { ...manifest, pending }, identity);
  return (await readManifestWithIdentity(target)).manifest;
}

async function put(abs, body) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
}

test('a file an interrupted run copied and never recorded goes', async () => {
  // The gap this closes: `installSkills` copied every file and wrote one record
  // at the end, so a run that died in between left files that nothing named.
  // `uninstall` removes what the manifest records, so nothing could reach them.
  const target = await tmp();
  await put(path.join(target, 'demo-craft', 'SKILL.md'), 'half a copy\n');
  await put(path.join(target, 'demo-craft', 'references', 'guide.md'), 'half a copy\n');
  const manifest = await interrupted(target, {
    pending: { 'demo-craft': ['LICENSE', 'SKILL.md', 'references/guide.md'] },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, ['demo-craft/SKILL.md', 'demo-craft/references/guide.md']);
  assert.ok(!(await exists(path.join(target, 'demo-craft'))), 'the emptied tree is pruned');
  assert.equal(hasPending(done.manifest), false);
});

test('a recorded file the run had not reached stays', async () => {
  // The other half of the same rule. An update states every path it will write,
  // and a run that died before it touched one must not take the installed copy
  // with it.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const { manifest } = await readManifestWithIdentity(target);
  const recorded = Object.keys(manifest.skills['demo-craft'].files);

  const done = await recoverPending(
    target, { ...manifest, pending: { 'demo-craft': recorded } });

  assert.deepEqual(done.removed, []);
  for (const rel of recorded) {
    assert.ok(await exists(path.join(target, 'demo-craft', rel)), `${rel} survives`);
  }
});

test('a recorded path is left alone, whatever it now holds', async () => {
  // A killed `copyFile` leaves a fragment, and nothing on disk tells a fragment
  // apart from an edit the user made after the interrupted run. Both are at a
  // path the manifest records, so both are reachable and neither is this
  // function's to delete. An earlier version compared the hash and deleted the
  // mismatch, which deleted the user's work without `--force`.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const { manifest } = await readManifestWithIdentity(target);
  const edited = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.writeFile(edited, 'my own words\n');

  const done = await recoverPending(target, {
    ...manifest,
    pending: { 'demo-craft': Object.keys(manifest.skills['demo-craft'].files) },
  });

  assert.deepEqual(done.removed, []);
  assert.equal(await fs.readFile(edited, 'utf8'), 'my own words\n');
  assert.deepEqual(
    Object.keys(done.manifest.skills['demo-craft'].files).sort(),
    ['LICENSE', 'SKILL.md', 'references/guide.md']);
});

test('a path the same statement names but no record does go', async () => {
  // The two halves of one statement. A skill being updated states every path it
  // will write, and a path the previous version never shipped is a path only
  // this interrupted run could have created.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const { manifest } = await readManifestWithIdentity(target);
  const fresh = path.join(target, 'demo-craft', 'references', 'added.md');
  await fs.writeFile(fresh, 'from the release that did not finish\n');

  const done = await recoverPending(target, {
    ...manifest,
    pending: {
      'demo-craft': [...Object.keys(manifest.skills['demo-craft'].files), 'references/added.md'],
    },
  });

  assert.deepEqual(done.removed, ['demo-craft/references/added.md']);
  assert.ok(!(await exists(fresh)));
  assert.ok(await exists(path.join(target, 'demo-craft', 'references', 'guide.md')));
});

test('what the engine could not have written is left alone', async () => {
  // This engine copies files. A directory or a link at a pending path is
  // something else's, and a recovery that removed it would be destroying work
  // on the strength of a record that never named it.
  const target = await tmp();
  const outside = path.join(await tmp(), 'theirs.md');
  await fs.writeFile(outside, 'mine\n');
  await fs.mkdir(path.join(target, 'demo-craft', 'LICENSE'), { recursive: true });
  await fs.writeFile(path.join(target, 'demo-craft', 'LICENSE', 'note.md'), 'mine\n');
  await fs.symlink(outside, path.join(target, 'demo-craft', 'SKILL.md'));
  const manifest = await interrupted(target, {
    pending: { 'demo-craft': ['LICENSE', 'SKILL.md'] },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.equal(await fs.readFile(path.join(target, 'demo-craft', 'LICENSE', 'note.md'), 'utf8'), 'mine\n');
  assert.equal(await fs.readFile(outside, 'utf8'), 'mine\n');
  assert.ok((await fs.lstat(path.join(target, 'demo-craft', 'SKILL.md'))).isSymbolicLink());
});

test('a pending path is not deleted through a symbolic link', async () => {
  // Recovery is a delete instruction read from a file anyone can edit, so it
  // inherits the rule every other consumer of a recorded path follows: a
  // directory component that is a link is refused, not walked.
  const target = await tmp();
  const outsideDir = await tmp();
  const outsideFile = path.join(outsideDir, 'gone.md');
  await fs.writeFile(outsideFile, 'not ours\n');
  await fs.mkdir(path.join(target, 'demo-craft'), { recursive: true });
  await fs.symlink(outsideDir, path.join(target, 'demo-craft', 'extra'));
  const manifest = await interrupted(target, {
    pending: { 'demo-craft': ['extra/gone.md'] },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.equal(await fs.readFile(outsideFile, 'utf8'), 'not ours\n');
});

test('a skill directory replaced by a link to another install is refused', async () => {
  // `reachability` classifies the base directory as well, and this is the case
  // that needs it: every path under the link resolves into somebody else's
  // installation, where none of it is ours to remove.
  const target = await tmp();
  const other = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: other, names: ['demo-craft'], now: NOW });
  await fs.mkdir(target, { recursive: true });
  await fs.symlink(path.join(other, 'demo-craft'), path.join(target, 'demo-craft'));
  const manifest = await interrupted(target, {
    pending: { 'demo-craft': ['SKILL.md'] },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.ok(await exists(path.join(other, 'demo-craft', 'SKILL.md')));
});

test('a statement is added and withdrawn without mutating the manifest', async () => {
  const before = emptyManifest();
  const pended = addPending(before, 'demo', ['SKILL.md']);
  assert.equal(before.pending, undefined);
  assert.deepEqual(pended.pending, { demo: ['SKILL.md'] });

  const cleared = clearPending(pended, 'demo');
  assert.equal(cleared.pending, undefined, 'an empty statement leaves no key behind');
  assert.deepEqual(pended.pending, { demo: ['SKILL.md'] });

  const two = addPending(addPending(before, 'a', ['x']), 'b', ['y']);
  assert.deepEqual(clearPending(two, 'a').pending, { b: ['y'] });
});
