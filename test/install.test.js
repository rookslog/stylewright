import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { installSkills } from '../src/install.js';
import { stagingName } from '../src/journal.js';
import {
  readManifest, readManifestWithIdentity, writeManifest, hashFile, MANIFEST_NAME,
} from '../src/manifest.js';
import { VERSION } from '../src/version.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-inst-'));
const exists = (p) => fs.access(p).then(() => true, () => false);

test('copies the skill tree and writes a manifest', async () => {
  const target = await tmp();
  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW,
  });
  assert.deepEqual(res.installed, ['demo-standard']);
  assert.ok(await exists(path.join(target, 'demo-standard', 'SKILL.md')));
  assert.ok(await exists(path.join(target, 'demo-standard', 'SOURCE.md')));
  const mf = await readManifest(target);
  assert.equal(mf.skills['demo-standard'].tier, 'standards');
  assert.equal(mf.skills['demo-standard'].pathway, 'engine');
  assert.match(mf.skills['demo-standard'].files['SKILL.md'], /^[0-9a-f]{64}$/);
});

test('never installs a grounding matrix', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const entries = await fs.readdir(path.join(target, 'demo-standard'));
  assert.ok(!entries.some((e) => /grounding/i.test(e)));
  assert.ok(!(await exists(path.join(target, 'demo-standard', 'GROUNDING.md'))));
});

test('refuses to clobber a locally edited file without force', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const skillFile = path.join(target, 'demo-standard', 'SKILL.md');
  await fs.writeFile(skillFile, 'LOCAL EDIT\n');
  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW,
  });
  assert.deepEqual(res.installed, []);
  assert.equal(res.skipped[0].reason, 'locally-modified');
  assert.deepEqual(res.skipped[0].files, ['SKILL.md']);
  assert.equal(await fs.readFile(skillFile, 'utf8'), 'LOCAL EDIT\n');
});

test('force overwrites a locally edited file', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const skillFile = path.join(target, 'demo-standard', 'SKILL.md');
  await fs.writeFile(skillFile, 'LOCAL EDIT\n');
  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW, force: true,
  });
  assert.deepEqual(res.installed, ['demo-standard']);
  assert.notEqual(await fs.readFile(skillFile, 'utf8'), 'LOCAL EDIT\n');
});

test('rejects an unknown skill name', async () => {
  const target = await tmp();
  await assert.rejects(
    () => installSkills({ repoRoot: REPO, targetDir: target, names: ['nope'], now: NOW }),
    /nope/);
});

test('refuses to clobber a file it never wrote', async () => {
  // The drift check only covered paths already in the manifest, so a file the
  // user created at a path the skill also ships was overwritten with no
  // warning and no way back. This is data loss on a plain install, and it is
  // live in 0.1.0. Found while triaging the update review on PR #20.
  const target = await tmp();
  const mine = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(path.dirname(mine), { recursive: true });
  await fs.writeFile(mine, 'my own notes\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, []);
  assert.equal(res.skipped.length, 1);
  assert.equal(await fs.readFile(mine, 'utf8'), 'my own notes\n');
  assert.match(res.skipped[0].files.join(' '), /SKILL\.md/);
});

test('force overwrites a file it never wrote', async () => {
  const target = await tmp();
  const mine = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(path.dirname(mine), { recursive: true });
  await fs.writeFile(mine, 'my own notes\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(res.installed, ['demo-craft']);
  assert.notEqual(await fs.readFile(mine, 'utf8'), 'my own notes\n');
});

test('a file the user added beside the skill is left alone', async () => {
  // Only a COLLISION matters. A file at a path the skill does not ship is not
  // in the way, and must not block the install.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const note = path.join(target, 'demo-craft', 'NOTES.md');
  await fs.writeFile(note, 'mine\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, ['demo-craft']);
  assert.ok(await exists(note));
});

test('removes a file the previous version installed and this one does not', async () => {
  // A retired or renamed path stayed on disk while the manifest entry was
  // replaced. The file then belonged to nobody, so uninstall could not remove
  // it and the agent kept loading it.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  // Simulate a path that an older release shipped and this one dropped.
  const retired = path.join(target, 'demo-craft', 'references', 'gone.md');
  await fs.mkdir(path.dirname(retired), { recursive: true });
  await fs.writeFile(retired, 'from an older release\n');
  const { manifest, identity } = await readManifestWithIdentity(target);
  manifest.skills['demo-craft'].files['references/gone.md'] = await hashFile(retired);
  await writeManifest(target, manifest, identity);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, ['demo-craft']);
  assert.ok(!(await exists(retired)), 'the retired file must be removed');
  const after = await readManifest(target);
  assert.ok(!('references/gone.md' in after.skills['demo-craft'].files));
});

test('stamps the manifest with the release that wrote it', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  // Written by hand, not through writeManifest: writeManifest is now the thing
  // that applies the stamp, so it cannot be used to produce a stale one.
  const stale = await readManifest(target);
  stale.stylewrightVersion = '0.0.1-old';
  await fs.writeFile(
    path.join(target, MANIFEST_NAME), `${JSON.stringify(stale, null, 2)}\n`);
  assert.equal((await readManifest(target)).stylewrightVersion, '0.0.1-old');

  await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.equal((await readManifest(target)).stylewrightVersion, VERSION);
});

test('an install recorded with legacy Windows keys updates cleanly', async () => {
  // Releases up to 0.2.0 built keys with path.join, so a Windows install
  // recorded references\guide.md. An update over that manifest must read it,
  // recognise its own files, and leave the rewritten spelling behind — not
  // refuse and strand the install.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const legacy = await readManifest(target);
  legacy.skills['demo-craft'].files = Object.fromEntries(
    Object.entries(legacy.skills['demo-craft'].files)
      .map(([rel, hash]) => [rel.replaceAll('/', '\\'), hash]));
  await fs.writeFile(
    path.join(target, MANIFEST_NAME), `${JSON.stringify(legacy, null, 2)}\n`);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, ['demo-craft'], JSON.stringify(res.skipped));
  const mf = await readManifest(target);
  const keys = Object.keys(mf.skills['demo-craft'].files);
  assert.ok(keys.includes('references/guide.md'));
  assert.ok(keys.every((k) => !k.includes('\\')));
});

test('a dangling symlink at a shipping path is a collision, not an absence', async () => {
  // fs.access follows the link and throws ENOENT, so the path looked free.
  // copyFile then follows it and writes skill content OUTSIDE the target tree.
  const target = await tmp();
  const outside = path.join(await tmp(), 'escaped.md');
  const link = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(path.dirname(link), { recursive: true });
  await fs.symlink(outside, link);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, []);
  assert.equal(res.skipped.length, 1);
  assert.ok(!(await exists(outside)), 'must not write through the link');
});

test('a directory of retired files gives way to a file of the same name', async () => {
  // An old release shipped guide/part.md. The new one ships a file named
  // guide. The collision check saw a directory it had not recorded and
  // refused, and --force could not recover because the copy hit the directory
  // before the retirement loop ran.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const dir = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.rm(dir, { force: true });
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'part.md'), 'from an older release\n');
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  delete m.skills['demo-craft'].files['SKILL.md'];
  m.skills['demo-craft'].files['SKILL.md/part.md'] =
    await hashFile(path.join(dir, 'part.md'));
  await writeManifest(target, m, identity);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, ['demo-craft'], JSON.stringify(res.skipped));
  const stat = await fs.stat(path.join(target, 'demo-craft', 'SKILL.md'));
  assert.ok(stat.isFile(), 'the path must now be a file');
});

test('force clears a directory of the user files sitting where a file must go', async () => {
  // Without --force this is refused as a collision. With --force the user
  // asked to overwrite, and rmdir would have thrown ENOTEMPTY instead.
  const target = await tmp();
  const inTheWay = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(inTheWay, { recursive: true });
  await fs.writeFile(path.join(inTheWay, 'theirs.md'), 'mine\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(res.installed, ['demo-craft']);
  assert.ok((await fs.stat(inTheWay)).isFile());
});

test('without force, a directory of user files is refused rather than cleared', async () => {
  const target = await tmp();
  const inTheWay = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(inTheWay, { recursive: true });
  await fs.writeFile(path.join(inTheWay, 'theirs.md'), 'mine\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, []);
  assert.equal(await fs.readFile(path.join(inTheWay, 'theirs.md'), 'utf8'), 'mine\n');
});

test('a symlink at a RECORDED path is refused, like one at an unrecorded path', async () => {
  // The lstat fix covered untrackedCollisions only. A recorded path skipped
  // that check by design and went to the hash comparison, which follows the
  // link and so read a swapped link as merely modified — or, pointing at a
  // copy of our own file, as unchanged. copyFile then wrote through it, out of
  // the target tree. Same rule, second call site.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const outside = path.join(await tmp(), 'escaped.md');
  const recorded = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.copyFile(recorded, outside); // Hashes equal, so only the type gives it away.
  await fs.rm(recorded);
  await fs.symlink(outside, recorded);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, []);
  assert.deepEqual(res.skipped[0].files, ['SKILL.md']);
  assert.equal(await fs.readFile(outside, 'utf8'), await fs.readFile(outside, 'utf8'));
  assert.ok((await fs.lstat(recorded)).isSymbolicLink(), 'the link must be left alone');
});

test('force replaces a symlink at a recorded path instead of writing through it', async () => {
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const outside = path.join(await tmp(), 'escaped.md');
  await fs.writeFile(outside, 'not ours\n');
  const recorded = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.rm(recorded);
  await fs.symlink(outside, recorded);

  await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.ok((await fs.lstat(recorded)).isFile(), 'the link must be replaced by a file');
  assert.equal(await fs.readFile(outside, 'utf8'), 'not ours\n', 'and not written through');
});

test('a DIRECTORY at a retired path stops nothing, and keeps its contents', async () => {
  // Retirement removed with { force: true } and no recursive flag, so a path
  // that had become a directory threw ERR_FS_EISDIR and took the whole install
  // down. The copy loop had already learned this; the retirement loop had not.
  //
  // NARROWED. The first form of this test asserted that --force deleted the
  // directory, contents and all, and the content it deleted is named "user
  // content" in the fixture below. That was overspecified: the requirement was
  // that retirement not throw. --force may destroy what stands in the way of
  // something it must write, and nothing is written to a retired path, so the
  // files the manifest never recorded stay. Same rule as uninstall.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const retired = path.join(target, 'demo-craft', 'references', 'gone.md');
  await fs.mkdir(retired, { recursive: true });
  await fs.writeFile(path.join(retired, 'inside.md'), 'user content\n');
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  m.skills['demo-craft'].files['references/gone.md'] = 'f'.repeat(64);
  await writeManifest(target, m, identity);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(res.installed, ['demo-craft'], 'the install must complete');
  assert.equal(
    await fs.readFile(path.join(retired, 'inside.md'), 'utf8'), 'user content\n',
    'a file the manifest never recorded must survive the retirement');
});

test('a user file at a name the skill ships as a DIRECTORY is a collision', async () => {
  // lstat on anything below a file component throws ENOTDIR, which reads as
  // absent, so no check reported it. mkdir then threw EEXIST and took the
  // install down with a raw filesystem error. The directory components of a
  // shipped path are part of what the skill claims.
  const target = await tmp();
  const mine = path.join(target, 'demo-craft', 'references');
  await fs.mkdir(path.dirname(mine), { recursive: true });
  await fs.writeFile(mine, 'my own notes\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, []);
  assert.deepEqual(res.skipped[0].files, ['references']);
  assert.equal(await fs.readFile(mine, 'utf8'), 'my own notes\n');
});

test('force replaces a file sitting where a shipped directory must go', async () => {
  const target = await tmp();
  const mine = path.join(target, 'demo-craft', 'references');
  await fs.mkdir(path.dirname(mine), { recursive: true });
  await fs.writeFile(mine, 'my own notes\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(res.installed, ['demo-craft']);
  assert.ok((await fs.lstat(mine)).isDirectory());
  await fs.access(path.join(mine, 'guide.md'));
});

test('a file a previous release shipped gives way to a directory of the same name', async () => {
  // The inverse of the directory-to-file transition, and it failed the same
  // way: mkdir cannot write over a file. Because the path is recorded, the
  // install owns it and no --force is needed.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const dir = path.join(target, 'demo-craft', 'references');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.writeFile(dir, 'from an older release\n');
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  delete m.skills['demo-craft'].files['references/guide.md'];
  m.skills['demo-craft'].files.references = await hashFile(dir);
  await writeManifest(target, m, identity);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, ['demo-craft'], JSON.stringify(res.skipped));
  assert.ok((await fs.lstat(dir)).isDirectory(), 'the path must now be a directory');
  await fs.access(path.join(dir, 'guide.md'));
});

test('pruning stops at the tree it was given, not at a name that shares its prefix', async () => {
  // pruneEmpty climbed while the path merely started with the stop directory's
  // string, so /x/skills-other counted as inside /x/skills.
  const root = await tmp();
  const target = path.join(root, 'skills');
  const sibling = path.join(root, 'skills-other');
  await fs.mkdir(sibling, { recursive: true });
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const { pruneEmpty } = await import('../src/tree.js');
  await pruneEmpty(sibling, target);
  assert.ok(await exists(sibling), 'a sibling directory must survive');
});

test("a user file at the skill's own directory name is a collision", async () => {
  // The outermost ancestor, and the one ancestorsOf cannot name: the paths it
  // walks are relative to this directory. mkdir threw EEXIST here for the same
  // reason it did one level down.
  const target = await tmp();
  const mine = path.join(target, 'demo-craft');
  await fs.writeFile(mine, 'my own notes\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, []);
  assert.deepEqual(res.skipped[0].files, ['demo-craft']);
  assert.equal(await fs.readFile(mine, 'utf8'), 'my own notes\n');
});

test("force replaces a file at the skill's own directory name", async () => {
  const target = await tmp();
  const mine = path.join(target, 'demo-craft');
  await fs.writeFile(mine, 'my own notes\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(res.installed, ['demo-craft']);
  assert.ok((await fs.lstat(mine)).isDirectory());
});

test('a symlink above a RETIRED path is refused, and nothing is deleted through it', async () => {
  // The ancestor check walked the paths the release ships. A release that drops
  // the last file beneath a directory leaves that directory in the manifest and
  // in no source path, so nothing inspected it. The recorded child still hashed
  // correctly THROUGH the link, so the drift check passed it too, and
  // retirement then deleted a file outside the target tree.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const outsideDir = await tmp();
  const outsideFile = path.join(outsideDir, 'gone.md');
  await fs.writeFile(outsideFile, 'not ours\n');

  const link = path.join(target, 'demo-craft', 'extra');
  await fs.symlink(outsideDir, link);

  // An older release shipped extra/gone.md. This one does not.
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  m.skills['demo-craft'].files['extra/gone.md'] = await hashFile(outsideFile);
  await writeManifest(target, m, identity);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, []);
  assert.ok(res.skipped[0].files.includes('extra'), JSON.stringify(res.skipped));
  assert.ok(await exists(outsideFile), 'must not delete outside the target tree');
  assert.equal(await fs.readFile(outsideFile, 'utf8'), 'not ours\n');
});

test('force keeps an EDITED file at a retired path', async () => {
  // --force skips alteredFiles, and retirement then removed the edit although
  // nothing replaces it. The likely path is forcing an overwrite of some other,
  // still-shipping file and losing this one on the way past.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const retired = path.join(target, 'demo-craft', 'notes.md');
  await fs.writeFile(retired, 'my edit\n');
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  m.skills['demo-craft'].files['notes.md'] = 'f'.repeat(64); // recorded, and not this content
  await writeManifest(target, m, identity);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(res.installed, ['demo-craft'], JSON.stringify(res.skipped));
  assert.equal(await fs.readFile(retired, 'utf8'), 'my edit\n',
    'a retired leaf goes only if it is still the file we wrote');
});

test('force keeps a user file blocking only a retired path', async () => {
  // The blocked set ranged over shipped AND retired paths, and --force cleared
  // all of it. An ancestor reached only by a retired path stands in the way of
  // a deletion, and nothing is written through it, so clearing it destroys a
  // file for no reason. Reported with the ancestor as a user file, which is the
  // form that loses data rather than a link.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const mine = path.join(target, 'demo-craft', 'extra');
  await fs.writeFile(mine, 'my own file\n');
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  m.skills['demo-craft'].files['extra/gone.md'] = 'f'.repeat(64);
  await writeManifest(target, m, identity);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(res.installed, ['demo-craft'], JSON.stringify(res.skipped));
  assert.equal(await fs.readFile(mine, 'utf8'), 'my own file\n',
    'a file blocking only a retired path is not in the way of any write');
});

test('force does not delete through OR clear a link above a retired path', async () => {
  // NARROWED, for the reason the retired-directory test above was narrowed.
  // The requirement is that the deletion not travel through the link. The
  // first form also asserted that --force removed the link, and force has no
  // reason to: nothing is written through `extra/`, and a directory at a
  // retired path is already left alone. Same rule, same place, so the same
  // answer. The link stays, unowned, and drops out of the manifest.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });

  const outsideDir = await tmp();
  const outsideFile = path.join(outsideDir, 'gone.md');
  await fs.writeFile(outsideFile, 'not ours\n');
  const link = path.join(target, 'demo-craft', 'extra');
  await fs.symlink(outsideDir, link);
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  m.skills['demo-craft'].files['extra/gone.md'] = await hashFile(outsideFile);
  await writeManifest(target, m, identity);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(res.installed, ['demo-craft'], JSON.stringify(res.skipped));
  assert.ok(await exists(outsideFile), 'the target of the link must survive --force');
  assert.equal(await fs.readFile(outsideFile, 'utf8'), 'not ours\n');
  assert.equal((await fs.lstat(link)).isSymbolicLink(), true,
    'force clears what blocks a write, and nothing is written through this link');
  const after = await readManifest(target);
  assert.ok(!('extra/gone.md' in after.skills['demo-craft'].files),
    'the retired path leaves the manifest whether or not it left the disk');
});

test('install refuses politely under a self-referential ancestor', async () => {
  // blockedAncestors recorded `references` and the non-force path then handed
  // every leaf to alteredFiles and untrackedCollisions, so lstat on
  // references/guide.md threw ELOOP out of install. Finding the blocker exists
  // in order to refuse; throwing instead is the outcome it was meant to stop.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const refs = path.join(target, 'demo-craft', 'references');
  await fs.rm(refs, { recursive: true, force: true });
  await fs.symlink(refs, refs);

  const res = await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  assert.deepEqual(res.installed, []);
  assert.equal(res.skipped[0].reason, 'not-ours');
  assert.ok(res.skipped[0].files.includes('references'), JSON.stringify(res.skipped));
});

test('a deeper component below a blocker is never inspected', async () => {
  // The walk added `references` and then went on to lstat `references/deep`,
  // which resolves THROUGH the blocker it had just recorded. Stopping a path at
  // its first blocker is the fix, and it is in the primitive rather than in the
  // three callers that each have to remember.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const { manifest: m, identity } = await readManifestWithIdentity(target);
  m.skills['demo-craft'].files['references/deep/file.md'] = 'f'.repeat(64);
  await writeManifest(target, m, identity);
  const refs = path.join(target, 'demo-craft', 'references');
  await fs.rm(refs, { recursive: true, force: true });
  await fs.symlink(refs, refs);

  const res = await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  assert.deepEqual(res.installed, []);
  assert.equal(res.skipped[0].reason, 'not-ours');
});

test('a name in both tiers stops the install rather than picking one', async () => {
  // Install keyed a map on the name alone, so the later tier won and a caller
  // that asked for the standards skill got the craft one. A caller that named
  // the tier has already said which skill it wants, and no map built this way
  // can honour that. The refusal belongs to the catalog, which is the one
  // surface every consumer reads.
  const repo = await tmp();
  for (const tier of ['standards', 'craft']) {
    const dir = path.join(repo, 'skills', tier, 'twinned');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: twinned\ndescription: The ${tier} one.\n---\n\n# twinned\n`);
  }
  const target = await tmp();

  await assert.rejects(
    () => installSkills({ repoRoot: repo, targetDir: target, names: ['twinned'], now: NOW }),
    /twinned/);
  // Nothing landed, and no manifest records one of the two as the skill asked
  // for.
  assert.deepEqual(await fs.readdir(target), []);
});

// --- The record goes on disk before the files do -------------------------

test('the record names every path before the first byte is copied', async () => {
  // The ordering IS the fix. Copying first and recording afterwards leaves a
  // window in which files exist that no record names, and `uninstall` reaches
  // only what the manifest records.
  const target = await tmp();
  const original = fs.copyFile;
  let atFirstCopy = null;
  fs.copyFile = async (...args) => {
    atFirstCopy ??= await readManifest(target);
    return original.apply(fs, args);
  };
  try {
    await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  } finally {
    fs.copyFile = original;
  }

  assert.deepEqual(
    Object.keys(atFirstCopy.pending['demo-craft']).sort(),
    ['LICENSE', 'SKILL.md', 'references/guide.md']);
  // And what it will write there, which is what proves the file is this run's
  // when the next command finds it.
  for (const [rel, hash] of Object.entries(atFirstCopy.pending['demo-craft'])) {
    assert.equal(
      hash,
      await hashFile(path.join(REPO, 'skills', 'craft', 'demo-craft', rel)),
      `${rel} is stated with the content the release ships`);
  }
  assert.deepEqual(atFirstCopy.skills, {}, 'and nothing is recorded as installed yet');
});

test('a finished install leaves no statement behind', async () => {
  // The manifest a successful run writes is the one earlier releases wrote. A
  // leftover key would sit in every manifest and in the conformance suite's
  // comparison, and it would give the next run a map with no territory.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const raw = await fs.readFile(path.join(target, MANIFEST_NAME), 'utf8');
  assert.doesNotMatch(raw, /pending/);
  assert.equal((await readManifest(target)).pending, undefined);
});

/**
 * Install `demo-craft` into `target` in a child process, and kill it dead at
 * the first call to `hook`. A real kill: no catch runs, no finally runs, and
 * the undo this module performs in its own process is skipped entirely. That
 * is the failure the deferred review finding named, and the only thing that
 * answers it is a record written before the copy.
 *
 * The parent does the killing, and the child only says when. A process cannot
 * SIGKILL itself on Windows, where the signal has no meaning to raise: the call
 * returns, the run carries on, and it finishes cleanly — the one outcome this
 * test exists to rule out. Killing from outside is also the truer model of the
 * thing being tested, which is a run that some other agent ends.
 */
async function killedInstall(target, hook) {
  const script = `
    import fsp from 'node:fs/promises';
    import { installSkills } from ${JSON.stringify(new URL('../src/install.js', import.meta.url).href)};
    const real = fsp.${hook};
    fsp.${hook} = async (...args) => {
      const result = await real.apply(fsp, args);
      // Not the manifest's own write, which uses the same two calls. This is
      // about a skill file reaching, or not reaching, its destination.
      if (!String(args[args.length - 1]).includes('.stylewright-manifest')) {
        // Say when, then never return. The install is suspended exactly here
        // until the parent ends the process, so nothing downstream of this call
        // ever runs.
        process.send('now');
        await new Promise(() => {});
      }
      return result;
    };
    await installSkills({
      repoRoot: ${JSON.stringify(REPO)},
      targetDir: ${JSON.stringify(target)},
      names: ['demo-craft'],
      now: ${JSON.stringify(NOW)},
    });
  `;
  const died = await new Promise((resolve) => {
    // A channel on the fourth descriptor, because the child has to say when and
    // the first three carry nothing this test reads.
    const child = spawn(
      process.execPath, ['--input-type=module', '-e', script],
      { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    child.on('message', () => child.kill('SIGKILL'));
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  assert.equal(died.signal, 'SIGKILL', 'the run must die rather than return');
  // A run killed mid-command leaves the directory locked, and the next command
  // refuses rather than guessing whether that run is still alive. Removing the
  // file is the one thing only a person can be sure about.
  const lock = path.join(target, '.stylewright-lock');
  assert.ok(await exists(lock), 'the killed run left the directory locked');
  await assert.rejects(
    installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW }),
    /Another stylewright command is working/);
  await fs.rm(lock);
  const left = await readManifest(target);
  assert.deepEqual(left.skills, {}, 'the killed run recorded no skill');
  assert.deepEqual(
    Object.keys(left.pending['demo-craft']).sort(),
    ['LICENSE', 'SKILL.md', 'references/guide.md']);
}

test('a run killed with a copy in flight leaves nothing the next command cannot reach', async () => {
  // Killed between staging a copy and renaming it into place. The destination
  // never held anything, and what the run did leave is the staging file.
  const target = await tmp();
  await killedInstall(target, 'copyFile');
  const staged = `${path.join(target, 'demo-craft', 'LICENSE')}.stylewright-part`;
  assert.ok(await exists(staged), 'the copy stopped before the rename');
  assert.ok(!(await exists(path.join(target, 'demo-craft', 'LICENSE'))));

  // A later command with nothing to do with the interrupted skill clears it.
  // Nothing about the recovery depends on installing that skill again.
  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW,
  });
  assert.deepEqual(res.installed, ['demo-standard']);
  assert.ok(!(await exists(path.join(target, 'demo-craft'))));
  assert.deepEqual(Object.keys((await readManifest(target)).skills), ['demo-standard']);
});

test('a run killed with a file in place leaves nothing the next command cannot reach', async () => {
  // Killed after a rename, so a whole file this run wrote is at a destination
  // that no record names. It matches what the statement said would be written
  // there, which is what proves it belongs to the killed run.
  const target = await tmp();
  await killedInstall(target, 'rename');
  assert.ok(await exists(path.join(target, 'demo-craft', 'LICENSE')), 'and it left a file');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW,
  });
  assert.deepEqual(res.recovered, ['demo-craft/LICENSE']);
  assert.ok(!(await exists(path.join(target, 'demo-craft'))));
  assert.deepEqual(Object.keys((await readManifest(target)).skills), ['demo-standard']);
});

test('an interrupted update keeps an edit and clears its own copy', async () => {
  // The two files an interrupted update can leave at a recorded path, and the
  // proof that tells them apart. One holds what the run was going to write, so
  // it is that run's and it goes. The other holds what the user wrote, so it
  // stays and meets the ordinary refusal.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const source = path.join(REPO, 'skills', 'craft', 'demo-craft');
  const mine = path.join(target, 'demo-craft', 'SKILL.md');
  const ours = path.join(target, 'demo-craft', 'LICENSE');
  const { manifest, identity } = await readManifestWithIdentity(target);

  // The run had copied LICENSE from a release that ships different bytes, and
  // had not reached SKILL.md, where the user has since written their own.
  await fs.writeFile(mine, 'my own words\n');
  await fs.writeFile(ours, 'from the release that did not finish\n');
  await writeManifest(target, {
    ...manifest,
    pending: {
      'demo-craft': {
        LICENSE: await hashFile(ours),
        'SKILL.md': await hashFile(path.join(source, 'SKILL.md')),
      },
    },
  }, identity);

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });

  assert.deepEqual(res.recovered, ['demo-craft/LICENSE']);
  assert.deepEqual(res.installed, []);
  assert.equal(res.skipped[0].reason, 'locally-modified');
  assert.deepEqual(res.skipped[0].files, ['SKILL.md']);
  assert.equal(await fs.readFile(mine, 'utf8'), 'my own words\n');
  assert.equal((await readManifest(target)).pending, undefined, 'and the statement is withdrawn');

  const forced = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(forced.installed, ['demo-craft']);
  const mf = await readManifest(target);
  assert.equal(await hashFile(mine), mf.skills['demo-craft'].files['SKILL.md']);
  assert.equal(await hashFile(ours), mf.skills['demo-craft'].files.LICENSE);
});

test('a source that changes under the run stops it before anything lands', async () => {
  // The statement is made from the source before the copy, and it is what lets
  // a later command prove a file is this run's. Bytes that no statement names
  // would be an orphan no rule could identify, so the run stops while the only
  // thing on disk is a staging file that recovery removes by name.
  const repo = await tmp();
  await fs.cp(REPO, repo, { recursive: true });
  const source = path.join(repo, 'skills', 'craft', 'demo-craft', 'SKILL.md');
  const target = await tmp();

  const original = fs.copyFile;
  let swapped = false;
  fs.copyFile = async (...args) => {
    // Between the hash that made the statement and the copy that reads it.
    if (!swapped && String(args[0]) === source) {
      swapped = true;
      await fs.writeFile(source, '---\nname: demo-craft\n---\n\nA later edit.\n');
    }
    return original.apply(fs, args);
  };
  try {
    await assert.rejects(
      installSkills({ repoRoot: repo, targetDir: target, names: ['demo-craft'], now: NOW }),
      /changed in .* while this command was running/);
  } finally {
    fs.copyFile = original;
  }

  assert.ok(!(await exists(path.join(target, 'demo-craft', 'SKILL.md'))), 'nothing landed');
  const res = await installSkills({
    repoRoot: repo, targetDir: target, names: ['demo-standard'], now: NOW,
  });
  assert.deepEqual(res.installed, ['demo-standard']);
  assert.ok(!(await exists(path.join(target, 'demo-craft'))), 'and the staging file went');
});

test('undo clears the destinations this run wrote, not every one it stated', async () => {
  // The statement names every path the run intended to write. Only the run
  // itself knows which of them it reached, and it was throwing that away: a
  // file edited after the collision checks, at a path the copy loop had not got
  // to, holds the user's work — and an edit that happens to produce exactly the
  // bytes this release ships satisfies the content proof that recovery must
  // rely on. Recovery has no choice, because it reads a statement its own run
  // did not live to explain. A live undo does.
  const repo = await tmp();
  await fs.cp(REPO, repo, { recursive: true });
  const target = await tmp();
  await installSkills({ repoRoot: repo, targetDir: target, names: ['demo-craft'], now: NOW });

  // The next release rewrites the guide and nothing else.
  const guideSource = path.join(repo, 'skills', 'craft', 'demo-craft', 'references', 'guide.md');
  const shipped = 'A guide, rewritten for the next release.\n';
  await fs.writeFile(guideSource, shipped);
  const guide = path.join(target, 'demo-craft', 'references', 'guide.md');
  const skillSource = path.join(repo, 'skills', 'craft', 'demo-craft', 'SKILL.md');

  const original = fs.copyFile;
  let swapped = false;
  fs.copyFile = async (...args) => {
    if (!swapped && String(args[0]) === skillSource) {
      swapped = true;
      // The user's edit, after the checks that would have refused it and
      // before the copy loop reaches that path.
      await fs.writeFile(guide, shipped);
      await fs.writeFile(skillSource, '---\nname: demo-craft\n---\n\nA later edit.\n');
    }
    return original.apply(fs, args);
  };
  try {
    await assert.rejects(
      installSkills({ repoRoot: repo, targetDir: target, names: ['demo-craft'], now: NOW }),
      /changed in .* while this command was running/);
  } finally {
    fs.copyFile = original;
  }

  assert.equal(await fs.readFile(guide, 'utf8'), shipped,
    'a path this run never reached is not this run\'s to delete');
  assert.ok(
    Object.hasOwn((await readManifest(target)).skills['demo-craft'].files, 'references/guide.md'),
    'and the record still names a file that is still there');
});

test('a name at the filesystem limit is staged under one that fits', async () => {
  // The staging name is the destination plus a suffix, and a skill may ship a
  // basename that is legal and nearly as long as a component may be. Appending
  // to that produced a name the filesystem refused: the install failed with
  // ENAMETOOLONG after committing its statement, and every later command failed
  // on the same path while recovering, so the target could only be repaired by
  // editing the manifest by hand.
  const repo = await tmp();
  const dir = path.join(repo, 'skills', 'craft', 'wide');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    '---\nname: wide\ndescription: Ships a name at the limit.\n---\n\n# wide\n');
  const long = `${'w'.repeat(246)}.md`; // 249 bytes, and 264 with the suffix.
  await fs.writeFile(path.join(dir, long), 'as wide as the filesystem allows\n');
  const target = await tmp();

  const res = await installSkills({
    repoRoot: repo, targetDir: target, names: ['wide'], now: NOW,
  });

  assert.deepEqual(res.installed, ['wide']);
  assert.equal(await fs.readFile(path.join(target, 'wide', long), 'utf8'),
    'as wide as the filesystem allows\n');
  assert.deepEqual(Object.keys((await readManifest(target)).skills), ['wide']);
  assert.equal((await readManifest(target)).pending, undefined,
    'and no statement outlives a run that finished');
  for (const entry of await fs.readdir(path.join(target, 'wide'))) {
    assert.ok(Buffer.byteLength(entry) <= 255, `${entry.length} bytes is a name a target may refuse`);
    assert.ok(!entry.endsWith('.stylewright-part'), 'and no staging file survives');
  }
});

test('a staging name is bounded, and stays derivable from the destination', async () => {
  // Recovery reaches the staging path from the stated path and nothing else, so
  // the derivation has to be a function of the destination alone. Clipping
  // without the digest would map every name sharing a long head onto one
  // staging path.
  const head = 'x'.repeat(300);
  assert.equal(stagingName('SKILL.md'), 'SKILL.md.stylewright-part', 'short names are untouched');
  assert.equal(stagingName(`${head}a`), stagingName(`${head}a`), 'and the answer is stable');
  assert.notEqual(stagingName(`${head}a`), stagingName(`${head}b`));
  for (const base of ['SKILL.md', `${head}a`, 'e'.repeat(255), 'é'.repeat(200)]) {
    assert.ok(Buffer.byteLength(stagingName(base)) <= 255);
    assert.ok(stagingName(base).endsWith('.stylewright-part'));
  }
});

test('a skill that ships a name this tool stages under is refused', async () => {
  // The staging name is the destination plus a suffix, so a skill shipping both
  // `A` and `A.stylewright-part` would have the copy of `A` clear the second as
  // if it were this engine's leavings. The shape is refused where it enters.
  const repo = await tmp();
  const dir = path.join(repo, 'skills', 'craft', 'odd');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), '---\nname: odd\ndescription: d\n---\n\n# odd\n');
  await fs.writeFile(path.join(dir, 'A.stylewright-part'), 'shipped\n');
  const target = await tmp();

  await assert.rejects(
    installSkills({ repoRoot: repo, targetDir: target, names: ['odd'], now: NOW }),
    /A\.stylewright-part.*Rename the file/s);
  assert.ok(!(await exists(path.join(target, 'odd'))), 'and nothing landed');

  // And on a DIRECTORY segment, which is the same collision one level up: the
  // copy of a sibling `A` would clear that directory as its scratch space.
  const nested = await tmp();
  const dir2 = path.join(nested, 'skills', 'craft', 'odd', 'A.stylewright-part');
  await fs.mkdir(dir2, { recursive: true });
  await fs.writeFile(
    path.join(nested, 'skills', 'craft', 'odd', 'SKILL.md'),
    '---\nname: odd\ndescription: d\n---\n\n# odd\n');
  await fs.writeFile(path.join(dir2, 'B'), 'shipped\n');

  await assert.rejects(
    installSkills({ repoRoot: nested, targetDir: await tmp(), names: ['odd'], now: NOW }),
    /A\.stylewright-part\/B.*Rename the file/s);
});

test('a file at the staging name is a collision, not something to clear', async () => {
  // The copy clears whatever stands at the staging path, so a file the user
  // happened to put at that name was deleted by a write no check had inspected.
  // It is a destination like any other, and the preflight sees it.
  const target = await tmp();
  const mine = path.join(target, 'demo-craft', 'SKILL.md.stylewright-part');
  await fs.mkdir(path.dirname(mine), { recursive: true });
  await fs.writeFile(mine, 'my own notes\n');

  const res = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(res.installed, []);
  assert.equal(res.skipped[0].reason, 'not-ours');
  assert.ok(res.skipped[0].files.includes('SKILL.md.stylewright-part'));
  assert.equal(await fs.readFile(mine, 'utf8'), 'my own notes\n');

  // And --force disposes of it, as it does of any other collision.
  const forced = await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.deepEqual(forced.installed, ['demo-craft']);
  assert.ok(!(await exists(mine)));
});

test('a retired file a refused run deleted is unrecorded, not left claimed', async () => {
  // Retirement happens before the copies, so a commit that never lands leaves
  // the surviving record naming a path this run has already removed. The record
  // catches up, exactly as uninstall's does after it deletes.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const retired = path.join(target, 'demo-craft', 'references', 'gone.md');
  await fs.writeFile(retired, 'from an older release\n');
  const { manifest, identity } = await readManifestWithIdentity(target);
  manifest.skills['demo-craft'].files['references/gone.md'] = await hashFile(retired);
  await writeManifest(target, manifest, identity);

  const original = fs.rename;
  let raced = false;
  fs.rename = async (...args) => {
    const result = await original.apply(fs, args);
    if (!raced && String(args[1]).endsWith('guide.md')) {
      raced = true;
      const fresh = await readManifestWithIdentity(target);
      await writeManifest(target, fresh.manifest, fresh.identity);
    }
    return result;
  };
  try {
    await assert.rejects(
      installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW }),
      /changed while this command was running/);
  } finally {
    fs.rename = original;
  }

  assert.ok(!(await exists(retired)), 'the retirement stands');
  const after = await readManifest(target);
  assert.ok(
    !Object.hasOwn(after.skills['demo-craft'].files, 'references/gone.md'),
    'and no record claims it');
});

test('a run whose only work was the cleanup leaves the directory as it found it', async () => {
  // The manifest recording nothing is a file this engine wrote and nothing
  // needs. Writing the empty record back kept the interrupted run's last trace,
  // and every later scan read the directory as one this tool owns.
  const parent = await tmp();
  const target = path.join(parent, 'skills');
  const orphan = path.join(target, 'demo-craft', 'SKILL.md');
  await fs.mkdir(path.dirname(orphan), { recursive: true });
  await fs.writeFile(orphan, 'half a copy\n');
  await writeManifest(target, {
    ...(await readManifestWithIdentity(target)).manifest,
    pending: { 'demo-craft': { 'SKILL.md': await hashFile(orphan) } },
  }, null);

  const res = await installSkills({ repoRoot: REPO, targetDir: target, names: [], now: NOW });

  assert.deepEqual(res.recovered, ['demo-craft/SKILL.md']);
  assert.deepEqual(res.cleared, ['demo-craft']);
  assert.ok(!(await exists(target)), 'nothing of this tool is left');
});

test('a clean failure withdraws the statement it committed', async () => {
  // The undo compares the statement before withdrawing it, and it was given the
  // statement merged with what the run had actually written. Those differ when
  // the source changes under the run, so the comparison failed against this
  // run's own statement and left it standing — and the next command then read a
  // clean failure as an interrupted install.
  const repo = await tmp();
  await fs.cp(REPO, repo, { recursive: true });
  const source = path.join(repo, 'skills', 'craft', 'demo-craft', 'SKILL.md');
  const target = await tmp();

  const original = fs.copyFile;
  let swapped = false;
  fs.copyFile = async (...args) => {
    if (!swapped && String(args[0]) === source) {
      swapped = true;
      await fs.writeFile(source, '---\nname: demo-craft\n---\n\nA later edit.\n');
    }
    return original.apply(fs, args);
  };
  try {
    await assert.rejects(
      installSkills({ repoRoot: repo, targetDir: target, names: ['demo-craft'], now: NOW }),
      /changed in .* while this command was running/);
  } finally {
    fs.copyFile = original;
  }

  assert.equal((await readManifest(target)).pending, undefined);
});

test('a failed update leaves a record that over-claims, and the next run repairs it', async () => {
  // What a run that fails part way through an update leaves, stated so that a
  // change to it is a change to a test. The files it had already replaced are
  // removed — they are provably this run's bytes, and leaving them would read
  // as an edit the user made — so the record names files that are absent. That
  // is the direction this engine repairs rather than the one it cannot: install
  // restores an absent recorded file, and uninstall tolerates one. Issue #55
  // holds what it would take to leave the old bytes in place instead.
  const repo = await tmp();
  await fs.cp(REPO, repo, { recursive: true });
  const target = await tmp();
  await installSkills({ repoRoot: repo, targetDir: target, names: ['demo-craft'], now: NOW });

  // A release that ships different bytes for LICENSE, and a source that changes
  // under the run when it reaches SKILL.md.
  const source = path.join(repo, 'skills', 'craft', 'demo-craft');
  await fs.writeFile(path.join(source, 'LICENSE'), 'a later licence\n');
  const original = fs.copyFile;
  let swapped = false;
  fs.copyFile = async (...args) => {
    if (!swapped && String(args[0]).endsWith('SKILL.md')) {
      swapped = true;
      await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: demo-craft\n---\n\nLater.\n');
    }
    return original.apply(fs, args);
  };
  try {
    await assert.rejects(
      installSkills({ repoRoot: repo, targetDir: target, names: ['demo-craft'], now: NOW }),
      /changed in .* while this command was running/);
  } finally {
    fs.copyFile = original;
  }

  const after = await readManifest(target);
  const licence = path.join(target, 'demo-craft', 'LICENSE');
  assert.ok(!(await exists(licence)), 'the bytes this run wrote are gone');
  assert.ok(after.skills['demo-craft'].files.LICENSE, 'and the record still names the path');
  assert.equal(after.pending, undefined);

  const again = await installSkills({
    repoRoot: repo, targetDir: target, names: ['demo-craft'], now: NOW,
  });
  assert.deepEqual(again.installed, ['demo-craft'], JSON.stringify(again.skipped));
  assert.equal(
    await hashFile(licence),
    (await readManifest(target)).skills['demo-craft'].files.LICENSE);
});

// --- Two runs in one directory -------------------------------------------

test('a second run in the same directory is refused, and changes nothing', async () => {
  // Three review rounds found three ways for two runs to spoil each other's
  // reading of the tree, and each patch produced the next one. One writer at a
  // time is what closes the class: the second run is refused before it has read
  // anything, so there is nothing to be wrong about.
  const target = await tmp();
  const original = fs.copyFile;
  let second = null;
  fs.copyFile = async (...args) => {
    if (second === null) {
      second = installSkills({
        repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW,
      }).then(() => null, (err) => err);
      await second;
    }
    return original.apply(fs, args);
  };
  try {
    const res = await installSkills({
      repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW,
    });
    assert.deepEqual(res.installed, ['demo-craft'], 'the first run finishes');
  } finally {
    fs.copyFile = original;
  }

  assert.match((await second).message, /Another stylewright command is working/);
  const mf = await readManifest(target);
  assert.deepEqual(Object.keys(mf.skills), ['demo-craft']);
  assert.ok(!(await exists(path.join(target, 'demo-standard'))), 'the refused run wrote nothing');
  assert.equal(mf.pending, undefined);
});

test('an install whose commit is refused leaves no unrecorded file', async () => {
  // The lock keeps another COMMAND out. It cannot keep a hand, or a future
  // caller, from replacing the manifest under this run — and a commit that
  // fails after the copies is the case the statement alone cannot answer,
  // because the statement may no longer be this run's. The process is alive and
  // still knows what it wrote, so it removes it.
  const target = await tmp();
  const original = fs.rename;
  let raced = false;
  fs.rename = async (...args) => {
    const result = await original.apply(fs, args);
    if (!raced && String(args[1]).endsWith('guide.md')) {
      raced = true;
      const { manifest, identity } = await readManifestWithIdentity(target);
      await writeManifest(target, { ...manifest, pending: undefined }, identity);
    }
    return result;
  };
  try {
    await assert.rejects(
      installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW }),
      /changed while this command was running/);
  } finally {
    fs.rename = original;
  }

  const mf = await readManifest(target);
  assert.deepEqual(mf.skills, {});
  assert.equal(mf.pending, undefined, 'and it withdraws its own statement');
  assert.ok(!(await exists(path.join(target, 'demo-craft'))), 'nothing of the refused run is left');
});

test('a refused run withdraws its own statement, and never another\'s', async () => {
  // The undo clears the statement by name, and a statement it did not write
  // names another run's files. Clearing that one would leave them with nothing
  // to reach them if that run were then killed — this defect, from the far side.
  const target = await tmp();
  const theirs = { 'SKILL.md': 'f'.repeat(64) };

  const original = fs.rename;
  let raced = false;
  fs.rename = async (...args) => {
    const result = await original.apply(fs, args);
    if (!raced && String(args[1]).endsWith('guide.md')) {
      raced = true;
      const fresh = await readManifestWithIdentity(target);
      await writeManifest(
        target, { ...fresh.manifest, pending: { 'demo-craft': theirs } }, fresh.identity);
    }
    return result;
  };
  try {
    await assert.rejects(
      installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW }),
      /changed while this command was running/);
  } finally {
    fs.rename = original;
  }

  assert.deepEqual((await readManifest(target)).pending, { 'demo-craft': theirs });
});

test('a refused run does not take a copy the record now names', async () => {
  // The undo removes what this run wrote, and a file the manifest records with
  // exactly those bytes is not that: it is an install that stands. Removing it
  // would leave a record naming nothing, which is this defect from the other
  // side.
  const target = await tmp();
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW });
  const { manifest } = await readManifestWithIdentity(target);

  const original = fs.rename;
  let raced = false;
  fs.rename = async (...args) => {
    const result = await original.apply(fs, args);
    if (!raced && String(args[1]).endsWith('guide.md')) {
      raced = true;
      // The record stays, and the manifest identity moves under this run.
      const fresh = await readManifestWithIdentity(target);
      await writeManifest(target, fresh.manifest, fresh.identity);
    }
    return result;
  };
  try {
    await assert.rejects(
      installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW }),
      /changed while this command was running/);
  } finally {
    fs.rename = original;
  }

  for (const [rel, hash] of Object.entries(manifest.skills['demo-craft'].files)) {
    const abs = path.join(target, 'demo-craft', rel);
    assert.ok(await exists(abs), `${rel} must survive the undo`);
    assert.equal(await hashFile(abs), hash);
  }
});

test('refuses at the source a skill shipping a file no manifest can record', {
  // The fixture's hazard is a POSIX-only creation. On NTFS, writing
  // notes:draft.md does not create a file of that name — it silently writes
  // an alternate data stream named draft.md onto a file named notes, so walk
  // sees notes and install has nothing to refuse. The conformance sweep over
  // the real catalog covers every platform.
  skip: process.platform === 'win32',
}, async () => {
  // A colon is a legal POSIX filename character, and the read side refuses it.
  // Without the write-side partner, install succeeds and every later command
  // throws on the manifest install itself wrote.
  const repo = await tmp();
  const dir = path.join(repo, 'skills', 'craft', 'demo-craft');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    '---\nname: demo-craft\ndescription: Ships a colon.\n---\n\n# demo-craft\n');
  await fs.writeFile(path.join(dir, 'notes:draft.md'), 'draft\n');
  const target = await tmp();
  await assert.rejects(
    () => installSkills({ repoRoot: repo, targetDir: target, names: ['demo-craft'], now: NOW }),
    /Skill "demo-craft" ships a file whose name cannot be recorded portably: notes:draft\.md/);
  assert.ok(!(await exists(path.join(target, MANIFEST_NAME))));
});

test('a bad name in a later skill leaves no earlier skill half-installed', {
  // Same POSIX-only fixture as the refusal test above: NTFS turns the colon
  // into an alternate data stream, and there is nothing to refuse.
  skip: process.platform === 'win32',
}, async () => {
  // The refusal must run before the first copy, over every selected skill.
  // Thrown mid-loop, it would leave the earlier skills' files on disk with
  // the manifest never written — unrecorded, so the next install refuses
  // them as user-owned collisions.
  const repo = await tmp();
  for (const [name, extra] of [['good-craft', null], ['bad-craft', 'notes:draft.md']]) {
    const dir = path.join(repo, 'skills', 'craft', name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: One of two.\n---\n\n# ${name}\n`);
    if (extra) await fs.writeFile(path.join(dir, extra), 'draft\n');
  }
  const target = await tmp();
  await assert.rejects(
    () => installSkills({
      repoRoot: repo, targetDir: target, names: ['good-craft', 'bad-craft'], now: NOW,
    }),
    /Skill "bad-craft" ships a file/);
  assert.ok(!(await exists(path.join(target, 'good-craft'))));
  assert.ok(!(await exists(path.join(target, MANIFEST_NAME))));
});

test('a file at the manifest staging name is refused, never deleted', async () => {
  // Holding the lock proves no command is active now — not that an existing
  // file at this name is a killed run's. Deleting on that guess took a
  // user-created file silently.
  const target = await tmp();
  const tmpFile = path.join(target, `${MANIFEST_NAME}.tmp`);
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(tmpFile, 'mine, not yours\n');
  await assert.rejects(
    () => installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW }),
    /is in the way/);
  assert.equal(await fs.readFile(tmpFile, 'utf8'), 'mine, not yours\n');
});

test('a shipped name that aliases the staging suffix in any case is refused', async () => {
  // A manifest travels, and Windows and macOS fold case: `A.STYLEWRIGHT-PART`
  // aliases the staging name of a sibling `A` there, so recovery would clear
  // a recorded installed file as its scratch space. Refused on every
  // platform, like every other spelling one resolver treats specially.
  const repo = await tmp();
  const dir = path.join(repo, 'skills', 'craft', 'demo-craft');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    '---\nname: demo-craft\ndescription: Ships an alias.\n---\n\n# demo-craft\n');
  await fs.writeFile(path.join(dir, 'A.STYLEWRIGHT-PART'), 'not scratch\n');
  const target = await tmp();
  await assert.rejects(
    () => installSkills({ repoRoot: repo, targetDir: target, names: ['demo-craft'], now: NOW }),
    /STYLEWRIGHT-PART/);
  assert.ok(!(await exists(path.join(target, MANIFEST_NAME))));
});
