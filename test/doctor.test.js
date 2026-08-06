import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../src/install.js';
import { doctor } from '../src/doctor.js';
import { readManifestWithIdentity, writeManifest } from '../src/manifest.js';
import { installedSkills } from '../src/detect.js';

const REPO = path.join(import.meta.dirname, 'fixtures', 'repo');
const NOW = '2026-01-01T00:00:00.000Z';
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-doc-'));

test('reports nothing on a clean machine', async () => {
  const home = await tmp();
  const cwd = await tmp();
  assert.deepEqual(await doctor({ repoRoot: REPO, home, cwd }), []);
});

test('installing for two agents is not a duplicate', async () => {
  // This is the README's own example: `--platform claude,codex`. Each agent
  // reads its own directory and sees one copy. An earlier version of this test
  // asserted a finding here, which made `doctor` fail on the documented
  // command. See issue #14.
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
  assert.deepEqual(await doctor({ repoRoot: REPO, home, cwd }), []);
});

test('detects two copies that one agent would load at once', async () => {
  // Claude reads user scope and project scope together, so two copies of the
  // same skill name really do collide. This is the case the check exists for.
  const home = await tmp();
  const cwd = await tmp();
  await installSkills({
    repoRoot: REPO, targetDir: path.join(home, '.claude/skills'),
    names: ['demo-standard'], now: NOW,
  });
  await installSkills({
    repoRoot: REPO, targetDir: path.join(cwd, '.claude/skills'),
    names: ['demo-standard'], now: NOW,
  });
  const found = await doctor({ repoRoot: REPO, home, cwd });
  const dup = found.find((f) => f.code === 'duplicate-install');
  assert.ok(dup, 'expected a duplicate-install finding');
  assert.match(dup.message, /demo-standard/);
  assert.match(dup.message, /claude/);
});

test('one agent with two copies does not implicate a second agent', async () => {
  // codex has one copy. The finding must name claude only, or the user goes
  // looking in the wrong directory.
  const home = await tmp();
  const cwd = await tmp();
  for (const dir of [path.join(home, '.claude/skills'), path.join(cwd, '.claude/skills'),
    path.join(home, '.codex/skills')]) {
    await installSkills({ repoRoot: REPO, targetDir: dir, names: ['demo-standard'], now: NOW });
  }
  const found = await doctor({ repoRoot: REPO, home, cwd });
  assert.equal(found.length, 1);
  assert.doesNotMatch(found[0].message, /codex/);
});

test('a single claude install is not a duplicate, despite the cowork alias', async () => {
  // cowork/user resolves to the same path as claude/user. Counting labels
  // instead of paths would report a duplicate for every ordinary install.
  const home = await tmp();
  const cwd = await tmp();
  await installSkills({
    repoRoot: REPO,
    targetDir: path.join(home, '.claude/skills'),
    names: ['demo-standard'],
    now: NOW,
  });
  assert.deepEqual(await doctor({ repoRoot: REPO, home, cwd }), []);
});

test('reports an install that did not finish, once per directory', async () => {
  // The files an interrupted install left are reachable and the next install or
  // uninstall clears them. Until one runs, nothing said they were there — and
  // `doctor` is the command whose whole job is to say what is on disk.
  const home = await tmp();
  const target = path.join(home, '.claude/skills');
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const { manifest, identity } = await readManifestWithIdentity(target);
  await writeManifest(target, {
    ...manifest, pending: { 'demo-craft': { write: { 'SKILL.md': 'a'.repeat(64) } } },
  }, identity);

  const findings = await doctor({ repoRoot: REPO, home, cwd: await tmp() });

  assert.equal(findings.length, 1, JSON.stringify(findings));
  assert.equal(findings[0].code, 'interrupted-install');
  assert.equal(findings[0].level, 'warn');
  assert.match(findings[0].message, /demo-craft/);
});

test('a committed statement is unswept, which is the opposite of unfinished', async () => {
  // The record has landed and the skill is whole. What is outstanding is the
  // sweep of the version it replaced, so calling it an install that did not
  // finish told the user their skill was half installed when it is not.
  const home = await tmp();
  const target = path.join(home, '.claude/skills');
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  const { manifest, identity } = await readManifestWithIdentity(target);
  await writeManifest(target, {
    ...manifest,
    pending: {
      'demo-standard': {
        write: { 'SKILL.md': 'a'.repeat(64) },
        keep: { 'SKILL.md': 'b'.repeat(64) },
        committed: true,
      },
    },
  }, identity);

  const findings = await doctor({ repoRoot: REPO, home, cwd: await tmp() });

  assert.equal(findings.length, 1, JSON.stringify(findings));
  assert.equal(findings[0].code, 'unswept-install');
  assert.match(findings[0].message, /is recorded, and the version it replaced/);
  assert.doesNotMatch(findings[0].message, /did not finish/);
});

test('reports a directory a killed run left locked', async () => {
  // The next command refuses until the file goes, and the one judgement this
  // tool cannot make is whether the run that left it is still alive. So it says
  // what it sees and leaves the decision where it belongs.
  const home = await tmp();
  const target = path.join(home, '.claude/skills');
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  await fs.writeFile(path.join(target, '.stylewright-lock'), '');
  // Killed mid-write, so the manifest is not parseable either. Reading it first
  // reported that, where the answer the user needs is the name of the file to
  // remove.
  await fs.writeFile(path.join(target, '.stylewright-manifest.json'), '');

  const findings = await doctor({ repoRoot: REPO, home, cwd: await tmp() });

  assert.equal(findings.length, 1, JSON.stringify(findings));
  assert.equal(findings[0].code, 'locked-directory');
  assert.match(findings[0].message, /stylewright-lock/);
});

test('the guided dialogue passes over a held directory rather than parsing it', async () => {
  // The dialogue marks what is already installed, and it read every target
  // manifest to do so — including one a killed run left mid-write, which
  // reached the user as a JSON parse error rather than the lock message.
  const home = await tmp();
  const target = path.join(home, '.claude/skills');
  await installSkills({ repoRoot: REPO, targetDir: target, names: ['demo-standard'], now: NOW });
  await fs.writeFile(path.join(target, '.stylewright-lock'), '');
  await fs.writeFile(path.join(target, '.stylewright-manifest.json'), '');

  const found = await installedSkills({ home, cwd: await tmp(), scope: 'user' });
  assert.deepEqual([...found.keys()], []);
});

test('does not report a duplicate when cwd equals home', async () => {
  // user scope and project scope collapse to one path when the process runs
  // in the home directory.
  const home = await tmp();
  await installSkills({
    repoRoot: REPO,
    targetDir: path.join(home, '.claude/skills'),
    names: ['demo-standard'],
    now: NOW,
  });
  assert.deepEqual(await doctor({ repoRoot: REPO, home, cwd: home }), []);
});
