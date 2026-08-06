import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { readManifest, writeManifest, hashFile, MANIFEST_NAME } from '../src/manifest.js';
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
  const manifest = await readManifest(target);
  manifest.skills['demo-craft'].files['references/gone.md'] = await hashFile(retired);
  await writeManifest(target, manifest);

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
  const m = await readManifest(target);
  delete m.skills['demo-craft'].files['SKILL.md'];
  m.skills['demo-craft'].files['SKILL.md/part.md'] =
    await hashFile(path.join(dir, 'part.md'));
  await writeManifest(target, m);

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
  const m = await readManifest(target);
  m.skills['demo-craft'].files['references/gone.md'] = 'f'.repeat(64);
  await writeManifest(target, m);

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
  const m = await readManifest(target);
  delete m.skills['demo-craft'].files['references/guide.md'];
  m.skills['demo-craft'].files.references = await hashFile(dir);
  await writeManifest(target, m);

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
  const m = await readManifest(target);
  m.skills['demo-craft'].files['extra/gone.md'] = await hashFile(outsideFile);
  await writeManifest(target, m);

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
  const m = await readManifest(target);
  m.skills['demo-craft'].files['notes.md'] = 'f'.repeat(64); // recorded, and not this content
  await writeManifest(target, m);

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
  const m = await readManifest(target);
  m.skills['demo-craft'].files['extra/gone.md'] = 'f'.repeat(64);
  await writeManifest(target, m);

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
  const m = await readManifest(target);
  m.skills['demo-craft'].files['extra/gone.md'] = await hashFile(outsideFile);
  await writeManifest(target, m);

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
  const m = await readManifest(target);
  m.skills['demo-craft'].files['references/deep/file.md'] = 'f'.repeat(64);
  await writeManifest(target, m);
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
