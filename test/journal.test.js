import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { installSkills } from '../src/install.js';
import { readManifestWithIdentity, emptyManifest, writeManifest } from '../src/manifest.js';
import {
  recoverPending, addPending, clearPending, markCommitted, isCommitted, withdrawRecorded,
  hasPending, stagingPath, previousPath,
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

/**
 * Two spellings of one file. A case-folding target gives them for nothing, and
 * a case-sensitive one gives them through a hard link. The resolver under test
 * asks the filesystem which file a path reaches, so both answer it the same
 * way, and the case tests below discriminate on every platform rather than
 * passing vacuously on half of them.
 */
async function alias(dir, from, to) {
  if (await exists(path.join(dir, to))) return;
  await fs.link(path.join(dir, from), path.join(dir, to));
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
        write: {
          LICENSE: sha('a licence\n'), 'SKILL.md': skill, 'references/guide.md': guide,
        },
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
    pending: { 'demo-craft': { write: { 'SKILL.md': sha('what the release ships\n') } } },
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

  const done = await recoverPending(
    target, { ...manifest, pending: { 'demo-craft': { write: recorded } } });

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
    ...manifest, pending: { 'demo-craft': { write: { 'SKILL.md': theirs } } },
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
    pending: { 'demo-craft': { write: { 'SKILL.md': sha('the whole thing\n') } } },
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
    pending: { 'demo-craft': { write: { A: sha('what the release ships\n') } } },
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
    pending: { 'demo-craft': { write: { LICENSE: sha('a licence\n'), 'SKILL.md': sha('mine\n') } } },
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
    pending: { 'demo-craft': { write: { 'extra/gone.md': sha('not ours\n') } } },
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
    pending: { 'demo-craft': { write: { 'SKILL.md': theirs.skills['demo-craft'].files['SKILL.md'] } } },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.ok(await exists(path.join(other, 'demo-craft', 'SKILL.md')));
});

test('a statement is added and withdrawn without mutating the manifest', async () => {
  const before = emptyManifest();
  const stated = addPending(before, 'demo', { 'SKILL.md': sha('x') });
  assert.equal(before.pending, undefined);
  assert.deepEqual(stated.pending, { demo: { write: { 'SKILL.md': sha('x') } } });

  const cleared = clearPending(stated, 'demo');
  assert.equal(cleared.pending, undefined, 'an empty statement leaves no key behind');
  assert.deepEqual(stated.pending, { demo: { write: { 'SKILL.md': sha('x') } } });

  const two = addPending(addPending(before, 'a', { x: '1' }), 'b', { y: '2' });
  assert.deepEqual(clearPending(two, 'a').pending, { b: { write: { y: '2' } } });
});

test('a statement names what it will destroy, and only when there is something', async () => {
  // The kept half is dropped when it is empty, so a first install writes the
  // statement this engine wrote before there was a second half to state — which
  // is what keeps the conformance suite's manifests comparable.
  const before = emptyManifest();
  assert.equal(addPending(before, 'demo', { a: '1' }).pending.demo.keep, undefined);

  const both = addPending(before, 'demo', { a: '1' }, { a: '0' });
  assert.deepEqual(both.pending.demo, { write: { a: '1' }, keep: { a: '0' } });
  assert.equal(isCommitted(both.pending.demo), false);

  // The mark is applied to a manifest that already records the skill, and it
  // goes on disk in that same write. Nothing else about the statement moves.
  const forwards = markCommitted(both, 'demo');
  assert.deepEqual(forwards.pending.demo, { write: { a: '1' }, keep: { a: '0' }, committed: true });
  assert.equal(isCommitted(both.pending.demo), false, 'and the statement it came from is unchanged');
});

test('a record stops naming what a rollback could not put back', async () => {
  const manifest = {
    ...emptyManifest(),
    skills: { demo: { tier: 'craft', files: { a: '1', b: '2' } } },
  };
  assert.deepEqual(
    withdrawRecorded(manifest, 'demo', ['a']).skills.demo.files, { b: '2' });
  assert.deepEqual(manifest.skills.demo.files, { a: '1', b: '2' }, 'without mutating it');
  assert.equal(withdrawRecorded(manifest, 'demo', []), manifest, 'and nothing is a no-op');
  assert.equal(withdrawRecorded(manifest, 'demo', ['c']), manifest,
    'as is a path the record never named');
  // `constructor` is a legal skill name, and the bare lookup finds the
  // prototype's member for it — a skill with no record reading as one with a
  // record, one property up.
  assert.equal(withdrawRecorded(manifest, 'constructor', ['a']), manifest);
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
    pending: { constructor: { write: { 'SKILL.md': sha('half-installed\n') } } },
  };
  const done = await recoverPending(target, manifest);
  assert.deepEqual(done.cleared, ['constructor']);
  assert.ok(!(await exists(dir)), 'the emptied directory must be pruned');
});

test('recovery keeps a file the record names in different case', async () => {
  // An interrupted case-only rename: recorded a.md, pending A.md, same
  // content, one file. The exact-key ownership check said unrecorded, and
  // recovery deleted the file the manifest still names.
  const target = await tmp();
  const dir = path.join(target, 'demo-craft');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'a.md'), 'same bytes\n');
  await alias(dir, 'a.md', 'A.md');
  const manifest = {
    ...emptyManifest(),
    skills: {
      'demo-craft': {
        tier: 'craft',
        pathway: 'engine',
        installedAt: NOW,
        files: { 'a.md': sha('same bytes\n') },
      },
    },
    pending: { 'demo-craft': { write: { 'A.md': sha('same bytes\n') } } },
  };
  const done = await recoverPending(target, manifest);
  assert.deepEqual(done.removed, []);
  assert.ok(await exists(path.join(dir, 'A.md')),
    'the file the record still names must survive recovery');
  assert.ok(await exists(path.join(dir, 'a.md')), 'under the spelling the record uses');
});

test('recovery keeps a file the record names in another case only for its content', async () => {
  // The completion of the rule above. A forced update that changes both a
  // path's case and its bytes leaves one file holding the new bytes while the
  // record at the other spelling still holds the old hash. Identity alone kept
  // that file, and the manifest then disagreed with the disk for good: every
  // later update and uninstall reads the file as one the user edited and
  // refuses it. Deleting it costs nothing, because the record it contradicts is
  // what the next update restores from.
  const target = await tmp();
  const dir = path.join(target, 'demo-craft');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'a.md'), 'the new bytes\n');
  await alias(dir, 'a.md', 'A.md');
  const manifest = {
    ...emptyManifest(),
    skills: {
      'demo-craft': {
        tier: 'craft',
        pathway: 'engine',
        installedAt: NOW,
        files: { 'a.md': sha('the old bytes\n') },
      },
    },
    pending: { 'demo-craft': { write: { 'A.md': sha('the new bytes\n') } } },
  };

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, ['demo-craft/A.md']);
  assert.ok(!(await exists(path.join(dir, 'A.md'))), 'the stated spelling goes');
  assert.ok(
    Object.hasOwn(done.manifest.skills['demo-craft'].files, 'a.md'),
    'and the record that restores it stays');
});

test('a staging leftover goes where the recorded spelling is another file', async () => {
  // The mirror of the rule above, and the reason both ask the filesystem. A
  // legacy manifest can record a path spelled with the staging suffix. On a
  // case-sensitive target that record and the scratch file a pending copy of
  // `A` leaves are two files, and protecting the scratch one by spelling left
  // it standing for the next install to refuse as a collision with a file this
  // engine created. Where the target folds case they are one file, and it stays
  // whatever it holds.
  const target = await tmp();
  const dir = path.join(target, 'demo-craft');
  await fs.mkdir(dir, { recursive: true });
  const odd = await put(path.join(dir, 'A.STYLEWRIGHT-PART'), 'a real file\n');
  const folds = await exists(path.join(dir, 'A.stylewright-part'));
  if (!folds) await fs.writeFile(path.join(dir, 'A.stylewright-part'), 'half of a co');
  const manifest = await interrupted(target, {
    manifest: {
      schema: 1,
      skills: { 'demo-craft': { tier: 'craft', files: { 'A.STYLEWRIGHT-PART': odd } } },
    },
    pending: { 'demo-craft': { write: { A: sha('what the release ships\n') } } },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.equal(
    await fs.readFile(path.join(dir, 'A.STYLEWRIGHT-PART'), 'utf8'), 'a real file\n',
    'the recorded file is never this tool\'s scratch space');
  if (!folds) {
    assert.ok(!(await exists(path.join(dir, 'A.stylewright-part'))),
      'and the scratch file beside it is this tool\'s to remove');
  }
});

// --- The bytes a run moves aside, and the two directions a statement reads in

test('a committed statement is swept, and nothing about the tree is reversed', async () => {
  // The record has landed, so the statement points forwards. A rollback here
  // would delete the files the manifest names and put an older version over
  // them, which is the worst thing this engine could do with a statement.
  const target = await tmp();
  const dir = path.join(target, 'demo-craft');
  const now = await put(path.join(dir, 'SKILL.md'), 'the new bytes\n');
  const old = await put(previousPath(path.join(dir, 'SKILL.md')), 'the old bytes\n');
  const manifest = await interrupted(target, {
    manifest: {
      schema: 1,
      skills: { 'demo-craft': { tier: 'craft', files: { 'SKILL.md': now } } },
    },
    pending: {
      'demo-craft': {
        write: { 'SKILL.md': now }, keep: { 'SKILL.md': old }, committed: true,
      },
    },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, [], 'the recorded file stays');
  assert.deepEqual(done.restored, [], 'and the version it replaced does not come back');
  assert.equal(await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8'), 'the new bytes\n');
  assert.ok(!(await exists(previousPath(path.join(dir, 'SKILL.md')))), 'the old bytes are swept');
  assert.deepEqual(done.cleared, ['demo-craft']);
  assert.deepEqual(done.manifest.skills['demo-craft'].files, { 'SKILL.md': now });
});

test('a committed statement never puts back what its run retired', async () => {
  // Where the two directions actually differ. A retired path's destination is
  // absent and its old bytes are still under the reserved name, so a rollback
  // would put the file back — and the committed record does not name it, so
  // what comes back is an orphan no command can reach. Reading the mark is what
  // makes the sweep delete those bytes instead.
  const target = await tmp();
  const dir = path.join(target, 'demo-craft');
  const now = await put(path.join(dir, 'SKILL.md'), 'the new bytes\n');
  const gone = await put(previousPath(path.join(dir, 'references', 'gone.md')), 'retired\n');
  const manifest = await interrupted(target, {
    manifest: {
      schema: 1,
      skills: { 'demo-craft': { tier: 'craft', files: { 'SKILL.md': now } } },
    },
    pending: {
      'demo-craft': {
        write: { 'SKILL.md': now },
        keep: { 'references/gone.md': gone },
        committed: true,
      },
    },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.restored, [], 'nothing comes back');
  assert.ok(
    !(await exists(path.join(dir, 'references', 'gone.md'))),
    'the retired path stays retired');
  assert.ok(
    !(await exists(previousPath(path.join(dir, 'references', 'gone.md')))),
    'and its old bytes are swept');
  assert.deepEqual(done.manifest.skills['demo-craft'].files, { 'SKILL.md': now });
});

test('a committed statement whose bytes are already swept clears and changes nothing', async () => {
  // The last boundary: killed between the sweep and the write that withdraws
  // the statement. Everything the statement asks for has happened, so reading
  // it again must be a no-op rather than a second act.
  const target = await tmp();
  const dir = path.join(target, 'demo-craft');
  const now = await put(path.join(dir, 'SKILL.md'), 'the new bytes\n');
  const manifest = await interrupted(target, {
    manifest: {
      schema: 1,
      skills: { 'demo-craft': { tier: 'craft', files: { 'SKILL.md': now } } },
    },
    pending: {
      'demo-craft': {
        write: { 'SKILL.md': now }, keep: { 'SKILL.md': sha('the old bytes\n') }, committed: true,
      },
    },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, []);
  assert.deepEqual(done.restored, []);
  assert.deepEqual(done.cleared, ['demo-craft']);
  assert.equal(await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8'), 'the new bytes\n');
  assert.deepEqual(done.manifest.skills['demo-craft'].files, { 'SKILL.md': now });
});

test('a restore is refused where another run committed a file at that path', async () => {
  // The deletion pass keeps a file the manifest records with exactly those
  // bytes, because it is an install that stands. Putting the older version over
  // it would bury a live record's file, which is the same defect the deletion
  // rule already refuses, arriving through the other door.
  const target = await tmp();
  const dir = path.join(target, 'demo-craft');
  const theirs = await put(path.join(dir, 'SKILL.md'), 'the release that won\n');
  const old = await put(previousPath(path.join(dir, 'SKILL.md')), 'the old bytes\n');
  const manifest = await interrupted(target, {
    manifest: {
      schema: 1,
      skills: { 'demo-craft': { tier: 'craft', files: { 'SKILL.md': theirs } } },
    },
    pending: {
      'demo-craft': { write: { 'SKILL.md': theirs }, keep: { 'SKILL.md': old } },
    },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.removed, [], 'the file the record names stays');
  assert.deepEqual(done.restored, [], 'and nothing is put over it');
  assert.equal(await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8'), 'the release that won\n');
  assert.deepEqual(
    done.manifest.skills['demo-craft'].files, { 'SKILL.md': theirs },
    'so the record still names it');
});

test('a file at the reserved name that no statement identifies is left alone', async () => {
  // The one thing content cannot settle. A file there which does not hold what
  // the statement said stood at that path is not bytes this run moved, and no
  // reading of a statement makes it ours to delete or ours to install. It is
  // left, and the collision check names it at the next install — the same
  // disposition refuseStaleWrite gives the other file this tool cannot prove it
  // wrote.
  const target = await tmp();
  const dir = path.join(target, 'demo-craft');
  await put(previousPath(path.join(dir, 'SKILL.md')), 'something else entirely\n');
  const manifest = await interrupted(target, {
    pending: {
      'demo-craft': {
        write: { 'SKILL.md': sha('the new bytes\n') },
        keep: { 'SKILL.md': sha('the old bytes\n') },
      },
    },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.restored, []);
  assert.equal(
    await fs.readFile(previousPath(path.join(dir, 'SKILL.md')), 'utf8'),
    'something else entirely\n');
});

test('a record stops naming a path whose bytes a rollback cannot find', async () => {
  // The deletion half of the statement, on its own. The bytes are gone, so the
  // path cannot come back — and the record must stop claiming a file that is
  // not there, which is the over-claim issue 55 opened on.
  const target = await tmp();
  await fs.mkdir(path.join(target, 'demo-craft'), { recursive: true });
  const manifest = await interrupted(target, {
    manifest: {
      schema: 1,
      skills: {
        'demo-craft': {
          tier: 'craft',
          files: { 'SKILL.md': sha('kept\n'), 'references/gone.md': sha('retired\n') },
        },
      },
    },
    pending: {
      'demo-craft': { write: {}, keep: { 'references/gone.md': sha('retired\n') } },
    },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.restored, []);
  assert.deepEqual(
    Object.keys(done.manifest.skills['demo-craft'].files), ['SKILL.md'],
    'the record names only what is there');
});

test('a restore is not written through a symbolic link', async () => {
  // A statement is a file anyone can edit, and its kept half is a rename
  // instruction. It inherits the rule every other consumer of a recorded path
  // follows: a directory component that is a link is refused, not walked.
  const target = await tmp();
  const outsideDir = await tmp();
  await fs.mkdir(path.join(target, 'demo-craft'), { recursive: true });
  await fs.symlink(outsideDir, path.join(target, 'demo-craft', 'extra'));
  const manifest = await interrupted(target, {
    pending: {
      'demo-craft': { write: {}, keep: { 'extra/gone.md': sha('not ours\n') } },
    },
  });

  const done = await recoverPending(target, manifest);

  assert.deepEqual(done.restored, []);
  assert.deepEqual(await fs.readdir(outsideDir), [], 'nothing was written outside the tree');
});
