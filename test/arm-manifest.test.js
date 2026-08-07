import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  MANIFEST_NAME, armState, buildManifest, collectFiles, digestBytes, expectedFiles,
  fileProblems, manifestProblems, parseArgs, readManifest, writeArmManifest,
} from '../bench/arm-manifest.mjs';

/**
 * The arm manifest is what lets promotion tell a finished cell from wreckage.
 * Before it existed, the scorer grouped by whatever files a glob matched, so a
 * partial arm produced an ordinary median. These tests hold the two halves that
 * carry that: what the arm was meant to hold, and the digest of what it does.
 */

async function tempArm(t, files = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-arm-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, 'control');
  await fs.mkdir(dir);
  for (const [name, text] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), text);
  }
  return { root, dir };
}

const twoReps = {
  'report-1.txt': 'one', 'report-1.txt.meta': 'arm=control',
  'report-2.txt': 'two', 'report-2.txt.meta': 'arm=control',
};

test('the expected set is a sample and a sidecar, per scenario, per repetition', () => {
  assert.deepEqual(expectedFiles(['report'], 2), [
    'report-1.txt', 'report-1.txt.meta', 'report-2.txt', 'report-2.txt.meta',
  ]);
  assert.equal(expectedFiles(['report', 'correction'], 5).length, 20);
});

test('the manifest does not digest itself, nor its own staging file', async (t) => {
  const { dir } = await tempArm(t, twoReps);
  await fs.writeFile(path.join(dir, MANIFEST_NAME), '{}');
  await fs.writeFile(path.join(dir, `${MANIFEST_NAME}.part`), '{}');
  const files = await collectFiles(dir);
  assert.deepEqual(Object.keys(files).sort(), Object.keys(twoReps).sort());
});

test('a file named __proto__ still reaches the manifest', async (t) => {
  // A computed key, because a literal `__proto__:` sets the prototype instead
  // of creating a property — which is the same trap the manifest builder has to
  // avoid, one layer up.
  const { dir } = await tempArm(t, { ['__proto__']: 'payload' });
  const files = await collectFiles(dir);
  assert.deepEqual(Object.keys(files), ['__proto__']);
  assert.equal(Object.getOwnPropertyDescriptor(files, '__proto__').value, digestBytes('payload'));
});

test('an arm missing a repetition does not read as complete', async (t) => {
  const { dir } = await tempArm(t, {
    'report-1.txt': 'one', 'report-1.txt.meta': 'arm=control',
  });
  const manifest = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 2, at: 'now', files: await collectFiles(dir),
  });
  const state = armState(manifest);
  assert.deepEqual(state.missing, ['report-2.txt', 'report-2.txt.meta']);
  assert.equal(state.complete, false);
  assert.equal(state.scorable, false);
});

test('a file the plan never named is unexpected, and an error file is not', async (t) => {
  const { dir } = await tempArm(t, {
    ...twoReps, 'stray.txt': 'x', 'report-1.txt.err': 'the harness said something',
  });
  const manifest = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 2, at: 'now', files: await collectFiles(dir),
  });
  const state = armState(manifest);
  assert.deepEqual(state.unexpected, ['stray.txt']);
  assert.deepEqual(state.errored, ['report-1.txt.err']);
});

test('a complete arm carrying an error file is retained and is not scorable', async (t) => {
  const { dir } = await tempArm(t, { ...twoReps, 'report-1.txt.err': 'stderr text' });
  const manifest = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 2, at: 'now', files: await collectFiles(dir),
  });
  const state = armState(manifest);
  assert.equal(state.complete, true);
  assert.equal(state.scorable, false);
});

test('an abort is the failure shape whatever the files say', async (t) => {
  const { dir } = await tempArm(t, twoReps);
  const manifest = buildManifest({
    arm: 'control',
    scenarios: ['report'],
    reps: 2,
    at: 'now',
    abort: 'the treatment moved during report-2',
    files: await collectFiles(dir),
  });
  assert.equal(armState(manifest).complete, false);
});

test('a changed byte moves the digest, and the manifest says so', async (t) => {
  const { dir } = await tempArm(t, twoReps);
  const manifest = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 2, at: 'now', files: await collectFiles(dir),
  });
  assert.deepEqual(fileProblems(manifest, await collectFiles(dir)), []);
  await fs.writeFile(path.join(dir, 'report-1.txt'), 'one, edited');
  const problems = fileProblems(manifest, await collectFiles(dir));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /report-1\.txt does not match its recorded digest/);
});

test('a file the manifest does not name is reported, and so is one it names and lost', async (t) => {
  const { dir } = await tempArm(t, twoReps);
  const manifest = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 2, at: 'now', files: await collectFiles(dir),
  });
  await fs.rm(path.join(dir, 'report-2.txt'));
  await fs.writeFile(path.join(dir, 'planted.txt'), 'x');
  const problems = fileProblems(manifest, await collectFiles(dir));
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => /report-2\.txt is named by the manifest and is not here/.test(p)));
  assert.ok(problems.some((p) => /planted\.txt is here and the manifest does not name it/.test(p)));
});

test('a dot in an arm or scenario name is refused where the manifest is built', () => {
  // A derived figure is `<scenario>.<arm>.<statistic>.<metric>`, so a dot in
  // either name makes the identifier ambiguous the moment anybody splits it.
  const build = (over) => buildManifest({
    arm: 'control', scenarios: ['report'], reps: 1, at: 'now', files: {}, ...over,
  });
  assert.throws(() => build({ arm: 'control.v2' }), /is not a arm name/);
  assert.throws(() => build({ scenarios: ['report.long'] }), /is not a scenario name/);
  assert.doesNotThrow(() => build({ arm: 'with-skill_2' }));
  // And again on the way in, because a manifest read off disk was not
  // necessarily written by the builder.
  const problems = manifestProblems({ ...build({}), arm: 'control.v2' });
  assert.ok(problems.some((p) => /arm names the arm/.test(p)));
});

test('a malformed manifest is refused field by field', () => {
  assert.deepEqual(manifestProblems(null), ['arm manifest: not a JSON object.']);
  const problems = manifestProblems({
    kind: 'something-else', arm: '', scenarios: [], reps: 0, expected: [], files: { a: 'nope' },
  });
  assert.ok(problems.some((p) => /kind must be "arm-manifest"/.test(p)));
  assert.ok(problems.some((p) => /arm names the arm/.test(p)));
  assert.ok(problems.some((p) => /scenarios is a non-empty list/.test(p)));
  assert.ok(problems.some((p) => /reps is the repetition count/.test(p)));
  assert.ok(problems.some((p) => /at records when/.test(p)));
  assert.ok(problems.some((p) => /files\["a"\] is not a sha256 digest/.test(p)));
});

test('a manifest is written, read back, and replaced by a resumed run', async (t) => {
  const { root, dir } = await tempArm(t, twoReps);
  const first = buildManifest({
    arm: 'control',
    scenarios: ['report'],
    reps: 2,
    at: 'first',
    abort: 'stopped early',
    files: await collectFiles(dir),
  });
  await writeArmManifest(dir, first, root);
  assert.equal((await readManifest(dir)).abort, 'stopped early');

  const second = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 2, at: 'second', files: await collectFiles(dir),
  });
  await writeArmManifest(dir, second, root);
  const read = await readManifest(dir);
  assert.equal(read.abort, null);
  assert.equal(read.at, 'second');
  assert.equal(await destinationless(path.join(dir, `${MANIFEST_NAME}.part`)), true);
});

async function destinationless(p) {
  return fs.lstat(p).then(() => false, () => true);
}

test('a link at the manifest name is refused, never written through', async (t) => {
  const { root, dir } = await tempArm(t, twoReps);
  const outside = path.join(root, 'outside.json');
  await fs.writeFile(outside, 'untouched');
  try {
    await fs.symlink(outside, path.join(dir, MANIFEST_NAME));
  } catch {
    return; // A platform without symlink permission has nothing to test here.
  }
  const manifest = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 2, at: 'now', files: await collectFiles(dir),
  });
  await assert.rejects(() => writeArmManifest(dir, manifest, root), /is a symlink/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'untouched');
});

test('a staging file another run left behind is named, never cleared', async (t) => {
  const { root, dir } = await tempArm(t, twoReps);
  await fs.writeFile(path.join(dir, `${MANIFEST_NAME}.part`), 'somebody else');
  const manifest = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 2, at: 'now', files: await collectFiles(dir),
  });
  await assert.rejects(() => writeArmManifest(dir, manifest, root), /a person removes it/);
  assert.equal(await fs.readFile(path.join(dir, `${MANIFEST_NAME}.part`), 'utf8'), 'somebody else');
});

test('a manifest is never written outside the tree it describes', async (t) => {
  const { root, dir } = await tempArm(t, twoReps);
  const manifest = buildManifest({
    arm: 'control', scenarios: ['report'], reps: 2, at: 'now', files: {},
  });
  await assert.rejects(
    () => writeArmManifest(dir, manifest, path.join(root, 'elsewhere')),
    /is written under/,
  );
});

test('the command line refuses a flag in a value position, and a missing plan', () => {
  assert.throws(() => parseArgs(['dir', '--reps', '--scenarios']), /needs a value/);
  assert.throws(() => parseArgs(['--scenarios', 'report', '--reps', '5']), /name the arm directory/);
  assert.throws(() => parseArgs(['dir', '--reps', '5']), /--scenarios lists/);
  assert.throws(() => parseArgs(['dir', '--scenarios', 'report', '--reps', '0']), /positive integer/);
  assert.throws(() => parseArgs(['a', 'b', '--scenarios', 'r', '--reps', '5']), /only one arm/);
  assert.deepEqual(parseArgs(['dir', '--scenarios', 'report,correction', '--reps', '5']), {
    dir: 'dir', scenarios: ['report', 'correction'], reps: 5, abort: null,
  });
});
