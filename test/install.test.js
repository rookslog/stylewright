import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { readManifest, writeManifest, hashFile } from '../src/manifest.js';
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
  const stale = await readManifest(target);
  stale.stylewrightVersion = '0.0.1-old';
  await writeManifest(target, stale);

  await installSkills({
    repoRoot: REPO, targetDir: target, names: ['demo-craft'], now: NOW, force: true,
  });
  assert.equal((await readManifest(target)).stylewrightVersion, VERSION);
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
