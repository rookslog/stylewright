import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scaffoldSkill } from '../src/scaffold.js';
import { MANIFEST_NAME, writeManifest, emptyManifest } from '../src/manifest.js';
import { checkAll } from '../src/ground.js';
import { loadCatalog } from '../src/catalog.js';
import { lintText } from '../src/lint.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'sw-scaf-'));

const STD = {
  name: 'demo-guide',
  tier: 'standards',
  description: 'A demo skill for the scaffold test.',
  source: 'Demo Guide 2026',
  url: 'https://example.invalid/guide',
  license: 'CC BY 4.0',
};

test('a scaffolded standards skill passes the grounding check immediately', async () => {
  const repo = await tmp();
  await scaffoldSkill({ repoRoot: repo, ...STD });
  const all = await checkAll(repo);
  assert.deepEqual(all['demo-guide'], [],
    'a fresh scaffold must be green, or contributors learn to silence the check');
});

test('a scaffolded skill is a valid catalog entry', async () => {
  const repo = await tmp();
  await scaffoldSkill({ repoRoot: repo, ...STD });
  const cat = await loadCatalog(repo);
  assert.equal(cat.length, 1);
  assert.equal(cat[0].name, 'demo-guide');
  assert.equal(cat[0].tier, 'standards');
});

test('the grounding matrix lands outside the skill directory', async () => {
  const repo = await tmp();
  const written = await scaffoldSkill({ repoRoot: repo, ...STD });
  assert.ok(written.includes(path.join('grounding', 'standards', 'demo-guide.md')));
  const inSkill = written.filter((p) => p.includes(path.join('skills', 'standards', 'demo-guide')));
  assert.equal(inSkill.filter((p) => /grounding/i.test(p)).length, 0);
});

test('a scaffolded skill is lint clean', async () => {
  const repo = await tmp();
  await scaffoldSkill({ repoRoot: repo, ...STD });
  const text = await fs.readFile(
    path.join(repo, 'skills', 'standards', 'demo-guide', 'SKILL.md'), 'utf8');
  assert.deepEqual(lintText(text), []);
});

test('a craft skill needs no source and gets an E row', async () => {
  const repo = await tmp();
  await scaffoldSkill({
    repoRoot: repo, name: 'demo-craft', tier: 'craft', description: 'Craft demo.',
  });
  const matrix = await fs.readFile(
    path.join(repo, 'grounding', 'craft', 'demo-craft.md'), 'utf8');
  assert.match(matrix, /\| E-01 \|/);
  await assert.rejects(
    () => fs.access(path.join(repo, 'skills', 'craft', 'demo-craft', 'SOURCE.md')));
  assert.deepEqual((await checkAll(repo))['demo-craft'], []);
});

test('a standards skill without a source is refused', async () => {
  const repo = await tmp();
  await assert.rejects(
    () => scaffoldSkill({ repoRoot: repo, name: 'x-guide', tier: 'standards' }),
    /--source and --url/);
});

test('rejects a bad name and an unknown tier', async () => {
  const repo = await tmp();
  await assert.rejects(
    () => scaffoldSkill({ repoRoot: repo, ...STD, name: 'Demo_Guide' }), /kebab-case/);
  await assert.rejects(
    () => scaffoldSkill({ repoRoot: repo, ...STD, tier: 'nope' }), /Unknown tier/);
});

test('refuses to overwrite an existing skill', async () => {
  const repo = await tmp();
  await scaffoldSkill({ repoRoot: repo, ...STD });
  await assert.rejects(() => scaffoldSkill({ repoRoot: repo, ...STD }), /already exists/);
});

// The scaffold checked one path and wrote six. Each test below is a write that
// escaped, reproduced against the old code before the fix was written.

test('a symlinked grounding path is refused, and its target is untouched', async () => {
  const repo = await tmp();
  const outside = path.join(await tmp(), 'precious.md');
  await fs.writeFile(outside, 'mine\n');
  await fs.mkdir(path.join(repo, 'grounding', 'craft'), { recursive: true });
  await fs.symlink(outside, path.join(repo, 'grounding', 'craft', 'demo.md'));

  await assert.rejects(
    scaffoldSkill({ repoRoot: repo, name: 'demo', tier: 'craft', description: 'd' }),
    /already exists, as a symlink/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'mine\n');
  // Nothing partial survives the refusal.
  await assert.rejects(fs.access(path.join(repo, 'skills', 'craft', 'demo', 'SKILL.md')));
});

test('an existing grounding draft is refused rather than replaced', async () => {
  const repo = await tmp();
  const draft = path.join(repo, 'grounding', 'craft', 'demo.md');
  await fs.mkdir(path.dirname(draft), { recursive: true });
  await fs.writeFile(draft, 'half a matrix\n');

  await assert.rejects(
    scaffoldSkill({ repoRoot: repo, name: 'demo', tier: 'craft', description: 'd' }),
    /grounding\/craft\/demo\.md already exists/);
  assert.equal(await fs.readFile(draft, 'utf8'), 'half a matrix\n');
});

test('a symlinked ancestor is refused before anything is written', async () => {
  const repo = await tmp();
  const elsewhere = await tmp();
  await fs.mkdir(path.join(repo, 'skills'), { recursive: true });
  await fs.symlink(elsewhere, path.join(repo, 'skills', 'craft'));

  await assert.rejects(
    scaffoldSkill({ repoRoot: repo, name: 'demo', tier: 'craft', description: 'd' }),
    /is not a directory/);
  assert.deepEqual(await fs.readdir(elsewhere), []);
});

test('an existing skill is refused, and so is a directory holding only your files', async () => {
  const repo = await tmp();
  await scaffoldSkill({ repoRoot: repo, name: 'demo', tier: 'craft', description: 'd' });
  await assert.rejects(
    scaffoldSkill({ repoRoot: repo, name: 'demo', tier: 'craft', description: 'd' }),
    /skills\/craft\/demo already exists/);

  // Checking the leaves alone let this through. Install copies a skill
  // directory whole, so the note would ship inside the generated skill.
  const other = await tmp();
  const notes = path.join(other, 'skills', 'craft', 'demo', 'notes.md');
  await fs.mkdir(path.dirname(notes), { recursive: true });
  await fs.writeFile(notes, 'mine\n');
  await assert.rejects(
    scaffoldSkill({ repoRoot: other, name: 'demo', tier: 'craft', description: 'd' }),
    /skills\/craft\/demo already exists/);
  assert.equal(await fs.readFile(notes, 'utf8'), 'mine\n');
});

test('a manifest keeps the permissions you gave it', async () => {
  const dir = await tmp();
  await writeManifest(dir, emptyManifest());
  const abs = path.join(dir, MANIFEST_NAME);
  await fs.chmod(abs, 0o600);
  await writeManifest(dir, emptyManifest());
  assert.equal((await fs.stat(abs)).mode & 0o777, 0o600);
});

// The grounding matrix is the LAST output, and it lives outside the skill
// directory. Interfering at that write puts the change after every earlier
// output was written and recorded, which is the window these two describe.
const atLastWrite = async (repo, act, run) => {
  const original = fs.writeFile;
  const last = path.join(repo, 'grounding', 'craft', 'demo.md');
  let fired = false;
  fs.writeFile = async (...args) => {
    // Once only. `act` writes through this same patched function, so without
    // the guard it calls itself.
    if (!fired && String(args[0]) === last) {
      fired = true;
      await act();
    }
    return original.apply(fs, args);
  };
  try {
    return await run();
  } finally {
    fs.writeFile = original;
  }
};

test('rollback leaves a file another process put at the same path', async () => {
  const repo = await tmp();
  const skillMd = path.join(repo, 'skills', 'craft', 'demo', 'SKILL.md');
  const last = path.join(repo, 'grounding', 'craft', 'demo.md');

  await atLastWrite(repo, async () => {
    // Hold the original inode with a hard link before unlinking, so the new
    // file cannot be handed the same inode number and pass the identity check
    // by accident.
    await fs.link(skillMd, path.join(repo, 'held'));
    await fs.rm(skillMd);
    await fs.writeFile(skillMd, 'theirs\n');
    // And make the last write fail, AFTER the preflight passed.
    await fs.mkdir(path.dirname(last), { recursive: true });
    await fs.writeFile(last, 'mine\n');
  }, () => assert.rejects(
    scaffoldSkill({ repoRoot: repo, name: 'demo', tier: 'craft', description: 'd' })));

  // Rollback removed by remembered NAME, so it deleted whatever now stood
  // there. It compares identity now, and this file is not the one it wrote.
  assert.equal(await fs.readFile(skillMd, 'utf8'), 'theirs\n');
});

test('an ancestor swapped after the preflight stops the call', async () => {
  const repo = await tmp();
  const outside = await tmp();
  const craft = path.join(repo, 'skills', 'craft');

  await atLastWrite(repo, async () => {
    await fs.rm(craft, { recursive: true });
    await fs.symlink(outside, craft);
  }, () => assert.rejects(
    scaffoldSkill({ repoRoot: repo, name: 'demo', tier: 'craft', description: 'd' }),
    /changed while writing/));

  // Creating the chain level by level narrows the window and does not close
  // it, so the chain is read again after the last write. Nothing was written
  // through the link.
  assert.deepEqual(await fs.readdir(outside), []);
});

test('a failed scaffold leaves no directory behind, so a retry works', async () => {
  const repo = await tmp();
  const last = path.join(repo, 'grounding', 'craft', 'demo.md');

  // The collision appears AFTER the preflight, so the call fails with the
  // skill tree already created. That is the only way directories are left.
  await atLastWrite(repo, async () => {
    await fs.mkdir(path.dirname(last), { recursive: true });
    await fs.writeFile(last, 'mine\n');
  }, () => assert.rejects(
    scaffoldSkill({ repoRoot: repo, name: 'demo', tier: 'craft', description: 'd' })));

  // Rollback removed files and left skills/craft/demo standing, and the
  // directory-level collision check then refused every retry.
  await assert.rejects(fs.access(path.join(repo, 'skills', 'craft', 'demo')));
  await fs.rm(last);
  const written = await scaffoldSkill({
    repoRoot: repo, name: 'demo', tier: 'craft', description: 'd',
  });
  assert.ok(written.includes(path.join('grounding', 'craft', 'demo.md')));
});

test('a first write refuses a manifest that appeared meanwhile', async () => {
  const dir = await tmp();
  const abs = path.join(dir, MANIFEST_NAME);
  const original = fs.writeFile;
  fs.writeFile = async (...args) => {
    const out = await original.apply(fs, args);
    // Another first-time install wins the race between the check and the
    // rename. A rename would replace it and orphan that install's files.
    if (String(args[0]).endsWith('.tmp')) {
      await original.call(fs, abs, '{"schema":1,"skills":{"theirs":{"files":{}}}}\n');
    }
    return out;
  };
  try {
    await assert.rejects(writeManifest(dir, emptyManifest()), /appeared while/);
  } finally {
    fs.writeFile = original;
  }
  assert.match(await fs.readFile(abs, 'utf8'), /theirs/);
  assert.deepEqual(await fs.readdir(dir), [MANIFEST_NAME]);
});

test('rollback leaves a directory it did not create', async () => {
  const repo = await tmp();
  const outside = await tmp();
  await fs.mkdir(path.join(outside, 'demo'));

  await atLastWrite(repo, async () => {
    // Swap the ancestor for a link whose target holds a same-named directory.
    // Removing by remembered name would take the outside one.
    await fs.rm(path.join(repo, 'skills', 'craft'), { recursive: true });
    await fs.symlink(outside, path.join(repo, 'skills', 'craft'));
  }, () => assert.rejects(
    scaffoldSkill({ repoRoot: repo, name: 'demo', tier: 'craft', description: 'd' })));

  assert.deepEqual(await fs.readdir(outside), ['demo']);
});
