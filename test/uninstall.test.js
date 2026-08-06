import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { uninstallSkills } from '../src/uninstall.js';
import {
  readManifest, readManifestWithIdentity, writeManifest, hashFile, MANIFEST_NAME,
} from '../src/manifest.js';
import { VERSION } from '../src/version.js';
import crypto from 'node:crypto';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
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
  assert.deepEqual(res, {
    removed: [], missing: ['demo-craft'], skipped: [], recovered: [], cleared: [],
  });
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

test('a symlinked ancestor is refused, and nothing is deleted through it', async () => {
  // This module reached fs.rm directly and imported one of the four filesystem
  // primitives, so every rule the install path learned across four review
  // rounds was absent here. Install refused this exact shape; uninstall
  // executed it.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const outsideDir = await tmp();
  const outsideFile = path.join(outsideDir, 'notes.md');
  await fs.writeFile(outsideFile, 'mine\n');
  await fs.symlink(outsideDir, path.join(target, 'demo-craft', 'extra'));

  const m = await readManifest(target);
  m.skills['demo-craft'].files['extra/notes.md'] = 'f'.repeat(64);
  await fs.writeFile(
    path.join(target, MANIFEST_NAME), `${JSON.stringify(m, null, 2)}\n`);

  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.deepEqual(res.removed, []);
  assert.ok(res.skipped[0].files.includes('extra'), JSON.stringify(res.skipped));
  assert.ok(await exists(outsideFile), 'must not delete outside the target tree');
});

test('a recorded path that became a directory does not throw part-way', async () => {
  // fs.rm without recursive threw ERR_FS_EISDIR mid-loop. Earlier entries were
  // already deleted and the manifest was never rewritten, so the files were
  // gone and the records still claimed them. A retry threw at the same row.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const swapped = path.join(target, 'demo-craft', 'LICENSE');
  await fs.rm(swapped);
  await fs.mkdir(swapped);

  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'], force: true });
  assert.deepEqual(res.removed, ['demo-craft']);
  assert.ok(!(await exists(swapped)));
});

test('a skill directory replaced by a link to another install is refused', async () => {
  // `ancestorsOf` names components BELOW destDir and cannot name destDir, so
  // the skill directory itself was never classified. The leaves resolved
  // through the link, matched their recorded hashes because they were the same
  // files, and the removal ran inside the OTHER installation.
  const mine = await tmp();
  const theirs = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: mine, names: ['demo-craft'], now: NOW });
  await installSkills({ repoRoot: REPO, targetDir: theirs, names: ['demo-craft'], now: NOW });
  const swapped = path.join(mine, 'demo-craft');
  await fs.rm(swapped, { recursive: true, force: true });
  await fs.symlink(path.join(theirs, 'demo-craft'), swapped);

  for (const force of [false, true]) {
    const res = await uninstallSkills({ targetDir: mine, names: ['demo-craft'], force });
    assert.deepEqual(res.removed, [], `must remove nothing with force=${force}`);
    assert.equal(res.skipped[0].reason, 'not-ours');
    assert.ok(await exists(path.join(theirs, 'demo-craft', 'SKILL.md')),
      `the other installation survives force=${force}`);
  }
});

test('a self-referential link at an ancestor is reported, not followed', async () => {
  // Once blockedAncestors has found the blocker the skill is refused whatever
  // the leaf turns out to be, so reaching for the leaf is a syscall through the
  // thing we just refused to trust. lstat on references/guide.md threw ELOOP
  // out of uninstall instead of returning the not-ours skip.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const refs = path.join(target, 'demo-craft', 'references');
  await fs.rm(refs, { recursive: true, force: true });
  await fs.symlink(refs, refs); // points at itself

  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.deepEqual(res.removed, []);
  assert.equal(res.skipped[0].reason, 'not-ours');
  assert.ok(res.skipped[0].files.includes('references'), JSON.stringify(res.skipped));
});

test('a directory whose name begins with two periods is pruned', async () => {
  // pruneEmpty tested path.relative's result with startsWith('..'), so a child
  // legitimately named `..cache` read as an escape and was never pruned, which
  // also kept the skill directory alive after the manifest entry went.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const odd = path.join(target, 'demo-craft', '..cache');
  await fs.mkdir(odd);
  await fs.writeFile(path.join(odd, 'file.md'), 'x\n');
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  m.skills['demo-craft'].files['..cache/file.md'] = await hashFile(path.join(odd, 'file.md'));
  await writeManifest(target, m, identity);

  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.deepEqual(res.removed, ['demo-craft'], JSON.stringify(res.skipped));
  assert.ok(!(await exists(odd)), 'the ..cache directory must be pruned');
  assert.ok(!(await exists(path.join(target, 'demo-craft'))), 'and so must its parent');
});

test('--force does not empty a directory standing where a recorded file was', async () => {
  // `--force` means "remove a file I edited". A directory at a recorded path
  // holds files the manifest never recorded, and removeAt deletes a directory
  // recursively, so forcing here deleted the user's work rather than ours. The
  // CLI's own advice was to pass --force, which made it the likely path.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const recorded = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.rm(recorded);
  await fs.mkdir(recorded);
  const mine = path.join(recorded, 'notes.md');
  await fs.writeFile(mine, 'my own notes\n');

  for (const force of [false, true]) {
    const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'], force });
    assert.deepEqual(res.removed, [], `must remove nothing with force=${force}`);
    assert.equal(res.skipped[0].reason, 'not-ours', `force=${force} is not a remedy here`);
    assert.deepEqual(res.skipped[0].files, ['SKILL.md']);
    assert.equal(await fs.readFile(mine, 'utf8'), 'my own notes\n', `notes survive force=${force}`);
  }
});

test('a file you edited is kept, and --force removes it', async () => {
  // "uninstall removes only, and all of, what the installer wrote." A file the
  // user rewrote is not what the installer wrote, and install already refuses
  // to overwrite one.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const mine = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.writeFile(mine, 'my own words\n');

  const kept = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  assert.deepEqual(kept.removed, []);
  assert.deepEqual(kept.skipped[0].files, ['SKILL.md']);
  assert.equal(await fs.readFile(mine, 'utf8'), 'my own words\n');

  const forced = await uninstallSkills({ targetDir: target, names: ['demo-craft'], force: true });
  assert.deepEqual(forced.removed, ['demo-craft']);
  assert.ok(!(await exists(mine)));
});

test('an uninstall that has already deleted records the deletion', async () => {
  // Install refuses a race before it copies, and that refusal costs nothing.
  // This command has already deleted by the time it writes, so the same refusal
  // would leave the manifest claiming files that are gone and exit non-zero on
  // a removal that happened. The record catches up to the tree instead, and it
  // takes out only what this command removed.
  const target = await tmp();
  await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft', 'demo-standard'], now: NOW,
  });

  const original = fs.rm;
  let raced = false;
  fs.rm = async (...args) => {
    const result = await original.apply(fs, args);
    // Another run rewrites the manifest while this one is deleting.
    if (!raced && String(args[0]).includes('demo-craft')) {
      raced = true;
      const { manifest, identity } = await readManifestWithIdentity(target);
      await writeManifest(target, { ...manifest, note: undefined }, identity);
    }
    return result;
  };
  let res;
  try {
    res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  } finally {
    fs.rm = original;
  }

  assert.deepEqual(res.removed, ['demo-craft']);
  const mf = await readManifest(target);
  assert.deepEqual(Object.keys(mf.skills), ['demo-standard'], 'the record caught up');
  assert.ok(!(await exists(path.join(target, 'demo-craft'))));
  assert.ok(await exists(path.join(target, 'demo-standard', 'SKILL.md')));
});

test('a skill another run reinstalled keeps its record', async () => {
  // The deletion happened, and then another run put the skill back. Taking the
  // entry out by name would leave its files on disk with nothing naming them —
  // the same defect this change closes, arriving from the other direction. What
  // decides is the tree: a record whose files are there is not this command's
  // to withdraw.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const { manifest, identity } = await readManifestWithIdentity(target);
  const original = fs.rm;
  let raced = false;
  fs.rm = async (...args) => {
    const result = await original.apply(fs, args);
    // The files come back, and the record with them, after this command has
    // deleted the last one. The lock keeps another COMMAND out; it cannot keep
    // a hand out, and the rule has to hold either way.
    if (!raced && String(args[0]).endsWith('guide.md')) {
      raced = true;
      await fs.cp(
        path.join(REPO, 'skills', 'craft', 'demo-craft'),
        path.join(target, 'demo-craft'),
        { recursive: true });
      await writeManifest(target, manifest, identity);
    }
    return result;
  };
  try {
    await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  } finally {
    fs.rm = original;
  }

  assert.ok(raced, 'the race must have been injected');
  const mf = await readManifest(target);
  assert.deepEqual(Object.keys(mf.skills), ['demo-craft'], 'the reinstall keeps its record');
  for (const [rel, hash] of Object.entries(mf.skills['demo-craft'].files)) {
    const abs = path.join(target, 'demo-craft', rel);
    assert.ok(await exists(abs), `${rel} is on disk and recorded`);
    assert.equal(await hashFile(abs), hash);
  }
});

test('the last uninstall keeps a manifest that now holds another run\'s statement', async () => {
  // The manifest goes when the last skill goes. A statement another run wrote
  // meanwhile names files it is about to create, so the file that would reach
  // them must survive even though no skill is recorded in it.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const original = fs.rm;
  let raced = false;
  fs.rm = async (...args) => {
    const result = await original.apply(fs, args);
    if (!raced && String(args[0]).includes('demo-craft')) {
      raced = true;
      const { manifest, identity } = await readManifestWithIdentity(target);
      await writeManifest(
        target,
        { ...manifest, pending: { 'demo-standard': { 'SKILL.md': sha256('half a copy\n') } } },
        identity);
    }
    return result;
  };
  try {
    await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  } finally {
    fs.rm = original;
  }

  const mf = await readManifest(target);
  assert.deepEqual(mf.skills, {});
  assert.deepEqual(mf.pending, { 'demo-standard': { 'SKILL.md': sha256('half a copy\n') } });
});

test('the record catches up even when the manifest changes twice', async () => {
  // The reconcile reads, applies, and writes, and the write can lose the same
  // race the read just won. It tries again rather than leaving the manifest
  // claiming files this command has already deleted.
  const target = await tmp();
  await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft', 'demo-standard'], now: NOW,
  });

  const original = fs.stat;
  let raced = false;
  fs.stat = async (...args) => {
    // Between the reconcile's read and the exclusion it takes to write. The
    // first attempt therefore finds a manifest it did not read and is refused,
    // and the second reads that one and applies the removal to it.
    if (!raced && String(args[0]).endsWith(MANIFEST_NAME)) {
      raced = true;
      const { manifest, identity } = await readManifestWithIdentity(target);
      await writeManifest(target, manifest, identity);
    }
    return original.apply(fs, args);
  };
  let res;
  try {
    res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  } finally {
    fs.stat = original;
  }

  assert.deepEqual(res.removed, ['demo-craft']);
  assert.ok(raced, 'the race must have been injected');
  assert.deepEqual(Object.keys((await readManifest(target)).skills), ['demo-standard']);
});

test('an uninstall keeps a skill another run installed while it worked', async () => {
  // The record is reapplied, not rewritten from what this command read. A
  // rewrite would drop the entry for a skill that arrived meanwhile and strand
  // its files.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const other = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: other, names: ['demo-standard'], now: NOW });
  const { manifest: theirs } = await readManifestWithIdentity(other);

  const original = fs.rm;
  let raced = false;
  fs.rm = async (...args) => {
    const result = await original.apply(fs, args);
    if (!raced && String(args[0]).includes('demo-craft')) {
      raced = true;
      // A second skill and its record arrive while this command works.
      await fs.cp(path.join(other, 'demo-standard'), path.join(target, 'demo-standard'),
        { recursive: true });
      const fresh = await readManifestWithIdentity(target);
      await writeManifest(target, {
        ...fresh.manifest,
        skills: { ...fresh.manifest.skills, 'demo-standard': theirs.skills['demo-standard'] },
      }, fresh.identity);
    }
    return result;
  };
  let res;
  try {
    res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });
  } finally {
    fs.rm = original;
  }

  assert.deepEqual(res.removed, ['demo-craft']);
  const mf = await readManifest(target);
  assert.deepEqual(Object.keys(mf.skills), ['demo-standard']);
  for (const rel of Object.keys(mf.skills['demo-standard'].files)) {
    assert.ok(await exists(path.join(target, 'demo-standard', rel)), `${rel} survives`);
  }
});

test('a manifest write a killed run left half done is refused by name, not deleted', async () => {
  // This test once asserted the opposite: that the command deletes the file
  // and carries on, on the argument that holding the lock means the file can
  // only be a killed run's. A review broke the inference — the lock proves no
  // command is active NOW, not who wrote an existing file, and the user can
  // put a file at this name too. The refusal comes before any deletion, so
  // nothing is removed while the record still claims it, and the message
  // names the one file to remove.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const half = path.join(target, `${MANIFEST_NAME}.tmp`);
  await fs.writeFile(half, 'half a manifest');

  await assert.rejects(
    () => uninstallSkills({ targetDir: target, names: ['demo-craft'] }),
    /is in the way/);
  assert.equal(await fs.readFile(half, 'utf8'), 'half a manifest');
  assert.ok(await exists(path.join(target, 'demo-craft', 'SKILL.md')),
    'nothing is deleted while the write is refused');
});

test('an uninstall whose only work was the cleanup leaves nothing behind', async () => {
  // The record of nothing is the interrupted run's last trace, and this command
  // returned before it could go.
  const parent = await tmp();
  const target = path.join(parent, 'skills');
  const orphan = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(path.dirname(orphan), { recursive: true });
  await fs.writeFile(orphan, 'half a copy\n');
  await writeManifest(target, {
    schema: 1, skills: {}, pending: { 'demo-craft': { 'SKILL.md': sha256('half a copy\n') } },
  }, null);

  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });

  assert.deepEqual(res.removed, []);
  assert.deepEqual(res.cleared, ['demo-craft']);
  assert.deepEqual(res.recovered, ['demo-craft/SKILL.md']);
  assert.ok(!(await exists(target)), 'nothing of this tool is left');
});

test('a skill this command cleared is not also reported as never installed', async () => {
  const parent = await tmp();
  const target = path.join(parent, 'skills');
  const orphan = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(path.dirname(orphan), { recursive: true });
  await fs.writeFile(orphan, 'half a copy\n');
  await writeManifest(target, {
    schema: 1, skills: {}, pending: { 'demo-craft': { 'SKILL.md': sha256('half a copy\n') } },
  }, null);

  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });

  assert.deepEqual(res.cleared, ['demo-craft']);
  assert.deepEqual(res.missing, [], 'it was there, and this command dealt with it');
});

test('an uninstall clears what an interrupted install left', async () => {
  // This command's promise is that it removes what the installer wrote. The
  // leavings of an install that did not come back belong to no skill entry, so
  // this is the only command that can reach them, and it did not.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const orphan = path.join(target, 'demo-standard', 'SKILL.md');
  await fs.mkdir(path.dirname(orphan), { recursive: true });
  await fs.writeFile(orphan, 'half a copy\n');
  const { manifest, identity } = await readManifestWithIdentity(target);
  await writeManifest(target, {
    ...manifest,
    pending: {
      'demo-standard': { LICENSE: sha256('a licence\n'), 'SKILL.md': sha256('half a copy\n') },
    },
  }, identity);

  const res = await uninstallSkills({ targetDir: target, names: ['demo-craft'] });

  assert.deepEqual(res.removed, ['demo-craft']);
  assert.deepEqual(res.recovered, ['demo-standard/SKILL.md']);
  assert.ok(!(await exists(path.join(target, 'demo-standard'))));
  assert.ok(!(await exists(target)), 'and the emptied directory goes with the last skill');
});

test('a skill named constructor that was never installed is missing, not an entry', async () => {
  // The bare lookup handed the loop the prototype's `constructor` as the
  // entry, so an uninstall of a never-installed name proceeded on a function.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const res = await uninstallSkills({ targetDir: target, names: ['constructor'] });
  assert.deepEqual(res.missing, ['constructor']);
  assert.deepEqual(res.removed, []);
});
