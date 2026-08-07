import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { checkStudy } from '../bench/study.mjs';
import { PROVENANCE, provenanceGaps, runScorer, sidecarProblems } from '../bench/retain.mjs';
import {
  LICENSE, REPS, SCENARIO, promote, retain, run, tempArm, writeManifest,
} from './bench-helpers.js';

/**
 * Promotion is the mechanism the retention gap needed. Every figure in
 * `bench/README.md` is unaudited because `.gitignore` excluded the whole of
 * `bench/out/` and no sample behind a number survived. These tests hold the
 * named refusals, because a promotion path that promotes everything is the
 * same gap with a committed directory.
 */

test('a clean arm is promoted whole, scored where it stands, and passes its own check', async (t) => {
  const arm = await tempArm(t);
  await writeManifest(arm.dir, arm.name);
  const result = await promote(arm);
  assert.equal(result.code, 0, result.stderr);

  const studyDir = path.join(arm.out, '2026-08-06-demo');
  const promotedArm = path.join(studyDir, 'arms', 'control');
  assert.equal((await fs.readdir(promotedArm)).length, REPS * 2 + 1);
  assert.ok(await fs.stat(path.join(studyDir, 'prompts', `${SCENARIO}.txt`)));

  const { problems, results } = await checkStudy(studyDir, '2026-08-06-demo');
  assert.deepEqual(problems, []);
  // The scorer ran over the promoted bytes, so a figure exists and it is the
  // scorer's own, not one this promotion typed. One arm is not a contrast, so
  // the scorer does not group, and `all` is what its own `-` column means.
  assert.ok(results[`${SCENARIO}.all.median.words`]);
  assert.equal(results[`${SCENARIO}.all.median.words`].audited, true);

  const manifest = JSON.parse(await fs.readFile(path.join(studyDir, 'study.json'), 'utf8'));
  assert.match(manifest.license_check.checked, /no source text/);
  assert.ok(manifest.provenance_gaps.some((g) => /environment class/.test(g)));
  assert.equal(manifest.arms[0].abort, null);
});

test('two arms are read together, and each keeps its own figures', async (t) => {
  const arm = await tempArm(t);
  await writeManifest(arm.dir, arm.name);
  // A second arm, differing by its treatment, which is what makes it a contrast
  // rather than two readings of one cell.
  const second = path.join(arm.from, 'with-skill');
  await fs.mkdir(second);
  for (const file of await fs.readdir(arm.dir)) {
    if (file.startsWith('arm-manifest.json')) continue;
    const text = await fs.readFile(path.join(arm.dir, file), 'utf8');
    await fs.writeFile(path.join(second, file), file.endsWith('.meta')
      ? text.replace('arm=control', 'arm=with-skill').replace('system_sha=none', 'system_sha=abc123')
      : 'Fixed. The guard misses whitespace.\n');
  }
  await writeManifest(second, 'with-skill');

  const result = await promote(arm, {
    study: '2026-08-06-pair', arms: ['control', 'with-skill'],
  });
  assert.equal(result.code, 0, result.stderr);
  const { problems, results } = await checkStudy(
    path.join(arm.out, '2026-08-06-pair'), '2026-08-06-pair');
  assert.deepEqual(problems, []);
  assert.ok(results[`${SCENARIO}.control.median.words`]);
  assert.ok(results[`${SCENARIO}.with-skill.median.words`]);
  // Never pooled. A median across two arms is the error `--compare` exists to
  // make impossible, so there is no `all` row when the scorer grouped.
  assert.equal(results[`${SCENARIO}.all.median.words`], undefined);
});

test('the promotion scorer gets the same built environment as the check', async (t) => {
  // Two spawns ship in this change and only one was built by name. This one has
  // the larger blast radius of the two, because its stdout is what gets
  // committed into `bench/samples/`.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-retain-env-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'echo-env.mjs');
  await fs.writeFile(script, 'process.stdout.write(JSON.stringify(Object.keys(process.env)));\n');
  const seen = await runScorer([script], root);
  const keys = JSON.parse(seen.stdout);
  assert.ok(!keys.includes('HOME'), `the promotion scorer saw HOME: ${keys.join(', ')}`);
  assert.ok(!keys.some((k) => /^(ANTHROPIC|CLAUDE|AWS)_/i.test(k)),
    `the promotion scorer saw a credential-adjacent name: ${keys.join(', ')}`);
});

test('an aborted arm is promoted, and the study repeats what stopped it', async (t) => {
  const arm = await tempArm(t);
  await writeManifest(arm.dir, arm.name, { abort: 'killed after report-5' });
  assert.equal((await promote(arm)).code, 0);
  const manifest = JSON.parse(
    await fs.readFile(path.join(arm.out, '2026-08-06-demo', 'study.json'), 'utf8'));
  assert.equal(manifest.arms[0].abort, 'killed after report-5');
});

test('a study is never promoted twice, because a correction is a new study', async (t) => {
  const arm = await tempArm(t);
  await writeManifest(arm.dir, arm.name);
  assert.equal((await promote(arm)).code, 0);
  const second = await promote(arm);
  assert.equal(second.code, 2);
  assert.match(second.stderr, /already exists\. A correction is a new study/);
});

test('an arm with no manifest is refused', async (t) => {
  const arm = await tempArm(t);
  const result = await promote(arm);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /has no arm-manifest\.json/);
});

test('an arm whose files moved since its manifest is refused', async (t) => {
  const arm = await tempArm(t);
  await writeManifest(arm.dir, arm.name);
  await fs.writeFile(path.join(arm.dir, `${SCENARIO}-1.txt`), 'edited after the manifest\n');
  const result = await promote(arm);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /does not match its recorded digest/);
});

test('an arm collected under --rules user is refused', async (t) => {
  const arm = await tempArm(t, { meta: { rules: 'user' } });
  await writeManifest(arm.dir, arm.name);
  const result = await promote(arm);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /collected under --rules user/);
});

test('a sidecar naming the operator\'s own rule files is refused', async (t) => {
  const arm = await tempArm(t, { meta: { user_rules: 'CLAUDE.md:abc12345,' } });
  await writeManifest(arm.dir, arm.name);
  const result = await promote(arm);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /records the operator's own rule files/);
});

test('a sidecar whose own arm name is dotted or wrong is refused', async (t) => {
  // The builder alone left this open: a hand-written sidecar reaches the scorer,
  // which prints its arm column verbatim, and a dotted name then lands inside a
  // derived result identifier that nothing can split back apart.
  const dotted = await tempArm(t, { meta: { arm: 'control.v2' } });
  await writeManifest(dotted.dir, dotted.name);
  const first = await promote(dotted);
  assert.equal(first.code, 1);
  // The dotted-name message specifically. `records arm="control.v2"` also
  // appears in the mismatch message below it, so the looser pattern passed with
  // the name check removed entirely.
  assert.match(first.stderr, /lands inside a derived result identifier/);

  // And the same field disagreeing with the arm it sits in, which is how a
  // second arm's samples would be credited to the first.
  const wrong = await tempArm(t, { meta: { arm: 'with-skill' } });
  await writeManifest(wrong.dir, wrong.name);
  const second = await promote(wrong);
  assert.equal(second.code, 1);
  assert.match(second.stderr, /records arm="with-skill" and sits in the arm "control"/);
});

test('a sidecar carrying an absolute system-prompt path is refused', () => {
  const problems = sidecarProblems('report-1.txt', {
    arm: 'control', rules: '', system: '/Users/someone/skills/craft/x/SKILL.md', user_rules: 'none',
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /absolute system-prompt path/);
  assert.deepEqual(
    sidecarProblems('report-1.txt',
      { arm: 'control', rules: '', system: 'skills/craft/x/SKILL.md', user_rules: 'none' }),
    [],
  );
  assert.match(sidecarProblems('report-1.txt', null)[0], /no \.meta sidecar/);
});

test('a sample carrying operator configuration is refused', async (t) => {
  const arm = await tempArm(t, {
    samples: { [`${SCENARIO}-2.txt`]: 'I read ~/.claude/CLAUDE.md before answering.\n' },
  });
  await writeManifest(arm.dir, arm.name);
  const result = await promote(arm);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /operator rules/);
});

test('a symbolic link inside an arm is refused, never followed', async (t) => {
  const arm = await tempArm(t);
  const outside = path.join(arm.root, 'outside.txt');
  await fs.writeFile(outside, 'not ours to promote\n');
  try {
    await fs.symlink(outside, path.join(arm.dir, 'linked.txt'));
  } catch {
    return; // A platform without symlink permission has nothing to test here.
  }
  await writeManifest(arm.dir, arm.name);
  const result = await promote(arm);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /is a symlink, and only files are promoted/);
});

test('a prompt that changed since collection is refused', async (t) => {
  const arm = await tempArm(t, { meta: { prompt_sha: 'deadbeefcafe' } });
  await writeManifest(arm.dir, arm.name);
  const result = await promote(arm);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /has changed since these samples answered it/);
});

test('nothing is promoted without a recorded license check', async () => {
  const result = await run(retain, ['--study', '2026-08-06-demo', '--arm', 'control']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--license-check states what you checked/);
});

test('the command line refuses a bad study name, an unknown flag, and a repeated arm', async () => {
  const licensed = ['--license-check', LICENSE];
  const say = async (args) => (await run(retain, args)).stderr;
  assert.match(await say(['--study', 'demo', '--arm', 'a', ...licensed]), /is <date>-<slug>/);
  assert.match(await say(['--study', '2026-08-06-d', '--nope', 'x']), /unknown flag/);
  assert.match(await say(['--study', '2026-08-06-d', '--arm', 'a', '--arm', 'a', ...licensed]),
    /an arm is promoted once/);
  assert.match(await say(['--study', '2026-08-06-d', '--arm']), /needs a value/);
  assert.match(await say(['--arm', 'a', ...licensed]), /--study names the study/);
});

test('a field no record carries is named as a gap, never filled', () => {
  const complete = {
    system_sha: 'abc', prompt_sha: 'def', model_id: 'claude-demo-1', cli: '2.1.220',
  };
  const gaps = provenanceGaps([complete, complete]);
  // The four the sidecars carry are absent from the gap list, and the five they
  // cannot are all present.
  assert.equal(gaps.length, PROVENANCE.filter((p) => !p.sidecar).length);
  assert.ok(gaps.some((g) => /^platform:/.test(g)));
  assert.ok(gaps.some((g) => /^delivery mode:/.test(g)));
  assert.ok(!gaps.some((g) => /^prompt digest:/.test(g)));

  const partial = provenanceGaps([complete, { ...complete, model_id: '' }]);
  assert.ok(partial.some((g) => /^served model build: a sidecar in this study has no model_id/.test(g)));
  assert.ok(provenanceGaps([]).some((g) => /^prompt digest:/.test(g)));
});
