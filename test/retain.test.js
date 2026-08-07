import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildManifest, collectFiles, writeArmManifest } from '../bench/arm-manifest.mjs';
import { digest } from '../bench/score.mjs';
import { checkStudy } from '../bench/study.mjs';
import { PROVENANCE, provenanceGaps, sidecarProblems } from '../bench/retain.mjs';

/**
 * Promotion is the mechanism the retention gap needed. Every figure in
 * `bench/README.md` is unaudited because `.gitignore` excluded the whole of
 * `bench/out/` and no sample behind a number survived. These tests hold the
 * named refusals, because a promotion path that promotes everything is the
 * same gap with a committed directory.
 */

const repoRoot = path.dirname(import.meta.dirname);
const retain = path.join(repoRoot, 'bench', 'retain.mjs');
const SCENARIO = 'report';
const REPS = 5;

function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [retain, ...args], { cwd: repoRoot }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr });
    });
  });
}

function metaLine(over = {}) {
  const fields = {
    arm: 'control',
    scenario: SCENARIO,
    rep: '1',
    reps: String(REPS),
    rules: '',
    system: 'none',
    system_sha: 'none',
    user_rules_sha: 'none',
    user_rules: 'none',
    prompt_sha: 'PROMPT',
    model_id: 'claude-demo-1',
    cli: '2.1.220',
    at: '2026-08-06T00:00:00Z',
    ...over,
  };
  return `${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}\n`;
}

/** An arm that promotion should accept, unless a test breaks one thing in it. */
async function tempArm(t, { name = 'control', meta = {}, samples = {} } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sw-retain-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const from = path.join(root, 'out');
  const out = path.join(root, 'samples');
  const dir = path.join(from, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(out, { recursive: true });

  const promptSha = digest(
    await fs.readFile(path.join(repoRoot, 'bench', 'prompts', `${SCENARIO}.txt`)));
  for (let rep = 1; rep <= REPS; rep += 1) {
    const sample = `${SCENARIO}-${rep}.txt`;
    await fs.writeFile(path.join(dir, sample),
      samples[sample] ?? `The guard tests raw === '' so whitespace still throws. Fixed in rep ${rep}.\n`);
    await fs.writeFile(path.join(dir, `${sample}.meta`),
      metaLine({ arm: name, rep: String(rep), prompt_sha: promptSha, ...meta }));
  }
  return { root, from, out, dir, name, promptSha };
}

async function writeManifest(dir, name, over = {}) {
  await writeArmManifest(dir, buildManifest({
    arm: name,
    scenarios: [SCENARIO],
    reps: REPS,
    at: '2026-08-06T00:00:00Z',
    files: await collectFiles(dir),
    ...over,
  }), path.dirname(dir));
}

const promote = (arm, extra = []) => run([
  '--study', '2026-08-06-demo', '--arm', arm.name, '--from', arm.from, '--out', arm.out,
  '--license-check', 'no source text is reproduced in these samples or this prompt',
  ...extra,
]);

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
});

test('two arms are read together, and each keeps its own figures', async (t) => {
  const arm = await tempArm(t);
  await writeManifest(arm.dir, arm.name);
  // A second arm, differing by its treatment, which is what makes it a contrast
  // rather than two readings of one cell.
  const second = path.join(arm.from, 'with-skill');
  await fs.mkdir(second);
  for (const file of await fs.readdir(arm.dir)) {
    if (file.endsWith('arm-manifest.json')) continue;
    const text = await fs.readFile(path.join(arm.dir, file), 'utf8');
    await fs.writeFile(path.join(second, file), file.endsWith('.meta')
      ? text.replace('arm=control', 'arm=with-skill').replace('system_sha=none', 'system_sha=abc123')
      : 'Fixed. The guard misses whitespace.\n');
  }
  await writeManifest(second, 'with-skill');

  const result = await run([
    '--study', '2026-08-06-pair', '--arm', 'control', '--arm', 'with-skill',
    '--from', arm.from, '--out', arm.out, '--license-check', 'nothing reproduced',
  ]);
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

test('a sidecar carrying an absolute system-prompt path is refused', () => {
  const problems = sidecarProblems('report-1.txt', {
    rules: '', system: '/Users/someone/skills/craft/x/SKILL.md', user_rules: 'none',
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /absolute system-prompt path/);
  assert.deepEqual(
    sidecarProblems('report-1.txt', { rules: '', system: 'skills/craft/x/SKILL.md', user_rules: 'none' }),
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
  const result = await run(['--study', '2026-08-06-demo', '--arm', 'control']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--license-check states what you checked/);
});

test('the command line refuses a bad study name, an unknown flag, and a repeated arm', async () => {
  const licensed = ['--license-check', 'x'];
  assert.match((await run(['--study', 'demo', '--arm', 'a', ...licensed])).stderr, /is <date>-<slug>/);
  assert.match((await run(['--study', '2026-08-06-d', '--nope', 'x'])).stderr, /unknown flag/);
  assert.match(
    (await run(['--study', '2026-08-06-d', '--arm', 'a', '--arm', 'a', ...licensed])).stderr,
    /an arm is promoted once/);
  assert.match((await run(['--study', '2026-08-06-d', '--arm'])).stderr, /needs a value/);
  assert.match((await run(['--arm', 'a', ...licensed])).stderr, /--study names the study/);
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
