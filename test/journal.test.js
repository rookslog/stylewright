import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { installSkills } from '../src/install.js';
import { readManifestWithIdentity, emptyManifest, writeManifest } from '../src/manifest.js';
import {
  recoverPending, addPending, clearPending, hasPending, stagingPath,
} from '../src/journal.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-jrnl-'));
const exists = (p) => fs.access(p).then(() => true, () => false);
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * The state an interrupted run leaves: a manifest stating what it was about to
 * write and what it was about to write there, and whatever reached the disk.
 */
async function interrupted(target, { pending, manifest = emptyManifest() }) {
  const { identity } = await readManifestWithIdentity(target);
  await writeManifest(target, { ...manifest, pending }, identity);
  return (await readManifestWithIdentity(target)).manifest;
}

async function put(abs, body) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
  return sha(body);
}

test('a file an interrupted run copied and never recorded goes', async () => {
  // The gap this closes: `installSkills` copied every file and wrote one record
  // at the end, so a run that died in between left files that nothing named.
  // `uninstall` removes what the manifest records, so nothing could reach them.
  const target = await tmp();
  const skill = await put(path.join(target, 'demo-craft', 'SKILL.md'), 'the skill\n');
  const guide = await put(path.join(target, 'demo-craft', 'references', 'guide.md'), 'a guide\n');
  const manifest = await interrupted(target, {
    pending: {
      'demo-craft': {
        LICENSE: sha('a licence\n'), 'SKILL.md': skill, 'references/guide.md': guide,
      },
    },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, ['demo-craft/SKILL.md', 'demo-craft/references/guide.md']);
  assert.ok(!(await exists(path.join(target, 'demo-craft'))), 'the emptied tree is pruned');
  assert.equal(hasPending(done.manifest), false);
});

test('a file the user wrote at a stated path stays', async () => {
  // The statement is committed BEFORE the bytes, so a path it names may never
  // have been written at all. Treating every stated path as this engine's
  // deleted whatever the user put there in the meantime. The content is the
  // proof of ownership, and theirs does not match.
  const target = await tmp();
  const mine = path.join(target, 'demo-craft', 'SKILL.md');
  await put(mine, 'my own work\n');
  const manifest = await interrupted(target, {
    pending: { 'demo-craft': { 'SKILL.md': sha('what the release ships\n') } },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.equal(await fs.readFile(mine, 'utf8'), 'my own work\n');
});

test('a file another run committed at a stated path stays', async () => {
  // Two runs installing one version state the same bytes, so the winner's file
  // is byte for byte what the loser meant to write. Deleting it would leave the
  // winner's record naming nothing, which is the defect arriving from the other
  // side.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const { manifest } = await readManifestWithIdentity(target);
  const recorded = manifest.skills['demo-craft'].files;

  const done = await recoverPending(target, { ...manifest, pending: { 'demo-craft': recorded } });

  assert.deepEqual(done.removed, []);
  for (const rel of Object.keys(recorded)) {
    assert.ok(await exists(path.join(target, 'demo-craft', rel)), `${rel} survives`);
  }
});

test('a file this engine wrote goes even where another run recorded the path', async () => {
  // Two runs from different releases. The loser's bytes sit at a path the
  // winner recorded with a different hash, so the record and the file disagree
  // and every later command reads the file as one the user edited. The loser's
  // bytes are provably the loser's, and removing them leaves a record the next
  // install restores from.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const { manifest } = await readManifestWithIdentity(target);
  const abs = path.join(target, 'demo-craft', 'SKILL.md');
  const theirs = await put(abs, 'the other release\n');

  const done = await recoverPending(target, {
    ...manifest, pending: { 'demo-craft': { 'SKILL.md': theirs } },
  });

  assert.deepEqual(done.removed, ['demo-craft/SKILL.md']);
  assert.ok(!(await exists(abs)));
  assert.ok(
    Object.hasOwn(done.manifest.skills['demo-craft'].files, 'SKILL.md'),
    'and the record that restores it stays');
});

test('a staging file goes, whatever it holds', async () => {
  // A copy that stopped part way left it, and its name belongs to this tool.
  // Nothing else can be at that path by accident, and a fragment is exactly
  // what cannot be identified by content.
  const target = await tmp();
  const abs = path.join(target, 'demo-craft', 'SKILL.md');
  await put(stagingPath(abs), 'half of a co');
  const manifest = await interrupted(target, {
    pending: { 'demo-craft': { 'SKILL.md': sha('the whole thing\n') } },
  });

  await recoverPending(target, manifest);

  assert.ok(!(await exists(stagingPath(abs))));
  assert.ok(!(await exists(path.join(target, 'demo-craft'))), 'and the emptied tree is pruned');
});

test('a recorded file is not a staging leftover, whatever it is called', async () => {
  // The suffix belongs to this tool, but a manifest that records a path spelled
  // that way records an installed file. Removing it left the record naming
  // nothing.
  const target = await tmp();
  const odd = await put(path.join(target, 'demo-craft', 'A.stylewright-part'), 'a real file\n');
  const manifest = await interrupted(target, {
    manifest: {
      schema: 1,
      skills: { 'demo-craft': { tier: 'craft', files: { 'A.stylewright-part': odd } } },
    },
    pending: { 'demo-craft': { A: sha('what the release ships\n') } },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.equal(
    await fs.readFile(path.join(target, 'demo-craft', 'A.stylewright-part'), 'utf8'),
    'a real file\n');
});

test('what the engine could not have written is left alone', async () => {
  // This engine copies files. A directory or a link at a stated path is
  // something else's, and a recovery that removed it would be destroying work on
  // the strength of a statement that never named it.
  const target = await tmp();
  const outside = path.join(await tmp(), 'theirs.md');
  await fs.writeFile(outside, 'mine\n');
  await fs.mkdir(path.join(target, 'demo-craft', 'LICENSE'), { recursive: true });
  await fs.writeFile(path.join(target, 'demo-craft', 'LICENSE', 'note.md'), 'mine\n');
  await fs.symlink(outside, path.join(target, 'demo-craft', 'SKILL.md'));
  const manifest = await interrupted(target, {
    pending: { 'demo-craft': { LICENSE: sha('a licence\n'), 'SKILL.md': sha('mine\n') } },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.equal(
    await fs.readFile(path.join(target, 'demo-craft', 'LICENSE', 'note.md'), 'utf8'), 'mine\n');
  assert.equal(await fs.readFile(outside, 'utf8'), 'mine\n');
  assert.ok((await fs.lstat(path.join(target, 'demo-craft', 'SKILL.md'))).isSymbolicLink());
});

test('a stated path is not deleted through a symbolic link', async () => {
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
    pending: { 'demo-craft': { 'extra/gone.md': sha('not ours\n') } },
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
  const { manifest: theirs } = await readManifestWithIdentity(other);
  await fs.mkdir(target, { recursive: true });
  await fs.symlink(path.join(other, 'demo-craft'), path.join(target, 'demo-craft'));
  const manifest = await interrupted(target, {
    pending: { 'demo-craft': { 'SKILL.md': theirs.skills['demo-craft'].files['SKILL.md'] } },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.ok(await exists(path.join(other, 'demo-craft', 'SKILL.md')));
});

test('a statement is added and withdrawn without mutating the manifest', async () => {
  const before = emptyManifest();
  const stated = addPending(before, 'demo', { 'SKILL.md': sha('x') });
  assert.equal(before.pending, undefined);
  assert.deepEqual(stated.pending, { demo: { 'SKILL.md': sha('x') } });

  const cleared = clearPending(stated, 'demo');
  assert.equal(cleared.pending, undefined, 'an empty statement leaves no key behind');
  assert.deepEqual(stated.pending, { demo: { 'SKILL.md': sha('x') } });

  const two = addPending(addPending(before, 'a', { x: '1' }), 'b', { y: '2' });
  assert.deepEqual(clearPending(two, 'a').pending, { b: { y: '2' } });
});

test('a pending skill named constructor is judged by its record, not the prototype', async () => {
  // `constructor` satisfies the skill-name rule, and `manifest.skills[name]`
  // finds the prototype's member for it, so the retention condition read an
  // absent record as present and kept the emptied directory.
  const target = await tmp();
  const dir = path.join(target, 'constructor');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), 'half-installed\n');
  const manifest = {
    ...emptyManifest(),
    pending: { constructor: { 'SKILL.md': sha('half-installed\n') } },
  };
  const done = await recoverPending(target, manifest);
  assert.deepEqual(done.cleared, ['constructor']);
  assert.ok(!(await exists(dir)), 'the emptied directory must be pruned');
});
